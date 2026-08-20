use std::sync::atomic::{AtomicU32, Ordering};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;
pub use voya_contracts::{
    AppNotice, CoreState, CoreStateEvent, LogLevel, LogLineEvent, QueryInvalidation,
    ShellTabTarget, StatisticsSnapshot, SysProxyChanged, SysProxyMode, TunChanged,
};
use voya_contracts::{
    ProxyConnectionsSnapshot, ProxyMonitorStatus, ProxyTrafficEvent, SpeedTestResult,
};

static NEXT_LOG_LINE_ID: AtomicU32 = AtomicU32::new(1);

pub fn next_log_line_id() -> u32 {
    NEXT_LOG_LINE_ID.fetch_add(1, Ordering::Relaxed)
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct InvalidateEvent {
    pub keys: Vec<QueryInvalidation>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, Event)]
#[serde(tag = "kind", content = "payload", rename_all = "camelCase")]
pub enum TransientStreamEvent {
    LogLine(LogLineEvent),
    CoreState(CoreStateEvent),
    Statistics(StatisticsSnapshot),
    SysProxyChanged(SysProxyChanged),
    TunChanged(TunChanged),
    ProxyMonitorStatus(ProxyMonitorStatus),
    ProxyTraffic(ProxyTrafficEvent),
    ProxyConnections(ProxyConnectionsSnapshot),
    SpeedtestResult(SpeedTestResult),
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, Event)]
#[serde(tag = "kind", content = "payload", rename_all = "camelCase")]
pub enum AppEvent {
    Notice(AppNotice),
    SelectTab(ShellTabTarget),
}
