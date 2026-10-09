//! Backups and the portable `.asapack` import/export format (a zip with a manifest).

use super::ini;
use crate::error::{AppError, AppResult};
use crate::models::ServerInstance;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

pub const PACK_FORMAT: &str = "asa-server-manager-pack";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackManifest {
    pub format: String,
    pub version: u32,
    pub created_at: String,
    pub profile: ServerInstance,
    pub includes_saves: bool,
    pub includes_cluster: bool,
    pub includes_passwords: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: PathBuf,
    pub name: String,
    pub size: u64,
    pub created: i64,
}

fn collect_dir(dir: &Path, prefix: &str, skip_dirs: &[&str]) -> Vec<(PathBuf, String)> {
    let mut v = Vec::new();
    if !dir.exists() {
        return v;
    }
    for e in WalkDir::new(dir).into_iter().filter_entry(|e| {
        !(e.file_type().is_dir() && skip_dirs.iter().any(|s| e.file_name().to_string_lossy().eq_ignore_ascii_case(s)))
    }).flatten() {
        if e.file_type().is_file() {
            let name = e.file_name().to_string_lossy();
            // Transient SQLite sidecars are never consistent on their own.
            if name.ends_with("-shm") || name.ends_with("-journal") {
                continue;
            }
            let rel = e.path().strip_prefix(dir).unwrap().to_string_lossy().replace('\\', "/");
            v.push((e.path().to_path_buf(), format!("{prefix}{rel}")));
        }
    }
    v
}

fn write_zip(dest: &Path, entries: &[(PathBuf, String)], extra: &[(String, Vec<u8>)]) -> AppResult<()> {
    if let Some(p) = dest.parent() {
        std::fs::create_dir_all(p)?;
    }
    let tmp = dest.with_extension("partial");
    let f = std::fs::File::create(&tmp)?;
    let mut z = zip::ZipWriter::new(f);
    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(3))
        .large_file(true);
    for (name, bytes) in extra {
        z.start_file(name.as_str(), opts)?;
        z.write_all(bytes)?;
    }
    let mut buf = vec![0u8; 1 << 20];
    for (path, name) in entries {
        let Ok(mut src) = std::fs::File::open(path) else { continue };
        z.start_file(name.as_str(), opts)?;
        loop {
            let n = src.read(&mut buf)?;
            if n == 0 {
                break;
            }
            z.write_all(&buf[..n])?;
        }
    }
    z.finish()?;
    std::fs::rename(&tmp, dest)?;
    Ok(())
}

/// Zip the world save folder plus both config files.
pub fn create_backup(dir: &Path, inst: &ServerInstance, label: &str) -> AppResult<BackupInfo> {
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let safe_label: String = label.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
    let name = if safe_label.is_empty() {
        format!("{}_{stamp}.zip", inst.map)
    } else {
        format!("{}_{stamp}_{safe_label}.zip", inst.map)
    };
    let dest = dir.join(&name);
    let mut entries = collect_dir(&inst.save_dir(), "SavedArks/", &["_quarantine"]);
    // Rolling server snapshots are large and redundant inside a backup.
    entries.retain(|(p, _)| {
        let n = p.file_name().unwrap().to_string_lossy().to_string();
        !(n.ends_with(".ark") && n.contains('_') && n.matches('.').count() > 2)
    });
    for f in [super::server::GUS, super::server::GAME] {
        let p = inst.config_dir().join(f);
        if p.exists() {
            entries.push((p, format!("Config/{f}")));
        }
    }
    if entries.is_empty() {
        return Err(AppError::msg("Nothing to back up yet – start the server once to create a world."));
    }
    write_zip(&dest, &entries, &[])?;
    let size = std::fs::metadata(&dest)?.len();
    Ok(BackupInfo { path: dest, name, size, created: chrono::Utc::now().timestamp_millis() })
}

/// Backups found in any of `dirs` (current location first, then legacy ones), newest first.
pub fn list_backups(dirs: &[PathBuf]) -> Vec<BackupInfo> {
    let mut v: Vec<BackupInfo> = Vec::new();
    for dir in dirs {
        v.extend(list_dir(dir));
    }
    v.sort_by(|a, b| b.created.cmp(&a.created));
    v.dedup_by(|a, b| a.path == b.path);
    v
}

