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
    let mut mutation = begin_config_mutation(&state).await?;
    let original = mutation.config().clone();
    let target_os = TargetOs::current();
    if mode == ContractSysProxyType::Pac
        && !matches!(target_os, TargetOs::Windows | TargetOs::Macos)
    {
        return Err(sysproxy_error(SystemProxyManagerError::PacUnavailable(
            target_os,
        )));
    }

    mutation.config_mut().system_proxy_item.sys_proxy_type =
        voya_app::contract_map::sysproxy_type_from_contract(mode);
    let status =
        apply_system_proxy(&app, &state, mutation.config(), false).map_err(sysproxy_error)?;

    if let Err(failure) = commit_with_compensation(commit_config_mutation(mutation), || {
        apply_system_proxy(&app, &state, &original, false).map(|_| ())
    })
    .await
    {
        if let Some(compensation_error) = failure.compensation {
            report_post_commit_error(
                &app,
                "System proxy recovery failed",
                &format!(
                    "The configuration was not saved and restoring the previous system proxy mode failed: {compensation_error}"
                ),
                AppNoticeLevel::Error,
            );
        }
        return Err(failure.commit);
    }
    if let Err(error) = emit_sysproxy_changed(&app, &status) {
        report_post_commit_error(
            &app,
            "System proxy status refresh failed",
            &format!("{error:?}"),
            AppNoticeLevel::Warning,
        );
    }
    if let Err(error) = crate::refresh_tray_menu(&app) {
        report_post_commit_error(
            &app,
            "Tray refresh failed",
            &error.to_string(),
            AppNoticeLevel::Warning,
        );
    }

    Ok(system_proxy_status_response(status))
}
