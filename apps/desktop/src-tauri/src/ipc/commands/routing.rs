use super::{lifecycle::*, support::*, *};

#[tauri::command]
#[specta::specta]
pub async fn list_routings(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<RoutingContract>, AppError> {
    state
        .services()
        .routings()
        .list_routings()
        .await
        .map(|items| items.into_iter().map(routing_to_contract).collect())
        .map_err(routing_error)
}

#[tauri::command]
#[specta::specta]
pub async fn save_routing<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    item: RoutingContract,
) -> Result<RoutingContract, AppError> {
    let original = current_config(&state)?;
    let mut config = original.clone();
    let saved = state
        .services()
        .routings()
        .save_routing(&mut config, routing_from_contract(item))
        .await
        .map_err(routing_error)?;

    persist_config_if_changed(&state, &original, &config).await?;
    emit_routing_invalidation(
        &app,
        "routing-saved",
        [saved.id.clone()],
        original != config,
    )?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(routing_to_contract(saved))
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
    let deleted = state
        .services()
        .routings()
        .delete_routings(&mut config, &ids)
        .await
        .map_err(routing_error)?;

    persist_config_if_changed(&state, &original, &config).await?;
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
) -> Result<RoutingContract, AppError> {
    validate_required_ipc_text(&id, "routing id", IPC_ID_MAX_CHARS, AppError::Routing)?;
    let original = current_config(&state)?;
    let mut config = original.clone();
    let active = state
        .services()
        .routings()
        .set_active_routing(&mut config, &id)
        .await
        .map_err(routing_error)?;

    persist_config_if_changed(&state, &original, &config).await?;
    emit_routing_invalidation(&app, "active-routing-changed", [id], true)?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(routing_to_contract(active))
}

#[tauri::command]
#[specta::specta]
pub async fn save_routing_rule<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    routing_id: String,
    rule: RoutingRuleContract,
) -> Result<RoutingContract, AppError> {
    validate_required_ipc_text(
        &routing_id,
        "routing id",
        IPC_ID_MAX_CHARS,
        AppError::Routing,
    )?;
    let config = current_config(&state)?;
    let saved = state
        .services()
        .routings()
        .save_rule(&routing_id, rule_from_contract(rule))
        .await
        .map_err(routing_error)?;

    emit_routing_invalidation(&app, "routing-rule-saved", [routing_id], false)?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(routing_to_contract(saved))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_routing_rules<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    routing_id: String,
    rule_ids: Vec<String>,
) -> Result<RoutingContract, AppError> {
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
    let saved = state
        .services()
        .routings()
        .delete_rules(&routing_id, &rule_ids)
        .await
        .map_err(routing_error)?;

    emit_routing_invalidation(&app, "routing-rules-deleted", [routing_id], false)?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(routing_to_contract(saved))
}

#[tauri::command]
#[specta::specta]
pub async fn move_routing_rule<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    routing_id: String,
    rule_id: String,
    action: ContractMoveAction,
    position: Option<i32>,
) -> Result<RoutingContract, AppError> {
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
    let saved = state
        .services()
        .routings()
        .move_rule(
            &routing_id,
            &rule_id,
            move_action_from_contract(action),
            position,
        )
        .await
        .map_err(routing_error)?;

    emit_routing_invalidation(&app, "routing-rule-moved", [routing_id], false)?;
    restart_if_connected_after_routing_change(&app, &state, &config).await?;

    Ok(routing_to_contract(saved))
}
