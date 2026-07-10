use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn list_subscriptions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SubItem>, AppError> {
    SubscriptionManager::new(state.database())
        .list_subscriptions()
        .await
        .map_err(subscription_error)
}

#[tauri::command]
#[specta::specta]
pub async fn get_subscription(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<SubItem>, AppError> {
    validate_required_ipc_text(
        &id,
        "subscription id",
        IPC_ID_MAX_CHARS,
        AppError::Subscription,
    )?;
    SubscriptionManager::new(state.database())
        .get_subscription(&id)
        .await
        .map_err(subscription_error)
}

#[tauri::command]
#[specta::specta]
pub async fn save_subscription<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    item: SubItem,
) -> Result<SubItem, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let saved = SubscriptionManager::new(state.database())
        .save_subscription(&mut config, item)
        .await
        .map_err(subscription_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_subscription_invalidation(&app, "subscription-saved", false, original != config)?;

    Ok(saved)
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
    let deleted = SubscriptionManager::new(state.database())
        .delete_subscriptions(&mut config, &ids)
        .await
        .map_err(subscription_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_subscription_invalidation(&app, "subscriptions-deleted", true, original != config)?;

    Ok(deleted)
}

#[tauri::command]
#[specta::specta]
pub async fn import_profiles_from_text<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    text: String,
    subid: Option<String>,
    is_sub: bool,
) -> Result<ImportProfilesResult, AppError> {
    validate_present_ipc_text(
        subid.as_deref(),
        "subscription id",
        IPC_ID_MAX_CHARS,
        AppError::Subscription,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let result = SubscriptionManager::new(state.database())
        .import_profiles_from_text(&mut config, &text, subid.as_deref(), is_sub)
        .await
        .map_err(subscription_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_subscription_invalidation(&app, "profiles-imported", true, original != config)?;

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn import_profiles_from_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    path: String,
    subid: Option<String>,
    is_sub: bool,
) -> Result<ImportProfilesResult, AppError> {
    validate_present_ipc_text(
        subid.as_deref(),
        "subscription id",
        IPC_ID_MAX_CHARS,
        AppError::Subscription,
    )?;
    let path = resolve_scoped_ipc_file(
        &path,
        &state.runtime_paths().temp_file(PROFILE_IMPORT_DIR_NAME),
        IpcFileScope::ProfileImport,
    )?;
    let text = fs::read_to_string(&path)
        .map_err(|error| AppError::Subscription(format!("failed to read import file: {error}")))?;

    import_profiles_from_text(app, state, text, subid, is_sub).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_subscriptions<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    subid: Option<String>,
    prefer_proxy: bool,
    proxy_url: Option<String>,
) -> Result<SubscriptionUpdateResult, AppError> {
    validate_present_ipc_text(
        subid.as_deref(),
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
    let result = SubscriptionManager::new(state.database())
        .update_subscriptions(
            &mut config,
            subid.as_deref(),
            prefer_proxy,
            proxy_url.as_deref(),
            current_unix_time(),
        )
        .await
        .map_err(subscription_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_subscription_invalidation(&app, "subscriptions-updated", true, original != config)?;

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn run_due_subscription_updates<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    prefer_proxy: bool,
    proxy_url: Option<String>,
) -> Result<SubscriptionUpdateResult, AppError> {
    validate_optional_ipc_text(
        proxy_url.as_deref(),
        "proxy URL",
        IPC_PROXY_URL_MAX_CHARS,
        AppError::Subscription,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let proxy_url = runtime_proxy_url(prefer_proxy, proxy_url, &config);
    let result = SubscriptionManager::new(state.database())
        .run_due_updates(
            &mut config,
            current_unix_time(),
            prefer_proxy,
            proxy_url.as_deref(),
        )
        .await
        .map_err(subscription_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_subscription_invalidation(&app, "due-subscriptions-updated", true, original != config)?;

    Ok(result)
}
