use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub fn backup_status(state: tauri::State<'_, AppState>) -> Result<BackupStatus, AppError> {
    let config = current_config(&state)?;

    Ok(backup_manager(&state).status(&config))
}

#[tauri::command]
#[specta::specta]
pub fn backup_save_webdav_settings(
    state: tauri::State<'_, AppState>,
    settings: WebDavItem,
) -> Result<WebDavItem, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let saved = backup_manager(&state).save_webdav_settings(&mut config, settings);
    persist_config_if_changed(&state, &original, &config)?;

    Ok(saved)
}

#[tauri::command]
#[specta::specta]
pub async fn backup_create_local(
    state: tauri::State<'_, AppState>,
    output_path: Option<String>,
) -> Result<BackupOperationResult, AppError> {
    validate_optional_ipc_text(
        output_path.as_deref(),
        "backup output path",
        IPC_PATH_MAX_CHARS,
        AppError::Backup,
    )?;
    let config = current_config(&state)?;
    let output_path = output_path
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from);

    backup_manager(&state)
        .create_local_backup(&config, output_path.as_deref())
        .await
        .map_err(backup_error)
}

#[tauri::command]
#[specta::specta]
pub async fn backup_restore_local<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    input_path: String,
) -> Result<BackupRestoreResult, AppError> {
    validate_required_ipc_text(
        &input_path,
        "backup restore path",
        IPC_PATH_MAX_CHARS,
        AppError::Backup,
    )?;
    let input_path = resolve_scoped_ipc_file(
        &input_path,
        state.runtime_paths().backup_dir(),
        IpcFileScope::BackupRestore,
    )?;
    let result = backup_manager(&state)
        .restore_local_backup(&input_path)
        .await
        .map_err(backup_restore_error)?;
    replace_current_config(&state, &result.restored_config)?;
    emit_backup_invalidation(&app, "backup-restored")?;

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn backup_webdav_check(
    state: tauri::State<'_, AppState>,
    settings: WebDavItem,
) -> Result<BackupOperationResult, AppError> {
    let config = save_webdav_settings_for_operation(&state, settings)?;

    backup_manager(&state)
        .webdav_check(&config.web_dav_item)
        .await
        .map_err(backup_error)
}

#[tauri::command]
#[specta::specta]
pub async fn backup_webdav_push(
    state: tauri::State<'_, AppState>,
    settings: WebDavItem,
) -> Result<BackupRemoteResult, AppError> {
    let config = save_webdav_settings_for_operation(&state, settings)?;

    backup_manager(&state)
        .webdav_push(&config, &config.web_dav_item)
        .await
        .map_err(backup_error)
}

#[tauri::command]
#[specta::specta]
pub async fn backup_webdav_pull<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    settings: WebDavItem,
) -> Result<BackupRestoreResult, AppError> {
    let config = save_webdav_settings_for_operation(&state, settings)?;
    let result = backup_manager(&state)
        .webdav_pull(&config.web_dav_item)
        .await
        .map_err(backup_error)?;
    replace_current_config(&state, &result.restored_config)?;
    emit_backup_invalidation(&app, "backup-webdav-restored")?;

    Ok(result)
}
