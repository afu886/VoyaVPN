use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn list_routings(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<RoutingItem>, AppError> {
    RoutingManager::new(state.database())
        .list_routings()
        .await
        .map_err(routing_error)
}

#[tauri::command]
#[specta::specta]
pub async fn get_routing(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<RoutingItem>, AppError> {
    validate_required_ipc_text(&id, "routing id", IPC_ID_MAX_CHARS, AppError::Routing)?;
    RoutingManager::new(state.database())
        .get_routing(&id)
        .await
        .map_err(routing_error)
}

#[tauri::command]
#[specta::specta]
pub async fn save_routing<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    item: RoutingItem,
) -> Result<RoutingItem, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let saved = RoutingManager::new(state.database())
        .save_routing(&mut config, item)
        .await
        .map_err(routing_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_routing_invalidation(
        &app,
        "routing-saved",
        [saved.id.clone()],
        original != config,
    )?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(saved)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_routings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    ids: Vec<String>,
) -> Result<u32, AppError> {
    validate_ipc_text_list(&ids, "routing id", IPC_ID_MAX_CHARS, AppError::Routing)?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let deleted = RoutingManager::new(state.database())
        .delete_routings(&mut config, &ids)
        .await
        .map_err(routing_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_routing_invalidation(&app, "routings-deleted", ids, original != config)?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(deleted)
}

#[tauri::command]
#[specta::specta]
pub async fn set_active_routing<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<RoutingItem, AppError> {
    validate_required_ipc_text(&id, "routing id", IPC_ID_MAX_CHARS, AppError::Routing)?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let active = RoutingManager::new(state.database())
        .set_active_routing(&mut config, &id)
        .await
        .map_err(routing_error)?;

    persist_config_if_changed(&state, &original, &config)?;
    emit_routing_invalidation(&app, "active-routing-changed", [id], true)?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(active)
}

#[tauri::command]
#[specta::specta]
pub async fn save_routing_rule<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    routing_id: String,
    rule: RulesItem,
) -> Result<RoutingItem, AppError> {
    validate_required_ipc_text(
        &routing_id,
        "routing id",
        IPC_ID_MAX_CHARS,
        AppError::Routing,
    )?;
    let config = current_config(&state)?;
    let saved = RoutingManager::new(state.database())
        .save_rule(&routing_id, rule)
        .await
        .map_err(routing_error)?;

    emit_routing_invalidation(&app, "routing-rule-saved", [routing_id], false)?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(saved)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_routing_rules<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    routing_id: String,
    rule_ids: Vec<String>,
) -> Result<RoutingItem, AppError> {
    validate_required_ipc_text(
        &routing_id,
        "routing id",
        IPC_ID_MAX_CHARS,
        AppError::Routing,
    )?;
    validate_ipc_text_list(
        &rule_ids,
        "routing rule id",
        IPC_ID_MAX_CHARS,
        AppError::Routing,
    )?;
    let config = current_config(&state)?;
    let saved = RoutingManager::new(state.database())
        .delete_rules(&routing_id, &rule_ids)
        .await
        .map_err(routing_error)?;

    emit_routing_invalidation(&app, "routing-rules-deleted", [routing_id], false)?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(saved)
}

#[tauri::command]
#[specta::specta]
pub async fn move_routing_rule<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    routing_id: String,
    rule_id: String,
    action: MoveAction,
    position: Option<i32>,
) -> Result<RoutingItem, AppError> {
    validate_required_ipc_text(
        &routing_id,
        "routing id",
        IPC_ID_MAX_CHARS,
        AppError::Routing,
    )?;
    validate_required_ipc_text(
        &rule_id,
        "routing rule id",
        IPC_ID_MAX_CHARS,
        AppError::Routing,
    )?;
    let config = current_config(&state)?;
    let saved = RoutingManager::new(state.database())
        .move_rule(&routing_id, &rule_id, action, position)
        .await
        .map_err(routing_error)?;

    emit_routing_invalidation(&app, "routing-rule-moved", [routing_id], false)?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(saved)
}
