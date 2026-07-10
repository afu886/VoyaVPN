use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn clash_list_proxies(
    state: tauri::State<'_, AppState>,
) -> Result<ClashProxiesSnapshot, AppError> {
    let config = current_config(&state)?;

    ClashManager::new()
        .proxies(&config)
        .await
        .map_err(clash_error)
}

#[tauri::command]
#[specta::specta]
pub async fn clash_test_delay(
    state: tauri::State<'_, AppState>,
    proxy_names: Vec<String>,
) -> Result<Vec<ClashDelayTestResult>, AppError> {
    validate_ipc_text_list(
        &proxy_names,
        "Clash proxy name",
        IPC_NAME_MAX_CHARS,
        AppError::Clash,
    )?;
    let config = current_config(&state)?;

    ClashManager::new()
        .test_delay(&config, proxy_names)
        .await
        .map_err(clash_error)
}

#[tauri::command]
#[specta::specta]
pub async fn clash_select_proxy<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    group_name: String,
    proxy_name: String,
) -> Result<ClashProxiesSnapshot, AppError> {
    validate_required_ipc_text(
        &group_name,
        "Clash group name",
        IPC_NAME_MAX_CHARS,
        AppError::Clash,
    )?;
    validate_required_ipc_text(
        &proxy_name,
        "Clash proxy name",
        IPC_NAME_MAX_CHARS,
        AppError::Clash,
    )?;
    let config = current_config(&state)?;
    let snapshot = ClashManager::new()
        .select_proxy(&config, &group_name, &proxy_name)
        .await
        .map_err(clash_error)?;

    emit_clash_invalidation(&app, "clash-proxy-selected")?;

    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub async fn clash_list_connections(
    state: tauri::State<'_, AppState>,
) -> Result<ClashConnectionsSnapshot, AppError> {
    let config = current_config(&state)?;

    ClashManager::new()
        .connections(&config)
        .await
        .map_err(clash_error)
}

#[tauri::command]
#[specta::specta]
pub async fn clash_close_connection<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    connection_id: Option<String>,
) -> Result<ClashConnectionsSnapshot, AppError> {
    validate_present_ipc_text(
        connection_id.as_deref(),
        "Clash connection id",
        IPC_ID_MAX_CHARS,
        AppError::Clash,
    )?;
    let config = current_config(&state)?;
    let snapshot = ClashManager::new()
        .close_connection(&config, connection_id.as_deref())
        .await
        .map_err(clash_error)?;

    emit_clash_invalidation(&app, "clash-connection-closed")?;

    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub async fn clash_set_rule_mode<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    mode: RuleMode,
) -> Result<AppConfig, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    if config.clash_ui_item.rule_mode != mode {
        if mode != RuleMode::Unchanged {
            ClashManager::new()
                .set_rule_mode(&config, mode)
                .await
                .map_err(clash_error)?;
        }
        config.clash_ui_item.rule_mode = mode;
        persist_config_if_changed(&state, &original, &config)?;
    }

    emit_clash_invalidation(&app, "clash-rule-mode-changed")?;

    Ok(config)
}

#[tauri::command]
#[specta::specta]
pub async fn clash_reload_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    path: Option<String>,
) -> Result<(), AppError> {
    validate_optional_ipc_text(
        path.as_deref(),
        "Clash config path",
        IPC_PATH_MAX_CHARS,
        AppError::Clash,
    )?;
    let config = current_config(&state)?;

    ClashManager::new()
        .reload_config(&config, path.as_deref())
        .await
        .map_err(clash_error)?;
    emit_clash_invalidation(&app, "clash-config-reloaded")?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn clash_start_monitor(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ClashMonitorStatus, AppError> {
    let config = match current_config(&state) {
        Ok(config) => config,
        Err(error) => {
            emit_clash_monitor_status(
                &app,
                &ClashMonitorStatus::failed("Clash monitor failed to read current config"),
            );
            return Err(error);
        }
    };

    match state.clash_monitor_controller().start(
        &config,
        std::sync::Arc::new(crate::TauriClashEventSink { app: app.clone() }),
    ) {
        Ok(status) => {
            emit_clash_monitor_status(&app, &status);
            Ok(status)
        }
        Err(error) => {
            let message = error.to_string();
            emit_clash_monitor_status(&app, &ClashMonitorStatus::failed(message));
            Err(clash_error(error))
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn clash_stop_monitor(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ClashMonitorStatus, AppError> {
    match state.clash_monitor_controller().stop() {
        Ok(status) => {
            emit_clash_monitor_status(&app, &status);
            Ok(status)
        }
        Err(error) => {
            let message = error.to_string();
            emit_clash_monitor_status(&app, &ClashMonitorStatus::failed(message));
            Err(clash_error(error))
        }
    }
}
