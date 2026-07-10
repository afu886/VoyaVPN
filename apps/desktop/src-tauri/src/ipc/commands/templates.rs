use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn load_full_config_templates(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<FullConfigTemplateItem>, AppError> {
    FullConfigTemplateManager::new(state.database())
        .load_templates()
        .await
        .map_err(template_error)
}

#[tauri::command]
#[specta::specta]
pub async fn save_full_config_template<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    template: FullConfigTemplateItem,
) -> Result<FullConfigTemplateItem, AppError> {
    let saved = FullConfigTemplateManager::new(state.database())
        .save_template(template)
        .await
        .map_err(template_error)?;

    emit_full_config_template_invalidation(&app, "full-config-template-saved")?;

    Ok(saved)
}
