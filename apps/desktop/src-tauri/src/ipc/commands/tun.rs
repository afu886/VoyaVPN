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
    let mut mutation = begin_config_mutation(&state).await?;
    let status = tun_manager(&state)
        .set_enabled(mutation.config_mut(), enabled)
        .map_err(tun_error)?;
    let config = commit_config_mutation(mutation).await?;
    if let Err(error) = emit_tun_changed(&app, &status) {
        report_post_commit_error(
            &app,
            "TUN status refresh failed",
            &format!("{error:?}"),
            AppNoticeLevel::Warning,
        );
    }
    if let Err(error) =
        restart_if_connected_after_config_change(&app, &state, &config, "TUN changed").await
    {
        report_post_commit_error(
            &app,
            "TUN saved; core restart failed",
            &format!("{error:?}"),
            AppNoticeLevel::Warning,
        );
    }

    Ok(status)
}
