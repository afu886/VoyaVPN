use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CoreType {
    #[default]
    SingBox,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SysProxyType {
    #[default]
    ForcedClear,
    ForcedChange,
    Unchanged,
    Pac,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerStatItem {
    pub index_id: String,
    #[specta(type = f64)]
    pub total_up: i64,
    #[specta(type = f64)]
    pub total_down: i64,
    #[specta(type = f64)]
    pub today_up: i64,
    #[specta(type = f64)]
    pub today_down: i64,
    #[specta(type = f64)]
    pub date_now: i64,
}
