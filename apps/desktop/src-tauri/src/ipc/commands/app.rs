use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub fn app_health() -> Result<String, AppError> {
    Ok("ok".to_string())
}

#[tauri::command]
#[specta::specta]
pub fn load_app_config(state: tauri::State<'_, AppState>) -> Result<AppConfig, AppError> {
    let config = state
        .config_store()
        .load()
        .map_err(|error| AppError::ConfigLoad(error.to_string()))?;
    let mut guard = state
        .config()
        .write()
        .map_err(|_| AppError::State("app config lock is poisoned".to_string()))?;

    *guard = config.clone();

    Ok(config)
}

#[tauri::command]
#[specta::specta]
pub async fn save_app_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    config: AppConfig,
) -> Result<AppConfig, AppError> {
    let original = current_config(&state)?;
    let runtime_changed = saved_config_requires_runtime_restart(&original, &config);
    let system_proxy_changed = original.system_proxy_item != config.system_proxy_item;
    let tun_enabled_changed = original.tun_mode_item.enable_tun != config.tun_mode_item.enable_tun;

    persist_config_if_changed(&state, &original, &config)?;

    if original != config {
        if tun_enabled_changed {
            let status = tun_manager(&state).status(&config).map_err(tun_error)?;
            emit_tun_changed(&app, &status)?;
        }
        if runtime_changed {
            restart_if_connected_after_config_change(&app, &state, &config, "Config saved").await?;
        } else if system_proxy_changed {
            apply_system_proxy_if_connected_after_config_change(&app, &state, &config).await?;
        }
        crate::refresh_tray_menu(&app).map_err(|error| AppError::State(error.to_string()))?;
    }

    Ok(config)
}

#[tauri::command]
#[specta::specta]
pub async fn diagnostics_status(
    state: tauri::State<'_, AppState>,
) -> Result<DiagnosticsStatus, AppError> {
    let settings = current_diagnostics_settings(&state)?;
    let client = state.diagnostics_client();
    let client = client.lock().await;

    Ok(diagnostics_status_response(&settings, &client))
}

#[tauri::command]
#[specta::specta]
pub async fn set_diagnostics_enabled(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<DiagnosticsStatus, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    config.diagnostics_item.enabled = enabled;
    let settings = diagnostics_settings_for_config(&mut config);
    persist_config_if_changed(&state, &original, &config)?;

    let client = state.diagnostics_client();
    let mut client = client.lock().await;
    if !enabled {
        client.clear();
    }

    Ok(diagnostics_status_response(&settings, &client))
}

#[tauri::command]
#[specta::specta]
pub fn autostart_status(state: tauri::State<'_, AppState>) -> Result<AutostartStatus, AppError> {
    let config = current_config(&state)?;

    AutostartManager::new()
        .status(&config)
        .map_err(autostart_error)
}

#[tauri::command]
#[specta::specta]
pub fn set_autostart_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<AutostartStatus, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let status = AutostartManager::new()
        .set_enabled(&mut config, enabled)
        .map_err(autostart_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_app_config_invalidation(&app, "autostart-updated")?;

    Ok(status)
}

#[tauri::command]
#[specta::specta]
pub fn global_hotkey_status(state: tauri::State<'_, AppState>) -> Result<HotkeyStatus, AppError> {
    let config = current_config(&state)?;

    HotkeyManager::new(std::sync::Arc::new(voya_app::hotkeys::NoopHotkeyRegistrar))
        .status(&config)
        .map_err(hotkey_error)
}

#[tauri::command]
#[specta::specta]
pub fn save_global_hotkeys<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    settings: Vec<KeyEventItem>,
) -> Result<HotkeyStatus, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let registrar = std::sync::Arc::new(TauriHotkeyRegistrar { app: app.clone() });
    let status = HotkeyManager::new(registrar)
        .save_settings(&mut config, settings)
        .map_err(hotkey_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_app_config_invalidation(&app, "global-hotkeys-updated")?;

    Ok(status)
}

#[tauri::command]
#[specta::specta]
pub fn generate_qr_code(content: String) -> Result<QrCodeImage, AppError> {
    validate_ipc_text(
        &content,
        "QR content",
        IPC_QR_CONTENT_MAX_CHARS,
        AppError::Qr,
    )?;

    QrCodeManager.generate_svg(&content).map_err(qr_error)
}

#[tauri::command]
#[specta::specta]
pub fn scan_screen_qr() -> Result<QrScanResult, AppError> {
    Ok(QrCodeManager.scan_screen())
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_certificate(
    request: CertificateFetchRequest,
) -> Result<CertificateFetchResult, AppError> {
    validate_required_ipc_text(
        &request.address,
        "certificate address",
        IPC_NAME_MAX_CHARS,
        AppError::Certificate,
    )?;
    if let Some(server_name) = request.server_name.as_deref() {
        validate_ipc_text(
            server_name,
            "certificate server name",
            IPC_NAME_MAX_CHARS,
            AppError::Certificate,
        )?;
    }

    fetch_certificate_impl(request)
        .await
        .map_err(certificate_error)
}

#[tauri::command]
#[specta::specta]
pub fn calculate_certificate_sha256(pem: String) -> Result<Vec<String>, AppError> {
    validate_required_ipc_text(
        &pem,
        "certificate PEM",
        IPC_QR_CONTENT_MAX_CHARS * 8,
        AppError::Certificate,
    )?;

    calculate_certificate_sha256_impl(&pem).map_err(certificate_error)
}

pub(crate) fn register_global_hotkeys_for_config<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    config: &AppConfig,
) -> Result<HotkeyStatus, AppError> {
    let registrar = std::sync::Arc::new(TauriHotkeyRegistrar { app: app.clone() });

    HotkeyManager::new(registrar)
        .register_from_config(config)
        .map_err(hotkey_error)
}

#[cfg(test)]
mod tests {
    use voya_core::SysProxyType;

    use super::*;

    #[test]
    fn saved_config_restart_scope_ignores_ui_only_changes() {
        let original = AppConfig::default();
        let mut updated = original.clone();
        updated.ui_item.current_language = "zh-Hans".to_string();
        updated.gui_item.enable_log = !updated.gui_item.enable_log;

        assert!(!saved_config_requires_runtime_restart(&original, &updated));
    }

    #[test]
    fn saved_config_restart_scope_detects_tun_and_inbound_changes() {
        let original = AppConfig::default();

        let mut tun_updated = original.clone();
        tun_updated.tun_mode_item.enable_tun = true;
        assert!(saved_config_requires_runtime_restart(
            &original,
            &tun_updated
        ));

        let mut inbound_updated = original.clone();
        inbound_updated.inbound[0].local_port += 1;
        assert!(saved_config_requires_runtime_restart(
            &original,
            &inbound_updated
        ));
    }

    #[test]
    fn saved_config_restart_scope_leaves_system_proxy_for_reapply_only() {
        let original = AppConfig::default();
        let mut updated = original.clone();
        updated.system_proxy_item.sys_proxy_type = SysProxyType::ForcedChange;

        assert!(!saved_config_requires_runtime_restart(&original, &updated));
    }
}
