use std::{
    collections::BTreeSet,
    fs, io,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_updater::UpdaterExt;
use tauri_specta::Event;
use voya_app::autostart::{AutostartManager, AutostartManagerError, AutostartStatus};
use voya_app::certificates::{
    calculate_certificate_sha256 as calculate_certificate_sha256_impl,
    fetch_certificate as fetch_certificate_impl, CertificateError, CertificateFetchRequest,
    CertificateFetchResult,
};
use voya_app::dns::{DnsManager, DnsManagerError, DnsSettings, DnsValidationIssue};
use voya_app::elevation::ElevationError;
use voya_app::exports::{
    ExportManager, ExportManagerError, ExportProfilesFormat, ExportProfilesRequest,
    ExportProfilesResult,
};
use voya_app::groups::{GroupManager, GroupManagerError};
use voya_app::hotkeys::{
    GlobalHotkeyBinding, HotkeyManager, HotkeyManagerError, HotkeyRegistrar, HotkeyStatus,
};
use voya_app::input_safety::{self, InputSafetyError};
use voya_app::presets::{
    ConfigTemplateImportOptions, ConfigTemplateImportResult, ConfigTemplateSelection,
    PresetManager, PresetManagerError,
};
use voya_app::profiles::{ProfileManager, ProfileManagerError};
use voya_app::proxy_runtime::{
    ProxyConnectionsSnapshot, ProxyDelayTestResult, ProxyGroupsSnapshot, ProxyMonitorStatus,
    ProxyRuntimeError, ProxyRuntimeManager,
};
use voya_app::qr::{QrCodeError, QrCodeImage, QrCodeManager, QrScanResult};
use voya_app::routing::{RoutingManager, RoutingManagerError};
use voya_app::runtime::{RuntimeError, RuntimeManager};
use voya_app::speedtest::{
    SpeedTestResult, SpeedtestError, SpeedtestManager, SpeedtestRunResult, SpeedtestStatus,
};
use voya_app::subscriptions::{SubscriptionManager, SubscriptionManagerError};
use voya_app::supervisor::{SupervisorConnectionState, SupervisorSnapshot};
use voya_app::sysproxy::SystemProxyManagerError;
use voya_app::templates::{FullConfigTemplateManager, FullConfigTemplateManagerError};
use voya_app::tun::{TunManager, TunManagerError, TunProviderDiagnostics, TunStatus};
use voya_app::updates::{
    ConfigSourceSettings, ResourceUpdateFile, UpdateManager, UpdateManagerError,
};
use voya_core::{
    AppConfig, CoreType, FullConfigTemplateItem, GlobalHotkey, GroupChildCandidate, GroupPreview,
    GroupValidationResult, ImportProfilesResult, KeyEventItem, MoveAction, ProfileDedupeResult,
    ProfileItem, ProfileListItem, ProfileSortKey, RoutingItem, RulesItem, SubItem,
    SubscriptionUpdateResult, SysProxyType, TrafficMode,
};
use voya_platform::{
    coreinfo::{
        copy_seed_core_asset, discover_packaged_seed_executable, get_core_info, CoreInfoError,
        CoreSeedCopyOutcome, CoreSeedCopyStatus, TargetOs,
    },
    sysproxy::SystemProxyStatus,
    tun::{tun_backend, TunBackend as PlatformTunBackend},
};

use super::events::{
    next_log_line_id, CoreState, CoreStateEvent, InvalidateEvent, LogLevel, LogLineEvent,
    QueryInvalidation, TransientStreamEvent,
};
#[cfg(debug_assertions)]
use super::events::{AppEvent, AppNotice, AppNoticeLevel, DemoRequest, DemoResponse};
use crate::AppState;

const PROFILE_IMPORT_DIR_NAME: &str = "imports";
const IPC_ID_MAX_CHARS: usize = 128;
const IPC_NAME_MAX_CHARS: usize = 256;
const IPC_FILTER_MAX_CHARS: usize = 256;
const IPC_PATH_MAX_CHARS: usize = 4096;
const IPC_PROXY_URL_MAX_CHARS: usize = 2048;
const IPC_QR_CONTENT_MAX_CHARS: usize = 4096;
const IPC_LIST_MAX_ITEMS: usize = 1024;
const MISSING_CORE_SEARCH_DIR_LABEL: &str = "application core directory";

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum AppError {
    EventEmit(String),
    Autostart(String),
    ConfigLoad(String),
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
    Template(String),
    Tun(String),
    Update(String),
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

mod app;
#[cfg(debug_assertions)]
mod demo;
mod dns;
mod groups;
mod lifecycle;
mod presets;
mod profiles;
mod proxy;
mod routing;
mod runtime;
mod speedtest;
mod subscriptions;
mod support;
mod sysproxy;
mod templates;
mod tun;
mod updates;

pub use app::*;
#[cfg(debug_assertions)]
pub use demo::*;
pub use dns::*;
pub use groups::*;
pub use presets::*;
pub use profiles::*;
pub use proxy::*;
pub use routing::*;
pub use runtime::*;
pub use speedtest::*;
pub use subscriptions::*;
pub use sysproxy::*;
pub use templates::*;
pub use tun::*;
pub use updates::*;

pub(crate) use app::register_global_hotkeys_for_config;
pub(crate) use lifecycle::emit_current_tun_status;
// Retain the prior crate-visible helper path after moduleization.
#[allow(unused_imports)]
pub(crate) use lifecycle::emit_tun_changed;
pub(crate) use support::{
    emit_core_state, emit_runtime_log, emit_statistics_zero,
    restore_system_proxy_after_native_tun_failure,
};
// Retain the prior crate-visible helper path after moduleization.
#[allow(unused_imports)]
pub(crate) use support::restore_system_proxy;
