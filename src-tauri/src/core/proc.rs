//! Process helpers: hidden console spawning, elevation, PID discovery.

use crate::error::{AppError, AppResult};
use std::ffi::OsStr;
use std::path::Path;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A tokio Command that never flashes a console window on Windows.
pub fn hidden_command(program: impl AsRef<OsStr>) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut c = tokio::process::Command::new(program);
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c
}

/// Run a program to completion and capture stdout+stderr as text.
pub async fn capture(program: &str, args: &[&str]) -> AppResult<(i32, String)> {
    let out = hidden_command(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .map_err(|e| AppError::msg(format!("Failed to run {program}: {e}")))?;
    let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&out.stderr));
    Ok((out.status.code().unwrap_or(-1), text))
}

pub async fn powershell(script: &str) -> AppResult<(i32, String)> {
    capture(
        "powershell.exe",
        &["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    )
    .await
}

/// Run a PowerShell script elevated (one UAC prompt). Waits for completion and returns its output.
pub async fn powershell_elevated(script: &str, work_dir: &Path) -> AppResult<String> {
    tokio::fs::create_dir_all(work_dir).await?;
    let id = uuid::Uuid::new_v4().to_string();
    let ps1 = work_dir.join(format!("elevated-{id}.ps1"));
    let log = work_dir.join(format!("elevated-{id}.log"));
    let wrapped = format!(
        "$ErrorActionPreference='Continue'\r\nStart-Transcript -Path '{}' | Out-Null\r\ntry {{\r\n{}\r\n}} catch {{ Write-Output (\"ERROR: \" + $_) }}\r\nStop-Transcript | Out-Null\r\n",
        log.display(),
        script
    );
    tokio::fs::write(&ps1, wrapped).await?;
    let launcher = format!(
        "try {{ $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','\"{}\"'); exit $p.ExitCode }} catch {{ Write-Output 'UAC_DECLINED'; exit 1223 }}",
        ps1.display()
    );
    let (code, out) = powershell(&launcher).await?;
    let transcript = tokio::fs::read_to_string(&log).await.unwrap_or_default();
    let _ = tokio::fs::remove_file(&ps1).await;
    let _ = tokio::fs::remove_file(&log).await;
    if code == 1223 || out.contains("UAC_DECLINED") {
        return Err(AppError::msg("Administrator permission was declined"));
    }
    Ok(transcript)
}

fn norm(p: &Path) -> String {
    p.to_string_lossy().replace('/', "\\").to_lowercase()
}

/// Find running ArkAscendedServer processes whose executable lives at `exe`.
pub fn find_pids_for_exe(sys: &mut System, exe: &Path) -> Vec<u32> {
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
    );
    let want = norm(exe);
    sys.processes()
        .iter()
        .filter(|(_, p)| p.exe().map(|e| norm(e) == want).unwrap_or(false))
        .map(|(pid, _)| pid.as_u32())
        .collect()
}

/// All running ArkAscendedServer.exe processes as (pid, normalised exe path) – one scan for every instance.
pub fn server_exes(sys: &mut System) -> Vec<(u32, String)> {
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        false,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
    );
    sys.processes()
        .iter()
        .filter(|(_, p)| p.name().to_string_lossy().eq_ignore_ascii_case("ArkAscendedServer.exe"))
        .filter_map(|(pid, p)| p.exe().map(|e| (pid.as_u32(), norm(e))))
        .collect()
}

pub fn pid_alive(sys: &mut System, pid: u32) -> bool {
    let p = sysinfo::Pid::from_u32(pid);
    sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[p]), true, ProcessRefreshKind::nothing());
    sys.process(p).is_some()
}

pub async fn kill_tree(pid: u32) -> AppResult<()> {
    let pid_s = pid.to_string();
    let (code, out) = capture("taskkill.exe", &["/PID", &pid_s, "/T", "/F"]).await?;
    if code != 0 && !out.contains("not found") {
        return Err(AppError::msg(format!("taskkill failed: {}", out.trim())));
    }
    Ok(())
}

/// PID owning a local port, parsed from `netstat -ano`.
pub async fn port_owner(port: u16, udp: bool) -> Option<u32> {
    let (_, out) = capture("netstat.exe", &["-ano", "-p", if udp { "UDP" } else { "TCP" }]).await.ok()?;
    let needle = format!(":{port}");
    out.lines().find_map(|l| {
        let cols: Vec<&str> = l.split_whitespace().collect();
        if cols.len() < 4 {
            return None;
        }
        let local = cols[1];
        if !local.ends_with(&needle) {
            return None;
        }
        if !udp && !l.contains("LISTENING") {
            return None;
        }
        cols.last()?.parse().ok()
    })
}

pub fn process_name(sys: &mut System, pid: u32) -> Option<String> {
    let p = sysinfo::Pid::from_u32(pid);
    sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[p]), false, ProcessRefreshKind::nothing());
    sys.process(p).map(|p| p.name().to_string_lossy().into_owned())
}
