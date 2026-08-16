use super::{support::*, *};

pub(super) fn emit_profile_invalidation<R, I>(
    app: &tauri::AppHandle<R>,
    reason: &str,
    affected_index_ids: I,
    active_changed: bool,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
    I: IntoIterator<Item = String>,
{
    let mut keys = BTreeSet::new();
    keys.insert(vec!["profiles".to_string()]);
    keys.insert(vec!["profile-ex".to_string()]);
    if active_changed {
        keys.insert(vec!["active-profile".to_string()]);
    }
    for index_id in affected_index_ids {
        if !index_id.is_empty() {
            keys.insert(vec!["profile".to_string(), index_id]);
        }
    }

    InvalidateEvent {
        keys: keys
            .into_iter()
            .map(|query_key| QueryInvalidation {
                query_key,
                reason: reason.to_string(),
            })
            .collect(),
    }
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn emit_subscription_invalidation<R>(
    app: &tauri::AppHandle<R>,
    reason: &str,
    profiles_changed: bool,
    config_changed: bool,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    let mut keys = BTreeSet::new();
    keys.insert(vec!["subscriptions".to_string()]);
    if profiles_changed {
        keys.insert(vec!["profiles".to_string()]);
        keys.insert(vec!["profile-ex".to_string()]);
    }
    if config_changed {
        keys.insert(vec!["active-profile".to_string()]);
    }

    InvalidateEvent {
        keys: keys
            .into_iter()
            .map(|query_key| QueryInvalidation {
                query_key,
                reason: reason.to_string(),
            })
            .collect(),
    }
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn emit_routing_invalidation<R, I>(
    app: &tauri::AppHandle<R>,
    reason: &str,
    affected_ids: I,
    active_changed: bool,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
    I: IntoIterator<Item = String>,
{
    let mut keys = BTreeSet::new();
    keys.insert(vec!["routings".to_string()]);
    if active_changed {
        keys.insert(vec!["active-routing".to_string()]);
    }
    for id in affected_ids {
        if !id.is_empty() {
            keys.insert(vec!["routing".to_string(), id]);
        }
    }

    InvalidateEvent {
        keys: keys
            .into_iter()
            .map(|query_key| QueryInvalidation {
                query_key,
                reason: reason.to_string(),
            })
            .collect(),
    }
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn emit_dns_invalidation<R>(
    app: &tauri::AppHandle<R>,
    reason: &str,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    InvalidateEvent {
        keys: [
            vec!["dns".to_string()],
            vec!["app-config".to_string()],
            vec!["active-dns".to_string()],
        ]
        .into_iter()
        .map(|query_key| QueryInvalidation {
            query_key,
            reason: reason.to_string(),
        })
        .collect(),
    }
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn emit_full_config_template_invalidation<R>(
    app: &tauri::AppHandle<R>,
    reason: &str,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    InvalidateEvent {
        keys: [
            vec!["full-config-templates".to_string()],
            vec!["app-config".to_string()],
        ]
        .into_iter()
        .map(|query_key| QueryInvalidation {
            query_key,
            reason: reason.to_string(),
        })
        .collect(),
    }
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn emit_preset_invalidation<R>(
    app: &tauri::AppHandle<R>,
    reason: &str,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    InvalidateEvent {
        keys: [
            vec!["dns".to_string()],
            vec!["app-config".to_string()],
            vec!["active-dns".to_string()],
            vec!["routings".to_string()],
            vec!["active-routing".to_string()],
        ]
        .into_iter()
        .map(|query_key| QueryInvalidation {
            query_key,
            reason: reason.to_string(),
        })
        .collect(),
    }
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn emit_proxy_runtime_invalidation<R>(
    app: &tauri::AppHandle<R>,
    reason: &str,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    InvalidateEvent {
        keys: [
            vec!["proxy-groups".to_string()],
            vec!["proxy-connections".to_string()],
            vec!["app-config".to_string()],
        ]
        .into_iter()
        .map(|query_key| QueryInvalidation {
            query_key,
            reason: reason.to_string(),
        })
        .collect(),
    }
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn emit_proxy_monitor_status<R>(app: &tauri::AppHandle<R>, status: &ProxyMonitorStatus)
where
    R: tauri::Runtime,
{
    if let Err(error) = TransientStreamEvent::ProxyMonitorStatus(status.clone()).emit(app) {
        tracing::warn!(?error, ?status, "failed to emit proxy monitor status event");
    }
}

pub(super) fn emit_app_config_invalidation<R>(
    app: &tauri::AppHandle<R>,
    reason: &str,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    InvalidateEvent {
        keys: [vec!["app-config".to_string()]]
            .into_iter()
            .map(|query_key| QueryInvalidation {
                query_key,
                reason: reason.to_string(),
            })
            .collect(),
    }
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn emit_ui_preferences_invalidation<R>(
    app: &tauri::AppHandle<R>,
    reason: &str,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    InvalidateEvent {
        keys: [
            vec!["ui-preferences".to_string()],
            vec!["app-config".to_string()],
        ]
        .into_iter()
        .map(|query_key| QueryInvalidation {
            query_key,
            reason: reason.to_string(),
        })
        .collect(),
    }
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(crate) fn emit_tun_changed<R>(
    app: &tauri::AppHandle<R>,
    status: &TunStatus,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    TransientStreamEvent::TunChanged(crate::ipc::events::TunChanged {
        enabled: status.enabled,
        backend: status.backend,
        provider_state: status.provider_state,
        native_component_ready: status.native_component_ready,
        last_provider_error: status.last_provider_error.clone(),
    })
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(crate) fn emit_current_tun_status<R>(
    app: &tauri::AppHandle<R>,
    state: &AppState,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    let config = current_config(state)?;
    let status = tun_manager(state).status(&config).map_err(tun_error)?;
    emit_tun_changed(app, &status)
}

pub(super) async fn restart_if_connected_after_routing_change<R>(
    app: &tauri::AppHandle<R>,
    state: &AppState,
    config: &AppConfig,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    restart_if_connected_after_config_change(app, state, config, "Routing changed").await
}

pub(super) async fn restart_if_connected_after_config_change<R>(
    app: &tauri::AppHandle<R>,
    state: &AppState,
    config: &AppConfig,
    reason: &str,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    let status = runtime_manager(state)
        .status()
        .await
        .map_err(runtime_error)?;
    if status.state != SupervisorConnectionState::Connected {
        return Ok(());
    }

    emit_runtime_log(app, LogLevel::Info, &format!("{reason}; restarting core"))?;
    emit_core_state(
        app,
        CoreState::Connecting,
        Some(config.index_id.clone()).filter(|value| !value.is_empty()),
        None,
    )?;

    match runtime_manager(state).restart(config).await {
        Ok(snapshot) => {
            emit_runtime_log(
                app,
                LogLevel::Info,
                &format!("Core supervisor restarted after {reason}"),
            )?;
            emit_core_state(app, CoreState::Connected, None, Some(&snapshot))?;
            match apply_system_proxy(app, state, config, false) {
                Ok(status) => emit_sysproxy_changed(app, &status)?,
                Err(error) => emit_runtime_log(
                    app,
                    LogLevel::Warn,
                    &format!("System proxy apply failed: {error}"),
                )?,
            }
            emit_current_tun_status(app, state)?;
            Ok(())
        }
        Err(error) => {
            let message = error.to_string();
            emit_runtime_log(app, LogLevel::Error, &message)?;
            emit_core_state(app, CoreState::Disconnected, None, None)?;
            restore_system_proxy_after_native_tun_failure(
                app,
                state,
                config,
                "config-change restart failure",
            )?;
            record_runtime_start_failure_diagnostics(state, config, &error);
            Err(runtime_error(error))
        }
    }
}

pub(super) async fn apply_system_proxy_if_connected_after_config_change<R>(
    app: &tauri::AppHandle<R>,
    state: &AppState,
    config: &AppConfig,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    let status = runtime_manager(state)
        .status()
        .await
        .map_err(runtime_error)?;
    if status.state != SupervisorConnectionState::Connected {
        return Ok(());
    }

    match apply_system_proxy(app, state, config, false) {
        Ok(status) => emit_sysproxy_changed(app, &status),
        Err(error) => {
            emit_runtime_log(
                app,
                LogLevel::Warn,
                &format!("System proxy apply failed: {error}"),
            )?;
            Ok(())
        }
    }
}

pub(super) fn saved_config_requires_runtime_restart(
    original: &AppConfig,
    updated: &AppConfig,
) -> bool {
    original.index_id != updated.index_id
        || original.sub_index_id != updated.sub_index_id
        || original.core_basic_item != updated.core_basic_item
        || original.tun_mode_item != updated.tun_mode_item
        || original.kcp_item != updated.kcp_item
        || original.grpc_item != updated.grpc_item
        || original.routing_basic_item != updated.routing_basic_item
        || original.mux4_ray_item != updated.mux4_ray_item
        || original.mux4_sbox_item != updated.mux4_sbox_item
        || original.hysteria_item != updated.hysteria_item
        || original.proxy_ui_item != updated.proxy_ui_item
        || original.fragment4_ray_item != updated.fragment4_ray_item
        || original.inbound != updated.inbound
        || original.simple_dns_item != updated.simple_dns_item
}

pub(super) fn emit_sysproxy_changed<R>(
    app: &tauri::AppHandle<R>,
    status: &SystemProxyStatus,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    TransientStreamEvent::SysProxyChanged(crate::ipc::events::SysProxyChanged {
        requested_mode: sysproxy_mode(status.requested_type),
        effective_mode: sysproxy_mode(status.effective_type),
        pac_available: status.pac_available,
        proxy: status.proxy.clone(),
    })
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn sysproxy_mode(mode: SysProxyType) -> crate::ipc::events::SysProxyMode {
    match mode {
        SysProxyType::ForcedClear => crate::ipc::events::SysProxyMode::ForcedClear,
        SysProxyType::ForcedChange => crate::ipc::events::SysProxyMode::ForcedChange,
        SysProxyType::Unchanged => crate::ipc::events::SysProxyMode::Unchanged,
        SysProxyType::Pac => crate::ipc::events::SysProxyMode::Pac,
    }
}
