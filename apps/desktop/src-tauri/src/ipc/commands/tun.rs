use super::{lifecycle::*, support::*, *};

/// Trigger the one-time native authorization dialog and, on success, install
/// the passwordless elevation launcher. No admin password is stored.
#[tauri::command]
#[specta::specta]
pub fn tun_request_elevation(state: tauri::State<'_, AppState>) -> Result<TunStatus, AppError> {
    let config = current_config(&state)?;
    let current = tun_manager(&state).status(&config).map_err(tun_error)?;
    if !current.requires_elevation {
        return Ok(current);
    }

    state
        .elevation_manager()
        .request()
        .map_err(elevation_error)?;
    tun_manager(&state).status(&config).map_err(tun_error)
}

#[tauri::command]
#[specta::specta]
pub fn tun_status(state: tauri::State<'_, AppState>) -> Result<TunStatus, AppError> {
    let config = current_config(&state)?;

    tun_manager(&state).status(&config).map_err(tun_error)
}

#[tauri::command]
#[specta::specta]
pub fn tun_provider_diagnostics(
    state: tauri::State<'_, AppState>,
) -> Result<TunProviderDiagnostics, AppError> {
    tun_manager(&state)
        .provider_diagnostics()
        .map_err(tun_error)
}

#[tauri::command]
#[specta::specta]
pub async fn set_tun_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<TunStatus, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let status = tun_manager(&state)
        .set_enabled(&mut config, enabled)
        .map_err(tun_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_tun_changed(&app, &status)?;
    restart_if_connected_after_config_change(&app, &state, &config, "TUN changed").await?;

    Ok(status)
}
