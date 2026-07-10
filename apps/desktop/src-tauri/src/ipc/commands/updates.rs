use super::{support::*, *};

#[tauri::command]
#[specta::specta]
pub fn app_update_status<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<AppUpdaterStatus, AppError> {
    let current_version = app.package_info().version.to_string();

    Ok(match app.updater() {
        Ok(_) => AppUpdaterStatus {
            current_version,
            state: AppUpdaterState::Ready,
            message: None,
        },
        Err(error) => AppUpdaterStatus {
            current_version,
            state: app_updater_state_for_error(&error),
            message: Some(error.to_string()),
        },
    })
}

#[tauri::command]
#[specta::specta]
pub fn record_app_update_diagnostic(
    state: tauri::State<'_, AppState>,
    action: AppUpdateDiagnosticAction,
    result: AppUpdateDiagnosticResult,
    message: Option<String>,
) -> Result<(), AppError> {
    validate_optional_ipc_text(
        message.as_deref(),
        "app update diagnostic message",
        IPC_PROXY_URL_MAX_CHARS,
        AppError::Update,
    )?;
    let config = current_config(&state)?;
    let diagnostics_result = diagnostics_result_for_app_update_diagnostic(result);
    let error_class = match result {
        AppUpdateDiagnosticResult::Failure => Some(diagnostics_error_class_for_app_update_message(
            action,
            message.as_deref(),
        )),
        AppUpdateDiagnosticResult::Success | AppUpdateDiagnosticResult::Skipped => None,
    };
    let event = match action {
        AppUpdateDiagnosticAction::Check => {
            DiagnosticsEvent::update_check(diagnostics_result, error_class)
        }
        AppUpdateDiagnosticAction::Install => {
            DiagnosticsEvent::app_update_install(diagnostics_result, error_class)
        }
    };
    record_diagnostics_event(&state, &config, event);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn update_status(state: tauri::State<'_, AppState>) -> Result<UpdateStatus, AppError> {
    let config = current_config(&state)?;

    Ok(update_manager(&state).status(&config))
}

#[tauri::command]
#[specta::specta]
pub fn save_update_preferences(
    state: tauri::State<'_, AppState>,
    pre_release: bool,
    selected_target_ids: Vec<String>,
) -> Result<UpdateStatus, AppError> {
    validate_ipc_text_list(
        &selected_target_ids,
        "update target id",
        IPC_ID_MAX_CHARS,
        AppError::Update,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let manager = update_manager(&state);
    manager.save_preferences(&mut config, pre_release, selected_target_ids);
    persist_config_if_changed(&state, &original, &config)?;

    Ok(manager.status(&config))
}

#[tauri::command]
#[specta::specta]
pub fn load_ruleset_geo_sources(
    state: tauri::State<'_, AppState>,
) -> Result<RulesetGeoSourceSettings, AppError> {
    let config = current_config(&state)?;

    Ok(update_manager(&state).source_settings(&config))
}

#[tauri::command]
#[specta::specta]
pub fn save_ruleset_geo_sources(
    state: tauri::State<'_, AppState>,
    settings: RulesetGeoSourceSettings,
) -> Result<RulesetGeoSourceSettings, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let manager = update_manager(&state);
    let saved = manager.save_source_settings(&mut config, settings);
    persist_config_if_changed(&state, &original, &config)?;

    Ok(saved)
}

#[tauri::command]
#[specta::specta]
pub async fn check_updates(
    state: tauri::State<'_, AppState>,
    pre_release: bool,
    selected_target_ids: Vec<String>,
    prefer_proxy: bool,
    proxy_url: Option<String>,
) -> Result<UpdateRunResult, AppError> {
    validate_ipc_text_list(
        &selected_target_ids,
        "update target id",
        IPC_ID_MAX_CHARS,
        AppError::Update,
    )?;
    validate_optional_ipc_text(
        proxy_url.as_deref(),
        "proxy URL",
        IPC_PROXY_URL_MAX_CHARS,
        AppError::Update,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let manager = update_manager(&state);
    manager.save_preferences(&mut config, pre_release, selected_target_ids.clone());
    persist_config_if_changed(&state, &original, &config)?;
    let proxy_url = runtime_proxy_url(prefer_proxy, proxy_url, &config);

    let result = manager
        .check_updates(
            &config,
            &UpdateRequestOptions {
                pre_release,
                selected_target_ids,
                prefer_proxy,
                proxy_url,
            },
        )
        .await;

    match &result {
        Ok(run) => {
            let (diagnostics_result, error_class) = diagnostics_result_for_update_run(run);
            record_diagnostics_event(
                &state,
                &config,
                DiagnosticsEvent::update_check(diagnostics_result, error_class),
            );
        }
        Err(error) => record_diagnostics_event(
            &state,
            &config,
            DiagnosticsEvent::update_check(
                DiagnosticsResult::Failure,
                Some(diagnostics_error_class_for_update_error(error)),
            ),
        ),
    }

    result.map_err(update_error)
}

#[tauri::command]
#[specta::specta]
pub async fn download_updates(
    state: tauri::State<'_, AppState>,
    pre_release: bool,
    selected_target_ids: Vec<String>,
    prefer_proxy: bool,
    proxy_url: Option<String>,
) -> Result<UpdateRunResult, AppError> {
    validate_ipc_text_list(
        &selected_target_ids,
        "update target id",
        IPC_ID_MAX_CHARS,
        AppError::Update,
    )?;
    validate_optional_ipc_text(
        proxy_url.as_deref(),
        "proxy URL",
        IPC_PROXY_URL_MAX_CHARS,
        AppError::Update,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let manager = update_manager(&state);
    manager.save_preferences(&mut config, pre_release, selected_target_ids.clone());
    persist_config_if_changed(&state, &original, &config)?;
    let proxy_url = runtime_proxy_url(prefer_proxy, proxy_url, &config);

    let result = manager
        .download_updates(
            &config,
            &UpdateRequestOptions {
                pre_release,
                selected_target_ids,
                prefer_proxy,
                proxy_url,
            },
        )
        .await;

    match &result {
        Ok(run) => {
            let (diagnostics_result, error_class) = diagnostics_result_for_update_run(run);
            record_diagnostics_event(
                &state,
                &config,
                DiagnosticsEvent::update_download(diagnostics_result, error_class),
            );
        }
        Err(error) => {
            let error_class = diagnostics_error_class_for_update_error(error);
            record_diagnostics_event(
                &state,
                &config,
                DiagnosticsEvent::update_download(DiagnosticsResult::Failure, Some(error_class)),
            );
        }
    }

    result.map_err(update_error)
}

#[tauri::command]
#[specta::specta]
pub async fn manual_app_update_links(
    state: tauri::State<'_, AppState>,
    pre_release: bool,
    prefer_proxy: bool,
    proxy_url: Option<String>,
) -> Result<ManualAppUpdateLinks, AppError> {
    validate_optional_ipc_text(
        proxy_url.as_deref(),
        "proxy URL",
        IPC_PROXY_URL_MAX_CHARS,
        AppError::Update,
    )?;
    let config = current_config(&state)?;
    let proxy_url = runtime_proxy_url(prefer_proxy, proxy_url, &config);

    update_manager(&state)
        .manual_app_update_links(
            &config,
            &UpdateRequestOptions {
                pre_release,
                selected_target_ids: vec!["app".to_string()],
                prefer_proxy,
                proxy_url,
            },
        )
        .await
        .map_err(update_error)
}

/// Re-install a core binary from the packaged seed (`{resource_dir}/core-seeds/<core>/`)
/// into `bin/<core>/`. This is the recovery action behind the missing-core prompt: the
/// startup seed copy already runs automatically, but this lets the UI re-run it on demand
/// when the binary is absent (e.g. cleared bin dir, antivirus removal, or a skipped first run).
#[tauri::command]
#[specta::specta]
pub fn install_core_seed(
    state: tauri::State<'_, AppState>,
    core_type: CoreType,
) -> Result<CoreSeedInstallResult, AppError> {
    let Some(seed_dir) = state.core_seed_resource_dir() else {
        return Ok(CoreSeedInstallResult {
            core_type,
            status: CoreSeedInstallStatus::SeedMissing,
            installed_files: Vec::new(),
        });
    };

    if TargetOs::current() == TargetOs::Macos {
        let core_info = get_core_info(core_type)
            .ok_or_else(|| core_seed_install_error(CoreInfoError::MissingCoreInfo(core_type)))?;
        if let Some(executable) =
            discover_packaged_seed_executable(seed_dir, core_info, TargetOs::Macos)
                .map_err(core_seed_install_error)?
        {
            return Ok(CoreSeedInstallResult {
                core_type,
                status: CoreSeedInstallStatus::AlreadyInstalled,
                installed_files: vec![executable.to_string_lossy().into_owned()],
            });
        }
    }

    let outcome = copy_seed_core_asset(state.runtime_paths(), seed_dir, core_type)
        .map_err(core_seed_install_error)?;

    Ok(core_seed_install_result(outcome))
}
