//! Lossless, ARK-aware INI document.
//!
//! ARK's Unreal config files differ from "textbook" INI in a few important ways:
//! * section names are paths (`[/script/shootergame.shootergamemode]`) and are case-insensitive;
//! * keys may legitimately repeat (`OverridePlayerLevelEngramPoints=`, `ConfigOverrideItemMaxQuantity=`);
//! * keys may carry an index (`PerLevelStatsMultiplier_Player[7]=`);
//! * values may be parenthesised structs with nested quotes and parens;
//! * the server itself rewrites GameUserSettings.ini on shutdown, so we must preserve unknown
//!   lines, comments and ordering exactly.
//!
//! The document keeps every original line and only rewrites lines that were changed.

use serde::Serialize;

#[derive(Debug, Clone)]
enum Line {
    Section { name: String, raw: String },
    Pair { key: String, value: String, raw: Option<String> },
    Other(String),
}

#[derive(Debug, Clone, Default)]
pub struct IniDoc {
    lines: Vec<Line>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IniIssue {
    pub line: usize,
    pub severity: &'static str,
    pub message: String,
}

/// Decode bytes from disk: handles UTF-8 (with/without BOM) and UTF-16 LE/BE with BOM.
pub fn decode(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    let b = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    String::from_utf8_lossy(b).into_owned()
}

pub fn read_file(path: &std::path::Path) -> std::io::Result<String> {
    match std::fs::read(path) {
        Ok(b) => Ok(decode(&b)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e),
    }
}

/// Normalise line endings to CRLF (what the Windows server writes) and save as UTF-8.
pub fn write_file(path: &std::path::Path, text: &str) -> std::io::Result<()> {
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p)?;
    }
    let normalised = text.replace("\r\n", "\n").replace('\n', "\r\n");
    let tmp = path.with_extension("ini.tmp");
    std::fs::write(&tmp, normalised.as_bytes())?;
    std::fs::rename(tmp, path)
}

