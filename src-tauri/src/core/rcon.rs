//! Asynchronous Source RCON client (the protocol ASA exposes on `RCONPort`, TCP).
//!
//! Packet layout (little endian): `i32 size | i32 id | i32 type | body\0 | \0`.

use crate::error::{AppError, AppResult};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

const SERVERDATA_AUTH: i32 = 3;
const SERVERDATA_EXECCOMMAND: i32 = 2;
const SERVERDATA_AUTH_RESPONSE: i32 = 2;
const MAX_PACKET: i32 = 4096 * 16;

pub struct RconClient {
    stream: Option<TcpStream>,
    host: String,
    port: u16,
    password: String,
    next_id: i32,
}

struct Packet {
    id: i32,
    kind: i32,
    body: String,
}

impl RconClient {
    pub fn new(host: &str, port: u16, password: &str) -> Self {
        Self {
            stream: None,
            host: host.to_string(),
            port,
            password: password.to_string(),
            next_id: 1,
        }
    }

    pub fn matches(&self, port: u16, password: &str) -> bool {
        self.port == port && self.password == password
    }

    pub fn disconnect(&mut self) {
        self.stream = None;
    }

    async fn connect(&mut self) -> AppResult<()> {
        if self.password.is_empty() {
            return Err(AppError::Rcon("No admin password configured".into()));
        }
        let addr = format!("{}:{}", self.host, self.port);
        let stream = timeout(Duration::from_secs(3), TcpStream::connect(&addr))
            .await
            .map_err(|_| AppError::Rcon(format!("Timed out connecting to {addr}")))?
            .map_err(|e| AppError::Rcon(format!("Cannot connect to {addr}: {e}")))?;
        stream.set_nodelay(true).ok();
        self.stream = Some(stream);
        let id = self.alloc_id();
        let pw = self.password.clone();
        self.write_packet(id, SERVERDATA_AUTH, &pw).await?;
        // Some servers send an empty RESPONSE_VALUE before the AUTH_RESPONSE.
        for _ in 0..2 {
            let p = self.read_packet(Duration::from_secs(5)).await?;
            if p.kind == SERVERDATA_AUTH_RESPONSE {
                if p.id == -1 {
                    self.stream = None;
                    return Err(AppError::Rcon("Authentication failed – wrong admin password".into()));
                }
                return Ok(());
            }
        }
        self.stream = None;
        Err(AppError::Rcon("No authentication response from server".into()))
    }

    fn alloc_id(&mut self) -> i32 {
        self.next_id = self.next_id.wrapping_add(1).max(1);
        self.next_id
    }

    async fn write_packet(&mut self, id: i32, kind: i32, body: &str) -> AppResult<()> {
        let stream = self.stream.as_mut().ok_or_else(|| AppError::Rcon("Not connected".into()))?;
        let bytes = body.as_bytes();
        let size = (4 + 4 + bytes.len() + 2) as i32;
        let mut buf = Vec::with_capacity(size as usize + 4);
        buf.extend_from_slice(&size.to_le_bytes());
        buf.extend_from_slice(&id.to_le_bytes());
        buf.extend_from_slice(&kind.to_le_bytes());
        buf.extend_from_slice(bytes);
        buf.extend_from_slice(&[0, 0]);
        if let Err(e) = stream.write_all(&buf).await {
            self.stream = None;
            return Err(AppError::Rcon(format!("Write failed: {e}")));
        }
        Ok(())
    }

    async fn read_packet(&mut self, wait: Duration) -> AppResult<Packet> {
        let stream = self.stream.as_mut().ok_or_else(|| AppError::Rcon("Not connected".into()))?;
        let res: std::io::Result<Packet> = timeout(wait, async {
            let size = stream.read_i32_le().await?;
            if !(10..=MAX_PACKET).contains(&size) {
                return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "bad packet size"));
            }
            let mut buf = vec![0u8; size as usize];
            stream.read_exact(&mut buf).await?;
            let id = i32::from_le_bytes(buf[0..4].try_into().unwrap());
            let kind = i32::from_le_bytes(buf[4..8].try_into().unwrap());
            let body_bytes = &buf[8..buf.len().saturating_sub(2)];
            Ok(Packet { id, kind, body: String::from_utf8_lossy(body_bytes).into_owned() })
        })
        .await
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "timed out"))
        .and_then(|r| r);
        match res {
            Ok(p) => Ok(p),
            Err(e) => {
                self.stream = None;
                Err(AppError::Rcon(format!("Read failed: {e}")))
            }
        }
    }

    /// Execute a command, reconnecting once if the connection was dropped.
    pub async fn exec(&mut self, command: &str) -> AppResult<String> {
        for attempt in 0..2 {
            if self.stream.is_none() {
                self.connect().await?;
            }
            match self.exec_once(command).await {
                Ok(s) => return Ok(s),
                Err(e) if attempt == 0 => {
                    self.stream = None;
                    let _ = e;
                }
                Err(e) => return Err(e),
            }
        }
        unreachable!()
    }

    async fn exec_once(&mut self, command: &str) -> AppResult<String> {
        let id = self.alloc_id();
        self.write_packet(id, SERVERDATA_EXECCOMMAND, command).await?;
        let mut out = String::new();
        // First packet: allow slow commands (SaveWorld can take a while on big maps).
        loop {
            let p = self.read_packet(Duration::from_secs(30)).await?;
            if p.id == id {
                out.push_str(&p.body);
                break;
            }
        }
        // Drain multi-packet responses that arrive back-to-back.
        while out.len() >= 4000 {
            match self.read_packet(Duration::from_millis(150)).await {
                Ok(p) if p.id == id => out.push_str(&p.body),
                _ => break,
            }
        }
        Ok(out.trim_end().to_string())
    }
}

/// Parse ASA `ListPlayers` output: `0. Name, 0002abcdef...`
pub fn parse_players(text: &str) -> Vec<crate::models::Player> {
    text.lines()
        .filter_map(|l| {
            let l = l.trim();
            let (idx, rest) = l.split_once(". ")?;
            let index: u32 = idx.trim().parse().ok()?;
            let (name, id) = rest.rsplit_once(',')?;
            Some(crate::models::Player {
                index,
                name: name.trim().to_string(),
                eos_id: id.trim().to_string(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn players() {
        let p = super::parse_players("0. Bob, 0002a1b2c3\n1. Alice, the Great, 00029999\n");
        assert_eq!(p.len(), 2);
        assert_eq!(p[1].name, "Alice, the Great");
        assert_eq!(p[1].eos_id, "00029999");
        assert!(super::parse_players("No Players Connected").is_empty());
    }
}
