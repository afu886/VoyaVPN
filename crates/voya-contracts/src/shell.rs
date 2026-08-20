use serde::Serialize;
use specta::Type;

use crate::{CoreType, SysProxyType};

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum TitleBarLayout {
    Windows,
    None,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WindowChromeConfig {
    pub title_bar_layout: TitleBarLayout,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum AppError {
    EventEmit(String),
    Autostart(String),
    ConfigSave(String),
    Certificate(String),
    ProxyRuntime(String),
    Database(String),
    Dns(DnsCommandError),
    Group(String),
    Hotkey(String),
    Preset(String),
    Profile(String),
    Qr(String),
    Export(String),
    MissingCore(MissingCoreError),
    Runtime(String),
    Routing(String),
    Speedtest(String),
    Sudo(String),
    Subscription(String),
    SysProxy(String),
    State(String),
    Tun(String),
    Update(String),
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DnsValidationIssue {
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DnsCommandError {
    pub message: String,
    pub issues: Vec<DnsValidationIssue>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MissingCoreError {
    pub message: String,
    pub core_type: CoreType,
    pub search_dir: String,
    pub candidates: Vec<String>,
    pub download_url: String,
}

#[derive(Debug, Clone, Copy, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CoreSeedInstallStatus {
    Installed,
    AlreadyInstalled,
    SeedMissing,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CoreSeedInstallResult {
    pub core_type: CoreType,
    pub status: CoreSeedInstallStatus,
    pub installed_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeConnectionState {
    Disconnected,
    Connected,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatusResponse {
    pub state: RuntimeConnectionState,
    pub active_profile_id: Option<String>,
    pub main_pid: Option<u32>,
    pub pre_pid: Option<u32>,
    pub running_core_type: Option<CoreType>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AppUpdaterState {
    Ready,
    Unconfigured,
    Unsupported,
    Error,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdaterStatus {
    pub current_version: String,
    pub state: AppUpdaterState,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemProxyStatusResponse {
    pub requested_mode: SysProxyType,
    pub effective_mode: SysProxyType,
    pub pac_available: bool,
    pub proxy: Option<String>,
    pub exceptions: String,
    pub pac_url: Option<String>,
}