fn eq(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

impl IniDoc {
    pub fn parse(text: &str) -> Self {
        let mut lines = Vec::new();
        for raw in text.lines() {
            let t = raw.trim();
            if t.starts_with('[') && t.ends_with(']') && t.len() >= 2 {
                lines.push(Line::Section {
                    name: t[1..t.len() - 1].trim().to_string(),
                    raw: raw.to_string(),
                });
            } else if t.is_empty() || t.starts_with(';') || t.starts_with('#') {
                lines.push(Line::Other(raw.to_string()));
            } else if let Some(eqpos) = raw.find('=') {
                lines.push(Line::Pair {
                    key: raw[..eqpos].trim().to_string(),
                    value: raw[eqpos + 1..].to_string(),
                    raw: Some(raw.to_string()),
                });
            } else {
                lines.push(Line::Other(raw.to_string()));
            }
        }
        Self { lines }
    }

    fn section_range(&self, section: &str) -> Option<(usize, usize)> {
        let start = self
            .lines
            .iter()
            .position(|l| matches!(l, Line::Section { name, .. } if eq(name, section)))?;
        let end = self.lines[start + 1..]
            .iter()
            .position(|l| matches!(l, Line::Section { .. }))
            .map(|p| start + 1 + p)
            .unwrap_or(self.lines.len());
        Some((start, end))
    }

    pub fn get(&self, section: &str, key: &str) -> Option<String> {
        let (s, e) = self.section_range(section)?;
        self.lines[s + 1..e].iter().find_map(|l| match l {
            Line::Pair { key: k, value, .. } if eq(k, key) => Some(value.trim().to_string()),
            _ => None,
        })
    }

    /// Set a single-valued key: replaces the first occurrence, drops later duplicates,
    /// appends to the section (creating it if necessary) when absent.
    pub fn set(&mut self, section: &str, key: &str, value: &str) {
        let (s, e) = match self.section_range(section) {
            Some(r) => r,
            None => {
                if self
                    .lines
                    .last()
                    .map(|l| !matches!(l, Line::Other(t) if t.trim().is_empty()))
                    .unwrap_or(false)
                {
                    self.lines.push(Line::Other(String::new()));
                }
                self.lines.push(Line::Section {
                    name: section.to_string(),
                    raw: format!("[{section}]"),
                });
                let n = self.lines.len();
                (n - 1, n)
            }
        };
        let mut found = false;
        let mut i = s + 1;
        let mut end = e;
        let mut last_pair = s;
        while i < end {
            if let Line::Pair { key: k, .. } = &self.lines[i] {
                if eq(k, key) {
                    if !found {
                        self.lines[i] = Line::Pair {
                            key: key.to_string(),
                            value: value.to_string(),
                            raw: None,
                        };
                        found = true;
                    } else {
                        self.lines.remove(i);
                        end -= 1;
                        continue;
                    }
                }
                last_pair = i;
            }
            i += 1;
        }
        if !found {
            let at = if last_pair == s { s + 1 } else { last_pair + 1 };
            self.lines.insert(
                at,
                Line::Pair {
                    key: key.to_string(),
                    value: value.to_string(),
                    raw: None,
                },
            );
        }
    }

    pub fn remove(&mut self, section: &str, key: &str) {
        if let Some((s, e)) = self.section_range(section) {
            let mut idx = s + 1;
            let mut end = e;
            while idx < end {
                if matches!(&self.lines[idx], Line::Pair { key: k, .. } if eq(k, key)) {
                    self.lines.remove(idx);
                    end -= 1;
                } else {
                    idx += 1;
                }
            }
        }
    }

    pub fn to_text(&self) -> String {
        let mut out = String::new();
        for l in &self.lines {
            match l {
                Line::Section { raw, .. } => out.push_str(raw),
                Line::Pair { raw: Some(raw), .. } => out.push_str(raw),
                Line::Pair { key, value, raw: None } => {
                    out.push_str(key);
                    out.push('=');
                    out.push_str(value);
                }
                Line::Other(raw) => out.push_str(raw),
            }
            out.push_str("\r\n");
        }
        out
    }

    /// Structural validation mirroring what Unreal's config loader tolerates.
    pub fn validate(text: &str, repeatable: &[&str]) -> Vec<IniIssue> {
        let mut issues = Vec::new();
        let mut current: Option<String> = None;
        let mut seen_sections: Vec<String> = Vec::new();
        let mut seen_keys: std::collections::HashMap<String, usize> = Default::default();
        for (n, raw) in text.lines().enumerate() {
            let line = n + 1;
            let t = raw.trim();
            if t.is_empty() || t.starts_with(';') || t.starts_with('#') {
                continue;
            }
            if t.starts_with('[') {
                if !t.ends_with(']') {
                    issues.push(IniIssue { line, severity: "error", message: "Section header is missing a closing ']'".into() });
                    continue;
                }
                let name = t[1..t.len() - 1].trim().to_lowercase();
                if seen_sections.contains(&name) {
                    issues.push(IniIssue { line, severity: "warning", message: format!("Section [{name}] appears more than once; ARK merges them but later values win") });
                }
                seen_sections.push(name.clone());
                seen_keys.clear();
                current = Some(name);
                continue;
            }
            let Some(eqpos) = raw.find('=') else {
                issues.push(IniIssue { line, severity: "error", message: "Line is not a 'Key=Value' pair".into() });
                continue;
            };
            if current.is_none() {
                issues.push(IniIssue { line, severity: "error", message: "Setting appears before any [Section] header and will be ignored".into() });
            }
            let key = raw[..eqpos].trim();
            let value = &raw[eqpos + 1..];
            if key.is_empty() {
                issues.push(IniIssue { line, severity: "error", message: "Empty key".into() });
            }
            if raw[..eqpos].ends_with(' ') || value.starts_with(' ') {
                issues.push(IniIssue { line, severity: "warning", message: "Spaces around '=' — ARK may read the key or value incorrectly".into() });
            }
            let mut depth: i32 = 0;
            let mut in_quotes = false;
            for c in value.chars() {
                match c {
                    '"' => in_quotes = !in_quotes,
                    '(' if !in_quotes => depth += 1,
                    ')' if !in_quotes => depth -= 1,
                    _ => {}
                }
                if depth < 0 {
                    break;
                }
            }
            if in_quotes {
                issues.push(IniIssue { line, severity: "error", message: "Unterminated quote in value".into() });
            }
            if depth != 0 {
                issues.push(IniIssue { line, severity: "error", message: "Unbalanced parentheses in struct value".into() });
            }
            let base = key.split('[').next().unwrap_or(key).to_lowercase();
            let is_rep = key.contains('[') || repeatable.iter().any(|r| r.eq_ignore_ascii_case(&base));
            if !is_rep {
                let lk = key.to_lowercase();
                if let Some(prev) = seen_keys.get(&lk) {
                    issues.push(IniIssue { line, severity: "warning", message: format!("Duplicate key '{key}' (first defined on line {prev})") });
                } else {
                    seen_keys.insert(lk, line);
                }
            }
            let v = value.trim();
            if v.eq_ignore_ascii_case("true") || v.eq_ignore_ascii_case("false") {
                if v != "True" && v != "False" {
                    issues.push(IniIssue { line, severity: "info", message: "Booleans are conventionally written as True/False".into() });
                }
            }
        }
        issues
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_set() {
        let src = "[ServerSettings]\r\nXPMultiplier=2.0\r\n; note\r\n\r\n[/script/shootergame.shootergamemode]\r\nOverridePlayerLevelEngramPoints=5\r\nOverridePlayerLevelEngramPoints=6\r\n";
        let mut d = IniDoc::parse(src);
        assert_eq!(d.to_text(), src);
        d.set("serversettings", "XPMultiplier", "3.5");
        d.set("ServerSettings", "RCONEnabled", "True");
        d.set("SessionSettings", "SessionName", "My Server");
        assert_eq!(d.get("ServerSettings", "xpmultiplier").as_deref(), Some("3.5"));
        assert_eq!(d.get("SessionSettings", "SessionName").as_deref(), Some("My Server"));
        assert!(d.to_text().contains("OverridePlayerLevelEngramPoints=6"));
        d.remove("ServerSettings", "RCONEnabled");
        assert!(d.get("ServerSettings", "RCONEnabled").is_none());
    }

    #[test]
    fn validation() {
        let issues = IniDoc::validate("Orphan=1\n[S]\nA=(B=\"x\"\nA=2\nbad line\n", &[]);
        assert!(issues.iter().any(|i| i.message.contains("before any")));
        assert!(issues.iter().any(|i| i.message.contains("Unbalanced")));
        assert!(issues.iter().any(|i| i.message.contains("Duplicate")));
        assert!(issues.iter().any(|i| i.message.contains("not a")));
    }
}
