use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn load_dns_settings(
    state: tauri::State<'_, AppState>,
) -> Result<DnsSettingsContract, AppError> {
    let config = current_config(&state)?;

    state
        .services()
        .dns()
        .load_settings(&config.simple_dns_item)
        .await
        .map(dns_to_contract)
        .map_err(dns_error)
}

#[tauri::command]
#[specta::specta]
pub async fn save_dns_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    settings: DnsSettingsContract,
) -> Result<DnsSettingsContract, AppError> {
    let original = current_config(&state)?;
    let saved = state
        .services()
        .dns()
        .save_settings(dns_from_contract(settings))
        .await
        .map_err(dns_error)?;
    let mut config = original.clone();
    config.simple_dns_item = saved.simple_dns_item.clone();

    persist_config_if_changed(&state, &original, &config).await?;
    emit_dns_invalidation(&app, "dns-settings-saved")?;
    restart_if_connected_after_config_change(&app, &state, &config, "DNS changed").await?;

    Ok(dns_to_contract(saved))
}
