//! CurseForge Core API client (ASA gameId 83374). Requires a user-supplied API key
//! (free from https://console.curseforge.com). The server itself downloads mods listed in `-mods=`.

use crate::error::{AppError, AppResult};
use crate::models::CURSEFORGE_GAME_ID;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const BASE: &str = "https://api.curseforge.com/v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfMod {
    pub id: u64,
    pub name: String,
    pub summary: String,
    pub logo_url: Option<String>,
    pub download_count: u64,
    pub authors: Vec<String>,
    pub date_modified: Option<String>,
    pub date_released: Option<String>,
    pub website_url: Option<String>,
    pub categories: Vec<String>,
    pub class_id: Option<u64>,
    pub is_available: bool,
    pub latest_file_name: Option<String>,
}

fn to_mod(v: &Value) -> CfMod {
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(|s| s.to_string());
    CfMod {
        id: v.get("id").and_then(|x| x.as_u64()).unwrap_or(0),
        name: s("name").unwrap_or_default(),
        summary: s("summary").unwrap_or_default(),
        logo_url: v.pointer("/logo/thumbnailUrl").and_then(|x| x.as_str()).map(String::from),
        download_count: v.get("downloadCount").and_then(|x| x.as_f64()).unwrap_or(0.0) as u64,
        authors: v
            .get("authors")
            .and_then(|a| a.as_array())
            .map(|a| a.iter().filter_map(|x| x.get("name")?.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        date_modified: s("dateModified"),
        date_released: s("dateReleased"),
        website_url: v.pointer("/links/websiteUrl").and_then(|x| x.as_str()).map(String::from),
        categories: v
            .get("categories")
            .and_then(|a| a.as_array())
            .map(|a| a.iter().filter_map(|x| x.get("name")?.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        class_id: v.get("classId").and_then(|x| x.as_u64()),
        is_available: v.get("isAvailable").and_then(|x| x.as_bool()).unwrap_or(true),
        latest_file_name: v
            .pointer("/latestFiles/0/displayName")
            .and_then(|x| x.as_str())
            .map(String::from),
    }
}

fn key_or_err(key: &str) -> AppResult<&str> {
    if key.trim().is_empty() {
        Err(AppError::msg("Add a CurseForge API key in Settings to browse mods (you can still add mods by ID)."))
    } else {
        Ok(key.trim())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub mods: Vec<CfMod>,
    pub total: u64,
}

pub async fn search(http: &reqwest::Client, key: &str, query: &str, sort: u32, index: u32) -> AppResult<SearchResult> {
    let key = key_or_err(key)?;
    let resp: Value = http
        .get(format!("{BASE}/mods/search"))
        .header("x-api-key", key)
        .header("Accept", "application/json")
        .query(&[
            ("gameId", CURSEFORGE_GAME_ID.to_string()),
            ("searchFilter", query.to_string()),
            ("sortField", sort.to_string()),
            ("sortOrder", "desc".into()),
            ("pageSize", "40".into()),
            ("index", index.to_string()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let mods = resp["data"].as_array().map(|a| a.iter().map(to_mod).collect()).unwrap_or_default();
    let total = resp.pointer("/pagination/totalCount").and_then(|x| x.as_u64()).unwrap_or(0);
    Ok(SearchResult { mods, total })
}

pub async fn get_mods(http: &reqwest::Client, key: &str, ids: &[u64]) -> AppResult<Vec<CfMod>> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let key = key_or_err(key)?;
    let resp: Value = http
        .post(format!("{BASE}/mods"))
        .header("x-api-key", key)
        .header("Accept", "application/json")
        .json(&serde_json::json!({ "modIds": ids, "filterPcOnly": false }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(resp["data"].as_array().map(|a| a.iter().map(to_mod).collect()).unwrap_or_default())
}
