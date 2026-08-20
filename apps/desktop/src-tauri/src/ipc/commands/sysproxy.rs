use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub fn system_proxy_status(
    state: tauri::State<'_, AppState>,
) -> Result<SystemProxyStatusResponse, AppError> {
    let config = current_config(&state)?;
    let runtime_config = app_runtime_system_proxy_config(&config, false, TargetOs::current());

    state
        .system_proxy_manager()
        .status_with_force_disable(&runtime_config.config, runtime_config.force_disable)
        .map(system_proxy_status_response)
        .map_err(sysproxy_error)
}

#[tauri::command]
#[specta::specta]
pub async fn set_system_proxy_mode<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    mode: ContractSysProxyType,
) -> Result<SystemProxyStatusResponse, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let target_os = TargetOs::current();
    if mode == ContractSysProxyType::Pac
        && !matches!(target_os, TargetOs::Windows | TargetOs::Macos)
    {
        return Err(sysproxy_error(SystemProxyManagerError::PacUnavailable(
            target_os,
        )));
    }

    config.system_proxy_item.sys_proxy_type =
        voya_app::contract_map::sysproxy_type_from_contract(mode);
    let status = apply_system_proxy(&app, &state, &config, false).map_err(sysproxy_error)?;

    persist_config_if_changed(&state, &original, &config).await?;
    emit_sysproxy_changed(&app, &status)?;
    crate::refresh_tray_menu(&app).map_err(|error| AppError::State(error.to_string()))?;

    Ok(system_proxy_status_response(status))
}
