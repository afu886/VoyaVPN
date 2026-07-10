use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn import_routing_templates<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    prefer_proxy: bool,
    proxy_url: Option<String>,
    import_advanced_rules: bool,
) -> Result<Vec<RoutingItem>, AppError> {
    validate_optional_ipc_text(
        proxy_url.as_deref(),
        "proxy URL",
        IPC_PROXY_URL_MAX_CHARS,
        AppError::Routing,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let proxy_url = runtime_proxy_url(prefer_proxy, proxy_url, &config);
    let imported = RoutingManager::new(state.database())
        .import_routing_templates(
            &mut config,
            prefer_proxy,
            proxy_url.as_deref(),
            import_advanced_rules,
        )
        .await
        .map_err(routing_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_routing_invalidation(
        &app,
        "routing-templates-imported",
        imported
            .iter()
            .map(|item| item.id.clone())
            .collect::<Vec<_>>(),
        original != config,
    )?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(imported)
}

#[tauri::command]
#[specta::specta]
pub async fn apply_regional_preset<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    preset_type: PresetType,
    prefer_proxy: bool,
    proxy_url: Option<String>,
) -> Result<PresetApplyResult, AppError> {
    validate_optional_ipc_text(
        proxy_url.as_deref(),
        "proxy URL",
        IPC_PROXY_URL_MAX_CHARS,
        AppError::Preset,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let proxy_url = runtime_proxy_url(prefer_proxy, proxy_url, &config);
    let result = PresetManager::new(state.database())
        .apply(
            &mut config,
            preset_type,
            PresetApplyOptions {
                prefer_proxy,
                proxy_url,
            },
        )
        .await
        .map_err(preset_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_preset_invalidation(&app, "regional-preset-applied")?;
    restart_if_connected_after_config_change(&app, &state, &config, "Regional preset changed")
        .await?;

    Ok(result)
}
