//! ASA world saves are SQLite databases (`<Map>.ark`). The server also keeps rolling snapshots
//! named `<Map>_DD.MM.YYYY_HH.MM.SS.ark` in the same folder. This module validates them and
//! performs safe rollbacks.

use crate::error::{AppError, AppResult};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFile {
    pub path: PathBuf,
    pub name: String,
    pub size: u64,
    pub modified: i64,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCheck {
    pub file: SaveFile,
    /// "ok" | "corrupt" | "unknown"
    pub status: String,
    pub detail: String,
}

fn modified_ms(p: &Path) -> i64 {
    std::fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn list_saves(save_dir: &Path, map: &str) -> Vec<SaveFile> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(save_dir) else { return out };
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().map(|x| x.eq_ignore_ascii_case("ark")).unwrap_or(false) {
            let name = p.file_name().unwrap().to_string_lossy().into_owned();
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(SaveFile {
                is_primary: name.eq_ignore_ascii_case(&format!("{map}.ark")),
                modified: modified_ms(&p),
                path: p,
                name,
                size,
            });
        }
    }
    out.sort_by(|a, b| b.is_primary.cmp(&a.is_primary).then(b.modified.cmp(&a.modified)));
    out
}

/// Header check plus SQLite `quick_check` on a read-only connection.
pub fn check_ark(path: &Path) -> (String, String) {
    let mut header = [0u8; 16];
    match std::fs::File::open(path).and_then(|mut f| std::io::Read::read_exact(&mut f, &mut header)) {
        Ok(_) => {}
        Err(e) => return ("corrupt".into(), format!("Unreadable or truncated: {e}")),
    }
    if &header != b"SQLite format 3\0" {
        return ("unknown".into(), "Not an SQLite save (legacy or foreign format) – skipped".into());
    }
    let conn = match Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX) {
        Ok(c) => c,
        Err(e) => return ("corrupt".into(), format!("Cannot open database: {e}")),
    };
    let _ = conn.busy_timeout(std::time::Duration::from_secs(2));
    let res: Result<Vec<String>, _> = conn
        .prepare("PRAGMA quick_check")
        .and_then(|mut s| s.query_map([], |r| r.get::<_, String>(0))?.collect());
    match res {
        Ok(rows) if rows.len() == 1 && rows[0] == "ok" => ("ok".into(), "Integrity check passed".into()),
        Ok(rows) => ("corrupt".into(), rows.into_iter().take(3).collect::<Vec<_>>().join("; ")),
        Err(e) if e.to_string().contains("locked") => ("unknown".into(), "Database is locked (server running?)".into()),
        Err(e) => ("corrupt".into(), e.to_string()),
    }
}

pub fn check_all(save_dir: &Path, map: &str) -> Vec<SaveCheck> {
    list_saves(save_dir, map)
        .into_iter()
        .map(|f| {
            let (status, detail) = check_ark(&f.path);
            SaveCheck { file: f, status, detail }
        })
        .collect()
}

/// Merge a leftover write-ahead log back into the main database (only when the server is stopped).
pub fn checkpoint_wal(ark: &Path) -> AppResult<bool> {
    let wal = PathBuf::from(format!("{}-wal", ark.display()));
    if !wal.exists() {
        return Ok(false);
    }
    let conn = Connection::open(ark)?;
    conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))?;
    Ok(true)
}

/// Moves the current primary save to a quarantine folder and promotes `snapshot` in its place.
pub fn rollback_to(save_dir: &Path, map: &str, snapshot: &Path) -> AppResult<PathBuf> {
    let (status, detail) = check_ark(snapshot);
    if status == "corrupt" {
        return Err(AppError::msg(format!("Refusing to restore a corrupt snapshot: {detail}")));
    }
    let primary = save_dir.join(format!("{map}.ark"));
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let quarantine = save_dir.join("_quarantine").join(&stamp);
    std::fs::create_dir_all(&quarantine)?;
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let f = PathBuf::from(format!("{}{suffix}", primary.display()));
        if f.exists() {
            std::fs::rename(&f, quarantine.join(f.file_name().unwrap()))?;
        }
    }
    std::fs::copy(snapshot, &primary)?;
    Ok(quarantine)
}

/// Newest snapshot (excluding the primary) that passes the integrity check.
pub fn newest_valid_snapshot(save_dir: &Path, map: &str) -> Option<PathBuf> {
    list_saves(save_dir, map)
        .into_iter()
        .filter(|f| !f.is_primary)
        .find(|f| check_ark(&f.path).0 == "ok")
        .map(|f| f.path)
}
