use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SpeedTestKind {
    TcpConnect,
    Latency,
    Udp,
    Download,
    Mixed,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(
    tag = "scope",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SpeedTestTarget {
    All,
    Profiles { profile_ids: Vec<String> },
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpeedTestRequest {
    pub kind: SpeedTestKind,
    pub target: SpeedTestTarget,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpeedTestResult {
    pub action: SpeedTestKind,
    pub index_id: String,
    pub delay: Option<i32>,
    pub speed: Option<f64>,
    pub message: Option<String>,
    pub ip_info: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpeedtestRunResult {
    pub action: SpeedTestKind,
    pub cancelled: bool,
    pub selected_count: u32,
    pub completed_count: u32,
    pub results: Vec<SpeedTestResult>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpeedtestStatus {
    pub running: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_contract_uses_explicit_kind_and_target() {
        let request = SpeedTestRequest {
            kind: SpeedTestKind::Latency,
            target: SpeedTestTarget::Profiles {
                profile_ids: vec!["node-1".to_string()],
            },
        };
        let value = serde_json::to_value(request).expect("serialize speed test request");

        assert_eq!(value["kind"], "latency");
        assert_eq!(value["target"]["scope"], "profiles");
        assert_eq!(value["target"]["profileIds"][0], "node-1");
    }

    #[test]
    fn speed_test_contract_rejects_retired_numeric_and_pascal_case_values() {
        assert!(serde_json::from_value::<SpeedTestKind>(serde_json::json!(1)).is_err());
        assert!(serde_json::from_value::<SpeedTestKind>(serde_json::json!("TcpConnect")).is_err());
        assert_eq!(
            serde_json::from_value::<SpeedTestKind>(serde_json::json!("tcpConnect"))
                .expect("camelCase string enum should be accepted"),
            SpeedTestKind::TcpConnect
        );
    }
}
