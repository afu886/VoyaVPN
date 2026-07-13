use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn import_config_template<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    selection: ConfigTemplateSelection,
    prefer_proxy: bool,
    proxy_url: Option<String>,
) -> Result<ConfigTemplateImportResult, AppError> {
    validate_optional_ipc_text(
        proxy_url.as_deref(),
        "proxy URL",
        IPC_PROXY_URL_MAX_CHARS,
        AppError::Preset,
    )?;
    if let ConfigTemplateSelection::Custom { sources } = &selection {
        for (label, value) in [
            ("Geo source URL", sources.geo_source_url.as_deref()),
            ("SRS source URL", sources.srs_source_url.as_deref()),
            (
                "routing template source URL",
                sources.route_rules_template_source_url.as_deref(),
            ),
        ] {
            validate_optional_ipc_text(value, label, IPC_PROXY_URL_MAX_CHARS, AppError::Preset)?;
        }
    }
    let original = current_config(&state)?;
    let mut config = original.clone();
    let proxy_url = runtime_proxy_url(prefer_proxy, proxy_url, &config);
    let result = PresetManager::new(state.database())
        .import_config_template(
            &mut config,
            selection,
            ConfigTemplateImportOptions {
                prefer_proxy,
                proxy_url,
            },
        )
        .await
        .map_err(preset_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_preset_invalidation(&app, "config-template-imported")?;
    restart_if_connected_after_config_change(&app, &state, &config, "Config template imported")
        .await?;

    Ok(result)
}
