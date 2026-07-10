use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn load_dns_settings(state: tauri::State<'_, AppState>) -> Result<DnsSettings, AppError> {
    let config = current_config(&state)?;

    DnsManager::new(state.database())
        .load_settings(&config.simple_dns_item)
        .await
        .map_err(dns_error)
}

#[tauri::command]
#[specta::specta]
pub async fn save_dns_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    settings: DnsSettings,
) -> Result<DnsSettings, AppError> {
    let original = current_config(&state)?;
    let saved = DnsManager::new(state.database())
        .save_settings(settings)
        .await
        .map_err(dns_error)?;
    let mut config = original.clone();
    config.simple_dns_item = saved.simple_dns_item.clone();

    persist_config_if_changed(&state, &original, &config)?;
    emit_dns_invalidation(&app, "dns-settings-saved")?;
    restart_if_connected_after_config_change(&app, &state, &config, "DNS changed").await?;

    Ok(saved)
}
