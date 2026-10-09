//! Valve A2S_INFO query (UDP). ASA itself advertises through Epic Online Services and normally
//! does not answer A2S, but many hosts front it with query proxies – so this is a best-effort probe
//! used by the dashboard's "External query" card and the diagnostics port check.

use serde::Serialize;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::time::timeout;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct A2sInfo {
    pub name: String,
    pub map: String,
    pub folder: String,
    pub game: String,
    pub players: u8,
    pub max_players: u8,
    pub bots: u8,
    pub version: String,
    pub ping_ms: u32,
}

fn cstr(buf: &[u8], pos: &mut usize) -> String {
    let start = *pos;
    while *pos < buf.len() && buf[*pos] != 0 {
        *pos += 1;
    }
    let s = String::from_utf8_lossy(&buf[start..*pos]).into_owned();
    *pos += 1;
    s
}

pub async fn query_info(host: &str, port: u16) -> Result<A2sInfo, String> {
    let sock = UdpSocket::bind("0.0.0.0:0").await.map_err(|e| e.to_string())?;
    sock.connect((host, port)).await.map_err(|e| e.to_string())?;
    let mut req = vec![0xFF, 0xFF, 0xFF, 0xFF, 0x54];
    req.extend_from_slice(b"Source Engine Query\0");
    let started = Instant::now();
    sock.send(&req).await.map_err(|e| e.to_string())?;
    let mut buf = [0u8; 1400];
    let mut n = timeout(Duration::from_secs(2), sock.recv(&mut buf))
        .await
        .map_err(|_| "No A2S response (expected for vanilla ASA, which uses EOS)".to_string())?
        .map_err(|e| e.to_string())?;
    // Challenge response: resend with the 4-byte challenge appended.
    if n >= 9 && buf[4] == 0x41 {
        let mut r2 = req.clone();
        r2.extend_from_slice(&buf[5..9]);
        sock.send(&r2).await.map_err(|e| e.to_string())?;
        n = timeout(Duration::from_secs(2), sock.recv(&mut buf))
            .await
            .map_err(|_| "A2S challenge timed out".to_string())?
            .map_err(|e| e.to_string())?;
    }
    let ping_ms = started.elapsed().as_millis() as u32;
    let b = &buf[..n];
    if n < 6 || b[4] != 0x49 {
        return Err("Unexpected A2S reply".into());
    }
    let mut p = 6;
    let name = cstr(b, &mut p);
    let map = cstr(b, &mut p);
    let folder = cstr(b, &mut p);
    let game = cstr(b, &mut p);
    p += 2; // app id
    let players = *b.get(p).unwrap_or(&0);
    let max_players = *b.get(p + 1).unwrap_or(&0);
    let bots = *b.get(p + 2).unwrap_or(&0);
    p += 7;
    let version = if p < b.len() { cstr(b, &mut p) } else { String::new() };
    Ok(A2sInfo { name, map, folder, game, players, max_players, bots, version, ping_ms })
}
