use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn list_subscriptions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SubscriptionContract>, AppError> {
    state
        .services()
        .subscriptions()
        .list_subscriptions()
        .await
        .map(|items| items.into_iter().map(subscription_to_contract).collect())
        .map_err(subscription_error)
}

#[tauri::command]
#[specta::specta]
pub async fn save_subscription<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    item: SubscriptionContract,
) -> Result<SubscriptionContract, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let saved = state
        .services()
        .subscriptions()
        .save_subscription(&mut config, subscription_from_contract(item))
        .await
        .map_err(subscription_error)?;

    persist_config_if_changed(&state, &original, &config).await?;
    emit_subscription_invalidation(&app, "subscription-saved", false, original != config)?;

    Ok(subscription_to_contract(saved))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_subscriptions<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    ids: Vec<String>,
) -> Result<u32, AppError> {
    validate_ipc_text_list(
        &ids,
        "subscription id",
        IPC_ID_MAX_CHARS,
        AppError::Subscription,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let deleted = state
        .services()
        .subscriptions()
        .delete_subscriptions(&mut config, &ids)
        .await
        .map_err(subscription_error)?;

    persist_config_if_changed(&state, &original, &config).await?;
    emit_subscription_invalidation(&app, "subscriptions-deleted", true, original != config)?;

    Ok(deleted)
}

#[tauri::command]
#[specta::specta]
pub async fn import_profiles_from_text<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    text: String,
    subscription_id: Option<String>,
) -> Result<ImportProfilesContract, AppError> {
    validate_present_ipc_text(
        subscription_id.as_deref(),
        "subscription id",
        IPC_ID_MAX_CHARS,
        AppError::Subscription,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let result = state
        .services()
        .subscriptions()
        .import_profiles_from_text(&mut config, &text, subscription_id.as_deref())
        .await
        .map_err(subscription_error)?;

    persist_config_if_changed(&state, &original, &config).await?;
    emit_subscription_invalidation(&app, "profiles-imported", true, original != config)?;

    Ok(import_profiles_to_contract(result))
}

#[tauri::command]
#[specta::specta]
pub async fn update_subscriptions<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    subscription_id: Option<String>,
    prefer_proxy: bool,
    proxy_url: Option<String>,
) -> Result<SubscriptionUpdateContract, AppError> {
    validate_present_ipc_text(
        subscription_id.as_deref(),
        "subscription id",
        IPC_ID_MAX_CHARS,
        AppError::Subscription,
    )?;
    validate_optional_ipc_text(
        proxy_url.as_deref(),
        "proxy URL",
        IPC_PROXY_URL_MAX_CHARS,
        AppError::Subscription,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let proxy_url = runtime_proxy_url(prefer_proxy, proxy_url, &config);
    let result = state
        .services()
        .subscriptions()
        .update_subscriptions(
            &mut config,
            subscription_id.as_deref(),
            prefer_proxy,
            proxy_url.as_deref(),
        )
        .await
        .map_err(subscription_error)?;

    persist_config_if_changed(&state, &original, &config).await?;
    emit_subscription_invalidation(&app, "subscriptions-updated", true, original != config)?;

    Ok(subscription_update_to_contract(result))
}
