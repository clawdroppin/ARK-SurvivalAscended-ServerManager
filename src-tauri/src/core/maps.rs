//! Live map catalog. Steam doesn't publish level names for the dedicated-server tool (new maps
//! ship silently inside AppID 2430930), so the community-maintained map table on the ARK wiki –
//! which lists each map's `<map_name>` launch argument – is fetched, parsed and cached. The UI
//! merges it with its built-in list, so maps released after this build appear automatically.

use crate::error::{AppError, AppResult};
use crate::state::{read_json, write_json_atomic};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::LazyLock;

const SOURCE_URL: &str = "https://ark.wiki.gg/wiki/Server_configuration?action=raw";
const MAX_AGE_MS: i64 = 24 * 3600 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveMap {
    pub id: String,
    pub name: String,
    pub mod_id: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MapCatalog {
    pub maps: Vec<LiveMap>,
    pub fetched_at: Option<i64>,
    /// "live" | "cache" | "none"
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub error: Option<String>,
}

static ROW_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^\|\s*\[\[([^\]|]+)(?:\|([^\]]*))?\]\]").unwrap());
static CODE_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<code>([A-Za-z0-9_]+)</code>").unwrap());

/// Parse the "Maps" table: rows are `|[[Name]] || <code>ASA_WP</code> || <code>ASE</code>`.
pub fn parse(raw: &str) -> Vec<LiveMap> {
    let Some(start) = raw.find("=== Maps ===") else { return vec![] };
    let rest = &raw[start + 12..];
    let section = &rest[..rest.find("\n==").unwrap_or(rest.len())];
    let rows: Vec<_> = ROW_RE.captures_iter(section).map(|c| (c.get(0).unwrap().start(), c[1].trim().to_string(), c.get(2).map(|m| m.as_str().trim().to_string()))).collect();
    let mut out = Vec::new();
    for (i, (pos, target, label)) in rows.iter().enumerate() {
        let end = rows.get(i + 1).map(|r| r.0).unwrap_or(section.len());
        let row = &section[*pos..end];
        // Second column = ASA. Only the part before the next "||" belongs to it.
        let cols: Vec<&str> = row.splitn(3, "||").collect();
        let asa_col = cols.get(1).copied().unwrap_or("");
        let codes: Vec<String> = CODE_RE.captures_iter(asa_col).map(|c| c[1].to_string()).collect();
        let Some(id) = codes.iter().find(|c| c.ends_with("_WP")) else { continue };
        let mod_id = codes.iter().find_map(|c| if c.len() >= 5 && c.chars().all(|ch| ch.is_ascii_digit()) { c.parse().ok() } else { None });
        let name = label.clone().filter(|l| !l.is_empty()).unwrap_or_else(|| target.clone());
        if !out.iter().any(|m: &LiveMap| m.id.eq_ignore_ascii_case(id)) {
            out.push(LiveMap { id: id.clone(), name, mod_id });
        }
    }
    out
}

pub async fn catalog(http: &reqwest::Client, data_dir: &Path, force: bool) -> MapCatalog {
    let cache_path = data_dir.join("maps-cache.json");
    let cached: Option<MapCatalog> = read_json(&cache_path);
    let now = chrono::Utc::now().timestamp_millis();
    if let Some(c) = &cached {
        if !force && c.fetched_at.map(|t| now - t < MAX_AGE_MS).unwrap_or(false) {
            return MapCatalog { source: "cache".into(), ..c.clone() };
        }
    }
    match fetch(http).await {
        Ok(maps) => {
            let fresh = MapCatalog { maps, fetched_at: Some(now), source: "live".into(), error: None };
            let _ = write_json_atomic(&cache_path, &fresh);
            fresh
        }
        Err(e) => match cached {
            Some(c) => MapCatalog { source: "cache".into(), error: Some(e.to_string()), ..c },
            None => MapCatalog { source: "none".into(), error: Some(e.to_string()), ..Default::default() },
        },
    }
}

async fn fetch(http: &reqwest::Client) -> AppResult<Vec<LiveMap>> {
    let text = http
        .get(SOURCE_URL)
        .timeout(std::time::Duration::from_secs(12))
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    let maps = parse(&text);
    // Sanity check so a wiki layout change can never wipe the list.
    if maps.len() < 3 || !maps.iter().any(|m| m.id == "TheIsland_WP") {
        return Err(AppError::msg("Map table format not recognised"));
    }
    Ok(maps)
}

#[cfg(test)]
mod tests {
    #[test]
    fn parses_map_table() {
        let raw = "x\n=== Maps ===\n{|\n|-\n|[[The Island]] || <code>TheIsland_WP</code> || <code>TheIsland</code>\n|-\n|[[Crystal Isles]] || ''Unavailable'' || <code>CrystalIsles</code>\n|-\n|[[Club ARK]] || <code>BobsMissions_WP</code><br/>\nRequires mod <code>1005639</code>\n|| ''Does not apply''\n|-\n|[[Some Future Map|Future]] || <code>Future_WP</code> || ''Unavailable''\n|}\n== Next ==\n";
        let m = super::parse(raw);
        assert_eq!(m.len(), 3);
        assert_eq!(m[0].id, "TheIsland_WP");
        assert_eq!(m[1].id, "BobsMissions_WP");
        assert_eq!(m[1].mod_id, Some(1005639));
        assert_eq!(m[2].name, "Future");
    }
}

#[cfg(test)]
mod live_tests {
    /// `ASM_WIKI_RAW=<path to downloaded wikitext> cargo test -- --ignored live_wiki`
    #[test]
    #[ignore]
    fn live_wiki() {
        let raw = std::fs::read_to_string(std::env::var("ASM_WIKI_RAW").unwrap()).unwrap();
        for m in super::parse(&raw) {
            println!("{} | {} | {:?}", m.id, m.name, m.mod_id);
        }
    }
}
