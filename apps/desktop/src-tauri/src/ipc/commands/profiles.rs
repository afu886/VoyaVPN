use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn list_profiles(
    state: tauri::State<'_, AppState>,
    subid: Option<String>,
    filter: Option<String>,
) -> Result<Vec<ProfileListItem>, AppError> {
    validate_present_ipc_text(
        subid.as_deref(),
        "subscription id",
        IPC_ID_MAX_CHARS,
        AppError::Profile,
    )?;
    validate_optional_ipc_text(
        filter.as_deref(),
        "profile filter",
        IPC_FILTER_MAX_CHARS,
        AppError::Profile,
    )?;
    let config = current_config(&state)?;

    ProfileManager::new(state.database())
        .list_profiles(&config, subid.as_deref(), filter.as_deref())
        .await
        .map_err(profile_error)
}

#[tauri::command]
#[specta::specta]
pub async fn save_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile: ProfileItem,
) -> Result<ProfileListItem, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let result = ProfileManager::new(state.database())
        .save_profile(&mut config, profile)
        .await
        .map_err(profile_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_profile_invalidation(
        &app,
        "profile-saved",
        [result.profile.index_id.clone()],
        original.index_id != config.index_id,
    )?;

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_profiles<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    index_ids: Vec<String>,
) -> Result<u32, AppError> {
    validate_ipc_text_list(
        &index_ids,
        "profile index id",
        IPC_ID_MAX_CHARS,
        AppError::Profile,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let deleted = ProfileManager::new(state.database())
        .delete_profiles(&mut config, &index_ids)
        .await
        .map_err(profile_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_profile_invalidation(
        &app,
        "profiles-deleted",
        index_ids,
        original.index_id != config.index_id,
    )?;

    Ok(u32::try_from(deleted).unwrap_or(u32::MAX))
}

#[tauri::command]
#[specta::specta]
pub async fn copy_profiles<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    index_ids: Vec<String>,
) -> Result<Vec<ProfileListItem>, AppError> {
    validate_ipc_text_list(
        &index_ids,
        "profile index id",
        IPC_ID_MAX_CHARS,
        AppError::Profile,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let copied = ProfileManager::new(state.database())
        .copy_profiles(&mut config, &index_ids)
        .await
        .map_err(profile_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_profile_invalidation(
        &app,
        "profiles-copied",
        copied
            .iter()
            .map(|item| item.profile.index_id.clone())
            .collect::<Vec<_>>(),
        original.index_id != config.index_id,
    )?;

    Ok(copied)
}

#[tauri::command]
#[specta::specta]
pub async fn export_profile_share_links(
    state: tauri::State<'_, AppState>,
    index_ids: Vec<String>,
) -> Result<ExportProfilesResult, AppError> {
    export_profiles_result(&state, index_ids, ExportProfilesFormat::ShareLinks).await
}

#[tauri::command]
#[specta::specta]
pub async fn export_profile_share_links_base64(
    state: tauri::State<'_, AppState>,
    index_ids: Vec<String>,
) -> Result<ExportProfilesResult, AppError> {
    export_profiles_result(&state, index_ids, ExportProfilesFormat::ShareLinksBase64).await
}

#[tauri::command]
#[specta::specta]
pub async fn export_profile_inner_links(
    state: tauri::State<'_, AppState>,
    index_ids: Vec<String>,
) -> Result<ExportProfilesResult, AppError> {
    export_profiles_result(&state, index_ids, ExportProfilesFormat::InnerLinks).await
}

#[tauri::command]
#[specta::specta]
pub async fn export_profile_client_config(
    state: tauri::State<'_, AppState>,
    index_ids: Vec<String>,
) -> Result<ExportProfilesResult, AppError> {
    export_profiles_result(&state, index_ids, ExportProfilesFormat::ClientConfig).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_active_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    index_id: String,
) -> Result<ProfileListItem, AppError> {
    validate_required_ipc_text(
        &index_id,
        "profile index id",
        IPC_ID_MAX_CHARS,
        AppError::Profile,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let active = ProfileManager::new(state.database())
        .set_active_profile(&mut config, &index_id)
        .await
        .map_err(profile_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_profile_invalidation(&app, "active-profile-changed", [index_id], true)?;

    Ok(active)
}

#[tauri::command]
#[specta::specta]
pub async fn move_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    subid: Option<String>,
    index_id: String,
    action: MoveAction,
    position: Option<i32>,
) -> Result<Vec<ProfileListItem>, AppError> {
    validate_present_ipc_text(
        subid.as_deref(),
        "subscription id",
        IPC_ID_MAX_CHARS,
        AppError::Profile,
    )?;
    validate_required_ipc_text(
        &index_id,
        "profile index id",
        IPC_ID_MAX_CHARS,
        AppError::Profile,
    )?;
    let config = current_config(&state)?;
    let profiles = ProfileManager::new(state.database())
        .move_profile(&config, subid.as_deref(), &index_id, action, position)
        .await
        .map_err(profile_error)?;

    emit_profile_invalidation(&app, "profile-moved", [index_id], false)?;

    Ok(profiles)
}

#[tauri::command]
#[specta::specta]
pub async fn sort_profiles<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    subid: Option<String>,
    sort_key: ProfileSortKey,
    ascending: bool,
) -> Result<Vec<ProfileListItem>, AppError> {
    validate_present_ipc_text(
        subid.as_deref(),
        "subscription id",
        IPC_ID_MAX_CHARS,
        AppError::Profile,
    )?;
    let config = current_config(&state)?;
    let profiles = ProfileManager::new(state.database())
        .sort_profiles(&config, subid.as_deref(), sort_key, ascending)
        .await
        .map_err(profile_error)?;

    emit_profile_invalidation(
        &app,
        "profiles-sorted",
        profiles
            .iter()
            .map(|item| item.profile.index_id.clone())
            .collect::<Vec<_>>(),
        false,
    )?;

    Ok(profiles)
}

#[tauri::command]
#[specta::specta]
pub async fn dedupe_profiles<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    subid: Option<String>,
    keep_older: Option<bool>,
) -> Result<ProfileDedupeResult, AppError> {
    validate_present_ipc_text(
        subid.as_deref(),
        "subscription id",
        IPC_ID_MAX_CHARS,
        AppError::Profile,
    )?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let result = ProfileManager::new(state.database())
        .dedupe_profiles(&mut config, subid.as_deref(), keep_older.unwrap_or(false))
        .await
        .map_err(profile_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_profile_invalidation(
        &app,
        "profiles-deduped",
        result.removed_index_ids.clone(),
        original.index_id != config.index_id,
    )?;

    Ok(result)
}
