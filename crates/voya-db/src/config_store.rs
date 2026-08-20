use std::{fs, path::PathBuf};

use serde_json::Value;
use voya_core::AppConfig;

use crate::{DbError, Result};

#[derive(Debug, Clone)]
pub struct AppConfigStore {
    path: PathBuf,
}

impl AppConfigStore {
    #[must_use]
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn load(&self) -> Result<AppConfig> {
        if !self.path.exists() {
            return Ok(AppConfig::default());
        }

        let content = fs::read_to_string(&self.path).map_err(|source| DbError::Io {
            path: self.path.clone(),
            source,
        })?;

        match serde_json::from_str(&content) {
            Ok(config) => Ok(config),
            Err(current_schema_error) => {
                let mut value = serde_json::from_str(&content).map_err(|source| DbError::Json {
                    path: self.path.clone(),
                    source,
                })?;

                if !remove_retired_voya_config_fields(&mut value) {
                    return Err(DbError::Json {
                        path: self.path.clone(),
                        source: current_schema_error,
                    });
                }

                let config = serde_json::from_value(value).map_err(|source| DbError::Json {
                    path: self.path.clone(),
                    source,
                })?;
                self.save(&config)?;
                Ok(config)
            }
        }
    }

    pub fn save(&self, config: &AppConfig) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|source| DbError::Io {
                path: parent.to_path_buf(),
                source,
            })?;
        }

        let content = serde_json::to_string_pretty(config).map_err(|source| DbError::Json {
            path: self.path.clone(),
            source,
        })?;
        let temp_path = self.path.with_extension("json.tmp");

        fs::write(&temp_path, content).map_err(|source| DbError::Io {
            path: temp_path.clone(),
            source,
        })?;
        match fs::rename(&temp_path, &self.path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                fs::remove_file(&self.path).map_err(|source| DbError::Io {
                    path: self.path.clone(),
                    source,
                })?;
                fs::rename(&temp_path, &self.path).map_err(|source| DbError::Io {
                    path: self.path.clone(),
                    source,
                })?;
            }
            Err(source) => {
                return Err(DbError::Io {
                    path: self.path.clone(),
                    source,
                });
            }
        }

        Ok(())
    }
}

fn remove_retired_voya_config_fields(value: &mut Value) -> bool {
    let mut changed = remove_object_keys(
        value,
        &[
            "KcpItem",
            "MsgUIItem",
            "Mux4RayItem",
            "CheckUpdateItem",
            "DiagnosticsItem",
            "Fragment4RayItem",
        ],
    );

    for (pointer, keys) in [
        ("/TunModeItem", &["EnableLegacyProtect"][..]),
        ("/GrpcItem", &["InitialWindowsSize"]),
        (
            "/GUIItem",
            &[
                "KeepOlderDedupl",
                "AutoUpdateInterval",
                "TrayMenuServersLimit",
                "EnableHWA",
                "EnableLog",
            ],
        ),
        (
            "/UIItem",
            &[
                "EnableAutoAdjustMainLvColWidth",
                "MainGirdHeight1",
                "MainGirdHeight2",
                "MainGirdOrientation",
                "ColorPrimaryName",
                "EnableDragDropSort",
                "DoubleClick2Activate",
                "AutoHideStartup",
                "Hide2TrayWhenClose",
                "MacOSShowInDock",
                "MainColumnItem",
                "WindowSizeItem",
            ],
        ),
        (
            "/ConstItem",
            &["CdnBaseUrl", "CdnReleaseIndexUrl", "CdnCoreManifestUrl"],
        ),
        (
            "/ProxyUIItem",
            &[
                "RuleMode",
                "EnableIPv6",
                "EnableMixinContent",
                "ProxiesSorting",
                "ProxiesAutoRefresh",
                "ProxiesAutoDelayTestInterval",
                "ConnectionsAutoRefresh",
                "ConnectionsRefreshInterval",
                "ConnectionsColumnItem",
            ],
        ),
    ] {
        if let Some(section) = value.pointer_mut(pointer) {
            changed |= remove_object_keys(section, keys);
        }
    }

    if let Some(inbounds) = value.pointer_mut("/Inbound").and_then(Value::as_array_mut) {
        for inbound in inbounds {
            changed |= remove_object_keys(inbound, &["UdpEnabled", "DestOverride", "RouteOnly"]);
        }
    }

    changed
}

fn remove_object_keys(value: &mut Value, keys: &[&str]) -> bool {
    let Some(object) = value.as_object_mut() else {
        return false;
    };

    let mut changed = false;
    for key in keys {
        changed |= object.remove(*key).is_some();
    }
    changed
}