fn list_dir(dir: &Path) -> Vec<BackupInfo> {
    std::fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().extension().map(|x| x == "zip").unwrap_or(false))
                .map(|e| {
                    let md = e.metadata().ok();
                    BackupInfo {
                        name: e.file_name().to_string_lossy().into_owned(),
                        size: md.as_ref().map(|m| m.len()).unwrap_or(0),
                        created: md
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_millis() as i64)
                            .unwrap_or(0),
                        path: e.path(),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn prune_backups(dir: &Path, keep: usize) -> AppResult<usize> {
    // Only automatic backups rotate; manual/labelled ones are kept until the user deletes them.
    let mut autos: Vec<BackupInfo> = list_dir(dir).into_iter().filter(|b| b.name.ends_with("_auto.zip")).collect();
    autos.sort_by(|a, b| b.created.cmp(&a.created));
    let mut removed = 0;
    for b in autos.into_iter().skip(keep.max(1)) {
        {
            std::fs::remove_file(&b.path)?;
            removed += 1;
        }
    }
    Ok(removed)
}

fn extract_prefix(zip_path: &Path, prefix: &str, dest: &Path) -> AppResult<usize> {
    let f = std::fs::File::open(zip_path)?;
    let mut a = zip::ZipArchive::new(f)?;
    let mut n = 0;
    for i in 0..a.len() {
        let mut e = a.by_index(i)?;
        let Some(rel) = e.enclosed_name() else { continue };
        let rel_s = rel.to_string_lossy().replace('\\', "/");
        let Some(stripped) = rel_s.strip_prefix(prefix) else { continue };
        if stripped.is_empty() || e.is_dir() {
            continue;
        }
        let out = dest.join(stripped);
        if let Some(p) = out.parent() {
            std::fs::create_dir_all(p)?;
        }
        let mut w = std::fs::File::create(&out)?;
        std::io::copy(&mut e, &mut w)?;
        n += 1;
    }
    Ok(n)
}

/// Restore a backup zip. Current files are moved aside to `_quarantine/pre-restore-<ts>` first.
pub fn restore_backup(inst: &ServerInstance, zip_path: &Path, include_configs: bool) -> AppResult<()> {
    let save_dir = inst.save_dir();
    if save_dir.exists() {
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let aside = save_dir.join("_quarantine").join(format!("pre-restore-{stamp}"));
        std::fs::create_dir_all(&aside)?;
        for e in std::fs::read_dir(&save_dir)?.flatten() {
            if e.file_type()?.is_file() {
                std::fs::rename(e.path(), aside.join(e.file_name()))?;
            }
        }
    }
    std::fs::create_dir_all(&save_dir)?;
    extract_prefix(zip_path, "SavedArks/", &save_dir)?;
    if include_configs {
        extract_prefix(zip_path, "Config/", &inst.config_dir())?;
    }
    Ok(())
}

pub fn export_pack(
    inst: &ServerInstance,
    dest: &Path,
    include_saves: bool,
    include_cluster: bool,
    include_passwords: bool,
) -> AppResult<()> {
    let mut profile = inst.clone();
    if !include_passwords {
        profile.admin_password.clear();
        profile.server_password.clear();
        profile.spectator_password.clear();
    }
    let manifest = PackManifest {
        format: PACK_FORMAT.into(),
        version: 1,
        created_at: chrono::Utc::now().to_rfc3339(),
        profile,
        includes_saves: include_saves,
        includes_cluster: include_cluster && inst.cluster_dir.is_some(),
        includes_passwords: include_passwords,
    };
    let mut entries = Vec::new();
    for f in [super::server::GUS, super::server::GAME] {
        let p = inst.config_dir().join(f);
        if p.exists() {
            if include_passwords {
                entries.push((p, format!("Config/{f}")));
            }
        }
    }
    let mut extra = vec![("manifest.json".to_string(), serde_json::to_vec_pretty(&manifest)?)];
    if !include_passwords {
        // Strip secrets from GameUserSettings.ini before packing.
        for f in [super::server::GUS, super::server::GAME] {
            let p = inst.config_dir().join(f);
            if p.exists() {
                let mut doc = ini::IniDoc::parse(&ini::read_file(&p)?);
                for k in ["ServerAdminPassword", "ServerPassword", "SpectatorPassword"] {
                    doc.remove("ServerSettings", k);
                }
                extra.push((format!("Config/{f}"), doc.to_text().into_bytes()));
            }
        }
    }
    if include_saves {
        entries.extend(collect_dir(&inst.save_dir(), "SavedArks/", &["_quarantine"]));
    }
    if manifest.includes_cluster {
        entries.extend(collect_dir(inst.cluster_dir.as_ref().unwrap(), "Cluster/", &[]));
    }
    write_zip(dest, &entries, &extra)
}

pub fn read_manifest(path: &Path) -> AppResult<PackManifest> {
    let f = std::fs::File::open(path)?;
    let mut a = zip::ZipArchive::new(f)?;
    let mut e = a
        .by_name("manifest.json")
        .map_err(|_| AppError::msg("Not an ASA Server Manager pack (manifest.json missing)"))?;
    let mut s = String::new();
    e.read_to_string(&mut s)?;
    let m: PackManifest = serde_json::from_str(&s)?;
    if m.format != PACK_FORMAT {
        return Err(AppError::msg("Unrecognised pack format"));
    }
    Ok(m)
}

pub fn unpack_into(path: &Path, inst: &ServerInstance) -> AppResult<()> {
    extract_prefix(path, "Config/", &inst.config_dir())?;
    extract_prefix(path, "SavedArks/", &inst.save_dir())?;
    if let Some(cd) = &inst.cluster_dir {
        extract_prefix(path, "Cluster/", cd)?;
    }
    Ok(())
}
