//! Detects and installs everything an ASA dedicated server needs on Windows.
//!
//! * Visual C++ 2015-2022 x64 runtime – the server binary will not start without it.
//! * Amazon Root CA 1 / Amazon RSA 2048 M02 certificates – Epic Online Services (which ASA uses
//!   for its server list and crossplay) talks TLS to AWS endpoints; on fresh/Server editions of
//!   Windows these are often missing and the server silently never appears in the browser.
//! * DirectX End-User Runtime – legacy D3DX/XInput DLLs some builds and plugins still load.
//! * SteamCMD – downloads and updates the server files.
//! Plus hardware sanity checks (64-bit OS, RAM, free disk).

use super::download::download;
use super::proc::{powershell, powershell_elevated};
use super::steamcmd;
use crate::error::{AppError, AppResult};
use crate::state::{AppState, TaskReporter};
use serde::Serialize;
use std::path::Path;

const VCREDIST_URL: &str = "https://aka.ms/vs/17/release/vc_redist.x64.exe";
const DIRECTX_URL: &str =
    "https://download.microsoft.com/download/1/7/1/1718CCC4-6315-4D8E-9543-8E28A4E18C4C/dxwebsetup.exe";
const AMAZON_ROOT_CA1_URL: &str = "https://www.amazontrust.com/repository/AmazonRootCA1.cer";
const AMAZON_R2M02_URL: &str = "http://crt.r2m02.amazontrust.com/r2m02.cer";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prereq {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    /// "ok" | "missing" | "warning"
    pub status: &'static str,
    pub detail: String,
    pub required: bool,
    pub installable: bool,
}

async fn vcredist_version() -> Option<String> {
    let (code, out) = super::proc::capture(
        "reg.exe",
        &["query", r"HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64", "/v", "Version"],
    )
    .await
    .ok()?;
    if code != 0 {
        return None;
    }
    out.lines()
        .find(|l| l.contains("Version"))
        .and_then(|l| l.split_whitespace().last())
        .map(|s| s.trim_start_matches('v').to_string())
}

fn version_at_least(v: &str, major: u32, minor: u32) -> bool {
    let mut it = v.split('.').filter_map(|p| p.parse::<u32>().ok());
    let a = it.next().unwrap_or(0);
    let b = it.next().unwrap_or(0);
    (a, b) >= (major, minor)
}

async fn certs_present() -> (bool, bool) {
    let script = "$all = @(Get-ChildItem Cert:\\LocalMachine\\Root, Cert:\\LocalMachine\\CA, Cert:\\CurrentUser\\Root, Cert:\\CurrentUser\\CA -ErrorAction SilentlyContinue); \
                  $r = [bool]($all | Where-Object { $_.Subject -like '*Amazon Root CA 1*' }); \
                  $m = [bool]($all | Where-Object { $_.Subject -like '*Amazon RSA 2048 M02*' }); \
                  Write-Output \"$r|$m\"";
    match powershell(script).await {
        Ok((_, out)) => {
            let line = out.lines().find(|l| l.contains('|')).unwrap_or("False|False");
            let mut p = line.trim().split('|');
            (p.next() == Some("True"), p.next() == Some("True"))
        }
        Err(_) => (false, false),
    }
}

fn directx_present() -> bool {
    let sys = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
    let sys32 = Path::new(&sys).join("System32");
    ["d3dx11_43.dll", "xinput1_3.dll", "d3dcompiler_43.dll"].iter().all(|f| sys32.join(f).exists())
}

fn free_space_bytes(path: &Path) -> Option<u64> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let target = path.to_string_lossy().to_lowercase();
    disks
        .list()
        .iter()
        .filter(|d| target.starts_with(&d.mount_point().to_string_lossy().to_lowercase()))
        .max_by_key(|d| d.mount_point().as_os_str().len())
        .map(|d| d.available_space())
}

