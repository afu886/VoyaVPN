use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn list_group_child_candidates(
    state: tauri::State<'_, AppState>,
    current_index_id: Option<String>,
    filter: Option<String>,
) -> Result<Vec<GroupChildCandidate>, AppError> {
    validate_present_ipc_text(
        current_index_id.as_deref(),
        "profile index id",
        IPC_ID_MAX_CHARS,
        AppError::Group,
    )?;
    validate_optional_ipc_text(
        filter.as_deref(),
        "group candidate filter",
        IPC_FILTER_MAX_CHARS,
        AppError::Group,
    )?;
    GroupManager::new(state.database())
        .list_child_candidates(current_index_id.as_deref(), filter.as_deref())
        .await
        .map_err(group_error)
}

#[tauri::command]
#[specta::specta]
pub async fn validate_group_profile(
    state: tauri::State<'_, AppState>,
    profile: ProfileItem,
) -> Result<GroupValidationResult, AppError> {
    GroupManager::new(state.database())
        .validate_group_profile(&profile)
        .await
        .map_err(group_error)
}

#[tauri::command]
#[specta::specta]
pub async fn preview_group_profile(
    state: tauri::State<'_, AppState>,
    profile: ProfileItem,
) -> Result<GroupPreview, AppError> {
    let config = current_config(&state)?;

    GroupManager::new(state.database())
        .preview_group_profile(&config, &profile)
        .await
        .map_err(group_error)
}

#[tauri::command]
#[specta::specta]
pub async fn save_group_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile: ProfileItem,
) -> Result<ProfileListItem, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let result = GroupManager::new(state.database())
        .save_group_profile(&mut config, profile)
        .await
        .map_err(group_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_profile_invalidation(
        &app,
        "group-profile-saved",
        [result.profile.index_id.clone()],
        original.index_id != config.index_id,
    )?;

    Ok(result)
}
