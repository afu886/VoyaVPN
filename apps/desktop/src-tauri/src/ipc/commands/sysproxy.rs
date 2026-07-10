use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub fn system_proxy_status(
    state: tauri::State<'_, AppState>,
) -> Result<SystemProxyStatusResponse, AppError> {
    let config = current_config(&state)?;
    let runtime_config = runtime_system_proxy_config(&config, false);

    state
        .system_proxy_manager()
        .status_with_force_disable(&runtime_config.config, runtime_config.force_disable)
        .map(system_proxy_status_response)
        .map_err(sysproxy_error)
}

#[tauri::command]
#[specta::specta]
pub fn set_system_proxy_mode<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    mode: SysProxyType,
) -> Result<SystemProxyStatusResponse, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let target_os = TargetOs::current();
    if mode == SysProxyType::Pac && !matches!(target_os, TargetOs::Windows | TargetOs::Macos) {
        return Err(sysproxy_error(SystemProxyManagerError::PacUnavailable(
            target_os,
        )));
    }

    config.system_proxy_item.sys_proxy_type = mode;
    let status = apply_system_proxy(&app, &state, &config, false).map_err(sysproxy_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_sysproxy_changed(&app, &status)?;
    crate::refresh_tray_menu(&app).map_err(|error| AppError::State(error.to_string()))?;

    Ok(system_proxy_status_response(status))
}

#[cfg(test)]
mod tests {
    use voya_core::SysProxyType;

    use super::*;

    #[test]
    fn runtime_system_proxy_config_enables_fallback_for_tun_default_clear() {
        let mut config = AppConfig::default();
        config.tun_mode_item.enable_tun = true;
        config.system_proxy_item.sys_proxy_type = SysProxyType::ForcedClear;

        let adjusted = runtime_system_proxy_config_for_os(&config, false, TargetOs::Linux);

        assert_eq!(
            adjusted.config.system_proxy_item.sys_proxy_type,
            SysProxyType::ForcedChange
        );
        assert!(!adjusted.force_disable);
        assert_eq!(
            config.system_proxy_item.sys_proxy_type,
            SysProxyType::ForcedClear
        );
    }

    #[test]
    fn runtime_system_proxy_config_preserves_explicit_modes_and_force_disable() {
        for mode in [
            SysProxyType::ForcedChange,
            SysProxyType::Unchanged,
            SysProxyType::Pac,
        ] {
            let mut config = AppConfig::default();
            config.tun_mode_item.enable_tun = true;
            config.system_proxy_item.sys_proxy_type = mode;

            let adjusted = runtime_system_proxy_config_for_os(&config, false, TargetOs::Linux);

            assert_eq!(adjusted.config.system_proxy_item.sys_proxy_type, mode);
            assert!(!adjusted.force_disable);
        }

        let mut config = AppConfig::default();
        config.tun_mode_item.enable_tun = true;
        config.system_proxy_item.sys_proxy_type = SysProxyType::ForcedClear;

        let adjusted = runtime_system_proxy_config_for_os(&config, true, TargetOs::Linux);

        assert_eq!(
            adjusted.config.system_proxy_item.sys_proxy_type,
            SysProxyType::ForcedClear
        );
        assert!(adjusted.force_disable);
    }

    #[test]
    fn runtime_system_proxy_config_skips_fallback_for_native_tun_backends() {
        for os in [TargetOs::Macos, TargetOs::Windows] {
            let mut config = AppConfig::default();
            config.tun_mode_item.enable_tun = true;
            config.system_proxy_item.sys_proxy_type = SysProxyType::ForcedClear;

            let adjusted = runtime_system_proxy_config_for_os(&config, false, os);

            assert_eq!(
                adjusted.config.system_proxy_item.sys_proxy_type,
                SysProxyType::ForcedClear
            );
            assert!(adjusted.force_disable);
        }
    }

    #[test]
    fn runtime_system_proxy_config_disables_native_tun_proxy_without_mutating_request_mode() {
        for mode in [SysProxyType::ForcedChange, SysProxyType::Pac] {
            let mut config = AppConfig::default();
            config.tun_mode_item.enable_tun = true;
            config.system_proxy_item.sys_proxy_type = mode;

            let adjusted = runtime_system_proxy_config_for_os(&config, false, TargetOs::Macos);

            assert_eq!(adjusted.config.system_proxy_item.sys_proxy_type, mode);
            assert!(adjusted.force_disable);
        }
    }

    #[test]
    fn runtime_proxy_url_uses_local_port_when_proxy_is_preferred() {
        let mut config = AppConfig::default();
        config.inbound[0].local_port = 11888;

        assert_eq!(
            runtime_proxy_url_for_os(true, None, &config, TargetOs::Macos).as_deref(),
            Some("http://127.0.0.1:11888")
        );
        assert_eq!(
            runtime_proxy_url_for_os(
                true,
                Some("  socks5://127.0.0.1:2080  ".to_string()),
                &config,
                TargetOs::Macos,
            )
            .as_deref(),
            Some("socks5://127.0.0.1:2080")
        );
    }

    #[test]
    fn runtime_proxy_url_skips_host_port_for_native_tun() {
        let mut config = AppConfig::default();
        config.tun_mode_item.enable_tun = true;

        assert_eq!(
            runtime_proxy_url_for_os(true, None, &config, TargetOs::Macos),
            None
        );
        assert_eq!(
            runtime_proxy_url_for_os(true, None, &config, TargetOs::Windows),
            None
        );
        assert_eq!(
            runtime_proxy_url_for_os(true, None, &config, TargetOs::Linux).as_deref(),
            Some("http://127.0.0.1:10808")
        );
    }
}