pub async fn check(state: &AppState) -> Vec<Prereq> {
    let mut list = Vec::new();

    let is64 = cfg!(target_arch = "x86_64");
    list.push(Prereq {
        id: "os",
        name: "64-bit Windows 10/11 or Server 2019+",
        description: "ASA's dedicated server is a 64-bit Windows binary.",
        status: if is64 { "ok" } else { "missing" },
        detail: format!("{} {}", sysinfo::System::name().unwrap_or_default(), sysinfo::System::os_version().unwrap_or_default()),
        required: true,
        installable: false,
    });

    let vc = vcredist_version().await;
    let (vc_status, vc_detail) = match &vc {
        Some(v) if version_at_least(v, 14, 30) => ("ok", format!("Installed v{v}")),
        Some(v) => ("warning", format!("v{v} is older than the 2022 runtime ASA is built against")),
        None => ("missing", "Not installed – the server executable will fail to launch".into()),
    };
    list.push(Prereq {
        id: "vcredist",
        name: "Visual C++ 2015–2022 Redistributable (x64)",
        description: "Microsoft C/C++ runtime required by ArkAscendedServer.exe.",
        status: vc_status,
        detail: vc_detail,
        required: true,
        installable: true,
    });

    let (root, m02) = certs_present().await;
    list.push(Prereq {
        id: "certs",
        name: "Amazon TLS certificates (Epic Online Services)",
        description: "Needed for the server to register with EOS and appear in the server browser.",
        status: if root && m02 { "ok" } else { "missing" },
        detail: match (root, m02) {
            (true, true) => "Amazon Root CA 1 and RSA 2048 M02 present".into(),
            (false, false) => "Both certificates missing – server may not show up in the browser".into(),
            (true, false) => "Amazon RSA 2048 M02 intermediate missing".into(),
            (false, true) => "Amazon Root CA 1 missing".into(),
        },
        required: true,
        installable: true,
    });

    let dx = directx_present();
    list.push(Prereq {
        id: "directx",
        name: "DirectX End-User Runtime (June 2010)",
        description: "Legacy D3DX/XInput libraries loaded by some server builds and plugins.",
        status: if dx { "ok" } else { "warning" },
        detail: if dx { "Legacy DirectX DLLs found".into() } else { "Not detected (recommended)".into() },
        required: false,
        installable: true,
    });

    let steam_dir = state.steamcmd_dir().await;
    let has_steam = steamcmd::exe(&steam_dir).exists();
    list.push(Prereq {
        id: "steamcmd",
        name: "SteamCMD",
        description: "Valve's command-line client used to install and update the server.",
        status: if has_steam { "ok" } else { "missing" },
        detail: if has_steam { format!("Found at {}", steam_dir.display()) } else { format!("Will be installed to {}", steam_dir.display()) },
        required: true,
        installable: true,
    });

    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let ram_gb = sys.total_memory() as f64 / 1_073_741_824.0;
    list.push(Prereq {
        id: "ram",
        name: "Memory",
        description: "Each ASA server uses roughly 10–16 GB of RAM depending on map and players.",
        status: if ram_gb >= 15.5 { "ok" } else { "warning" },
        detail: format!("{ram_gb:.1} GB installed"),
        required: false,
        installable: false,
    });

    let root_dir = state.default_install_root().await;
    let free = free_space_bytes(&root_dir).map(|b| b as f64 / 1_073_741_824.0);
    list.push(Prereq {
        id: "disk",
        name: "Free disk space",
        description: "Server files are ~15 GB; updates and backups need headroom.",
        status: match free {
            Some(f) if f >= 40.0 => "ok",
            Some(_) => "warning",
            None => "warning",
        },
        detail: match free {
            Some(f) => format!("{f:.0} GB free on {}", root_dir.display()),
            None => "Could not determine free space".into(),
        },
        required: false,
        installable: false,
    });

    list
}

/// Install the requested prerequisites. Downloads first, then performs every privileged step in a
/// single elevated PowerShell session so the user sees exactly one UAC prompt.
pub async fn install(state: &AppState, ids: &[String], r: &TaskReporter) -> AppResult<()> {
    let dl = state.data_dir.join("prereqs");
    tokio::fs::create_dir_all(&dl).await?;
    let mut script = String::new();
    let total = ids.len().max(1) as f64;

    for (i, id) in ids.iter().enumerate() {
        let base = i as f64 / total;
        match id.as_str() {
            "vcredist" => {
                r.progress("Downloading Visual C++ runtime", Some(base));
                let f = dl.join("vc_redist.x64.exe");
                download(&state.http, VCREDIST_URL, &f, Some(r), "Visual C++ runtime").await?;
                script.push_str(&format!(
                    "Write-Output 'Installing Visual C++ runtime'\r\n$p = Start-Process -FilePath '{}' -ArgumentList '/install','/quiet','/norestart' -Wait -PassThru\r\nWrite-Output (\"vcredist exit \" + $p.ExitCode)\r\n",
                    f.display()
                ));
            }
            "directx" => {
                r.progress("Downloading DirectX web installer", Some(base));
                let f = dl.join("dxwebsetup.exe");
                download(&state.http, DIRECTX_URL, &f, Some(r), "DirectX").await?;
                script.push_str(&format!(
                    "Write-Output 'Installing DirectX runtime'\r\n$p = Start-Process -FilePath '{}' -ArgumentList '/Q' -Wait -PassThru\r\nWrite-Output (\"directx exit \" + $p.ExitCode)\r\n",
                    f.display()
                ));
            }
            "certs" => {
                r.progress("Downloading Amazon certificates", Some(base));
                let root = dl.join("AmazonRootCA1.cer");
                let m02 = dl.join("r2m02.cer");
                download(&state.http, AMAZON_ROOT_CA1_URL, &root, None, "AmazonRootCA1").await?;
                download(&state.http, AMAZON_R2M02_URL, &m02, None, "r2m02").await?;
                script.push_str(&format!(
                    "Write-Output 'Importing certificates'\r\nImport-Certificate -FilePath '{}' -CertStoreLocation Cert:\\LocalMachine\\Root | Out-Null\r\nImport-Certificate -FilePath '{}' -CertStoreLocation Cert:\\LocalMachine\\CA | Out-Null\r\nWrite-Output 'certs ok'\r\n",
                    root.display(),
                    m02.display()
                ));
            }
            "steamcmd" => {
                let dir = state.steamcmd_dir().await;
                steamcmd::ensure(&state.http, &dir, r).await?;
            }
            other => return Err(AppError::msg(format!("Unknown prerequisite '{other}'"))),
        }
    }

    if !script.is_empty() {
        r.progress("Waiting for administrator approval (UAC)…", None);
        let transcript = powershell_elevated(&script, &dl).await?;
        for line in transcript.lines().filter(|l| !l.trim().is_empty() && !l.starts_with('*')) {
            r.log(line);
        }
        if let Some(l) = transcript.lines().find(|l| l.starts_with("ERROR:")) {
            return Err(AppError::msg(l.to_string()));
        }
        for (name, code_ok) in [("vcredist exit ", &["0", "1638", "3010"][..]), ("directx exit ", &["0"][..])] {
            if let Some(l) = transcript.lines().find(|l| l.contains(name)) {
                let code = l.split(name).nth(1).unwrap_or("").trim();
                if !code_ok.contains(&code) {
                    return Err(AppError::msg(format!("{} installer returned exit code {code}", name.trim_end_matches(" exit "))));
                }
            }
        }
    }
    Ok(())
}
