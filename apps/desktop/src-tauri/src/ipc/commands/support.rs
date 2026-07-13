use super::{lifecycle::*, *};

pub(super) fn current_config(state: &AppState) -> Result<AppConfig, AppError> {
    state
        .config()
        .read()
        .map_err(|_| AppError::State("app config lock is poisoned".to_string()))
        .map(|guard| guard.clone())
}

pub(super) async fn export_profiles_result(
    state: &AppState,
    index_ids: Vec<String>,
    format: ExportProfilesFormat,
) -> Result<ExportProfilesResult, AppError> {
    validate_ipc_text_list(
        &index_ids,
        "profile index id",
        IPC_ID_MAX_CHARS,
        AppError::Export,
    )?;
    let config = current_config(state)?;

    ExportManager::new(state.database())
        .export_profiles(
            state.runtime_paths(),
            &config,
            TargetOs::current(),
            ExportProfilesRequest { index_ids, format },
        )
        .await
        .map_err(export_error)
}

pub(super) fn validate_present_ipc_text(
    value: Option<&str>,
    field: &str,
    max_chars: usize,
    make_error: fn(String) -> AppError,
) -> Result<(), AppError> {
    input_safety::validate_present_text(value, max_chars)
        .map_err(|error| ipc_text_error(error, field, make_error))
}

pub(super) fn validate_optional_ipc_text(
    value: Option<&str>,
    field: &str,
    max_chars: usize,
    make_error: fn(String) -> AppError,
) -> Result<(), AppError> {
    input_safety::validate_optional_text(value, max_chars)
        .map_err(|error| ipc_text_error(error, field, make_error))
}

pub(super) fn validate_ipc_text_list(
    values: &[String],
    field: &str,
    max_chars: usize,
    make_error: fn(String) -> AppError,
) -> Result<(), AppError> {
    input_safety::validate_text_list(values, max_chars, IPC_LIST_MAX_ITEMS)
        .map_err(|error| ipc_text_error(error, field, make_error))
}

pub(super) fn validate_required_ipc_text(
    value: &str,
    field: &str,
    max_chars: usize,
    make_error: fn(String) -> AppError,
) -> Result<(), AppError> {
    input_safety::validate_required_text(value, max_chars)
        .map_err(|error| ipc_text_error(error, field, make_error))
}

pub(super) fn validate_ipc_text(
    value: &str,
    field: &str,
    max_chars: usize,
    make_error: fn(String) -> AppError,
) -> Result<(), AppError> {
    input_safety::validate_text(value, max_chars)
        .map_err(|error| ipc_text_error(error, field, make_error))
}

pub(super) fn ipc_text_error(
    error: InputSafetyError,
    field: &str,
    make_error: fn(String) -> AppError,
) -> AppError {
    let reason = match error {
        InputSafetyError::EmptyValue => "value is required".to_string(),
        InputSafetyError::TooLong => "value is too long".to_string(),
        InputSafetyError::ControlCharacters => "control characters are not allowed".to_string(),
        InputSafetyError::TooManyItems => "too many items".to_string(),
        error => error.to_string(),
    };

    make_error(format!("invalid {field}: {reason}"))
}

pub(crate) fn diagnostics_release_channel() -> DiagnosticsReleaseChannel {
    if cfg!(debug_assertions) {
        DiagnosticsReleaseChannel::Debug
    } else {
        DiagnosticsReleaseChannel::Stable
    }
}

pub(crate) fn record_app_start_diagnostics<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let state = app.state::<AppState>();
    match current_config(&state) {
        Ok(config) => record_diagnostics_event(
            &state,
            &config,
            DiagnosticsEvent::app_start(DiagnosticsResult::Success),
        ),
        Err(error) => tracing::debug!(?error, "failed to load config for app start diagnostics"),
    }
}

pub(super) fn current_diagnostics_settings(
    state: &AppState,
) -> Result<DiagnosticsSettings, AppError> {
    let original = current_config(state)?;
    let mut config = original.clone();
    let settings = diagnostics_settings_for_config(&mut config);
    persist_config_if_changed(state, &original, &config)?;

    Ok(settings)
}

pub(super) fn diagnostics_settings_for_config(config: &mut AppConfig) -> DiagnosticsSettings {
    if config.diagnostics_item.enabled {
        prepare_diagnostics_settings(
            config,
            env!("CARGO_PKG_VERSION"),
            diagnostics_release_channel(),
        )
    } else {
        diagnostics_settings(
            config,
            env!("CARGO_PKG_VERSION"),
            diagnostics_release_channel(),
        )
    }
}

pub(super) fn diagnostics_status_response(
    settings: &DiagnosticsSettings,
    client: &DiagnosticsClient,
) -> DiagnosticsStatus {
    DiagnosticsStatus {
        enabled: settings.enabled(),
        delivery_configured: settings.endpoint_url().is_some(),
        queued_events: u32::try_from(client.queued_events()).unwrap_or(u32::MAX),
        queued_bytes: u32::try_from(client.queued_bytes()).unwrap_or(u32::MAX),
    }
}

pub(super) fn record_diagnostics_event(
    state: &AppState,
    config: &AppConfig,
    event: DiagnosticsEvent,
) {
    let settings = diagnostics_settings(
        config,
        env!("CARGO_PKG_VERSION"),
        diagnostics_release_channel(),
    );
    let client = state.diagnostics_client();

    tauri::async_runtime::spawn(async move {
        let mut client = client.lock().await;
        let outcome = client.record(&settings, event);
        if outcome.status != DiagnosticsRecordStatus::Queued {
            return;
        }

        let flush = client.flush(&settings).await;
        tracing::debug!(
            status = ?flush.status,
            attempted_events = flush.attempted_events,
            queued_events = flush.queued_events,
            "diagnostics flush completed"
        );
    });
}

pub(super) fn diagnostics_result_for_update_run(
    run: &UpdateRunResult,
) -> (DiagnosticsResult, Option<DiagnosticsErrorClass>) {
    if run
        .results
        .iter()
        .any(|result| result.status == UpdateResultStatus::Error)
    {
        return (
            DiagnosticsResult::Failure,
            Some(DiagnosticsErrorClass::Unknown),
        );
    }

    if run
        .results
        .iter()
        .all(|result| result.status == UpdateResultStatus::Skipped)
    {
        return (DiagnosticsResult::Skipped, None);
    }

    (DiagnosticsResult::Success, None)
}

pub(super) fn diagnostics_result_for_app_update_diagnostic(
    result: AppUpdateDiagnosticResult,
) -> DiagnosticsResult {
    match result {
        AppUpdateDiagnosticResult::Success => DiagnosticsResult::Success,
        AppUpdateDiagnosticResult::Failure => DiagnosticsResult::Failure,
        AppUpdateDiagnosticResult::Skipped => DiagnosticsResult::Skipped,
    }
}

pub(super) fn record_runtime_start_failure_diagnostics(
    state: &AppState,
    config: &AppConfig,
    error: &RuntimeError,
) {
    record_diagnostics_event(
        state,
        config,
        DiagnosticsEvent::runtime_start_failure(diagnostics_error_class_for_runtime_error(error)),
    );

    if let Some(core_type) = runtime_missing_core_type(error) {
        record_diagnostics_event(state, config, DiagnosticsEvent::core_missing(core_type));
    }
}

pub(super) fn runtime_missing_core_type(error: &RuntimeError) -> Option<CoreType> {
    match error {
        RuntimeError::MissingCoreInfo(core_type)
        | RuntimeError::CoreInfo(CoreInfoError::MissingCoreInfo(core_type))
        | RuntimeError::CoreInfo(CoreInfoError::ExecutableNotFound { core_type, .. }) => {
            Some(*core_type)
        }
        _ => None,
    }
}

#[derive(Debug, Clone, Copy)]
pub(super) enum IpcFileScope {
    ProfileImport,
}

impl IpcFileScope {
    fn invalid_path_error(self) -> AppError {
        match self {
            Self::ProfileImport => AppError::Subscription(
                "invalid import file path: provide a relative file name inside the import directory"
                    .to_string(),
            ),
        }
    }

    fn unavailable_error(self) -> AppError {
        match self {
            Self::ProfileImport => AppError::Subscription(
                "import file is not available in the import directory".to_string(),
            ),
        }
    }

    fn prepare_error(self, source: io::Error) -> AppError {
        match self {
            Self::ProfileImport => {
                AppError::Subscription(format!("failed to prepare import directory: {source}"))
            }
        }
    }

    fn scoped_file_error(self, error: InputSafetyError) -> AppError {
        match error {
            InputSafetyError::InvalidPath
            | InputSafetyError::EmptyValue
            | InputSafetyError::TooLong
            | InputSafetyError::ControlCharacters
            | InputSafetyError::TooManyItems => self.invalid_path_error(),
            InputSafetyError::PathUnavailable => self.unavailable_error(),
            InputSafetyError::PrepareDirectory(source) => self.prepare_error(source),
        }
    }
}

pub(super) fn resolve_scoped_ipc_file(
    input: &str,
    base_dir: &std::path::Path,
    scope: IpcFileScope,
) -> Result<PathBuf, AppError> {
    input_safety::resolve_scoped_file(input, base_dir, IPC_PATH_MAX_CHARS)
        .map_err(|error| scope.scoped_file_error(error))
}

pub(super) fn diagnostics_error_class_for_runtime_error(
    error: &RuntimeError,
) -> DiagnosticsErrorClass {
    match error {
        RuntimeError::MissingCoreInfo(_)
        | RuntimeError::CoreInfo(CoreInfoError::MissingCoreInfo(_))
        | RuntimeError::CoreInfo(CoreInfoError::ExecutableNotFound { .. }) => {
            DiagnosticsErrorClass::CoreMissing
        }
        RuntimeError::CoreInfo(error) => diagnostics_error_class_for_core_info_error(error),
        RuntimeError::Supervisor(SupervisorError::ElevationNotGranted(_)) => {
            DiagnosticsErrorClass::PermissionDenied
        }
        RuntimeError::Supervisor(_) => DiagnosticsErrorClass::RuntimeStartFailed,
        _ => DiagnosticsErrorClass::RuntimeStartFailed,
    }
}

pub(super) fn diagnostics_error_class_for_core_info_error(
    error: &CoreInfoError,
) -> DiagnosticsErrorClass {
    match error {
        CoreInfoError::MissingCoreInfo(_) | CoreInfoError::ExecutableNotFound { .. } => {
            DiagnosticsErrorClass::CoreMissing
        }
        CoreInfoError::CreateCoreBinDir { source, .. }
        | CoreInfoError::InspectExecutable { source, .. }
        | CoreInfoError::InspectCoreSeed { source, .. }
        | CoreInfoError::ReadCoreSeedDir { source, .. }
        | CoreInfoError::CopyCoreSeedAsset { source, .. }
        | CoreInfoError::ChmodExecutable { source, .. }
            if source.kind() == io::ErrorKind::PermissionDenied =>
        {
            DiagnosticsErrorClass::PermissionDenied
        }
        _ => DiagnosticsErrorClass::Unknown,
    }
}

pub(super) fn diagnostics_error_class_for_update_error(
    error: &UpdateManagerError,
) -> DiagnosticsErrorClass {
    match error {
        UpdateManagerError::Download(_) => DiagnosticsErrorClass::NetworkUnavailable,
        UpdateManagerError::Release(_) | UpdateManagerError::RulesetGeo(_) => {
            DiagnosticsErrorClass::EndpointUnavailable
        }
        UpdateManagerError::Runtime(error) => diagnostics_error_class_for_runtime_error(error),
        _ => DiagnosticsErrorClass::Unknown,
    }
}

pub(super) fn diagnostics_error_class_for_app_update_message(
    action: AppUpdateDiagnosticAction,
    message: Option<&str>,
) -> DiagnosticsErrorClass {
    let message = message.unwrap_or_default().to_ascii_lowercase();

    if message.contains("unsupported") {
        return DiagnosticsErrorClass::Unknown;
    }

    if message.contains("emptyendpoint")
        || message.contains("empty endpoint")
        || message.contains("endpoint")
        || message.contains("fetch")
        || message.contains("network")
        || message.contains("request")
        || message.contains("timeout")
        || message.contains("http")
    {
        return DiagnosticsErrorClass::EndpointUnavailable;
    }

    match action {
        AppUpdateDiagnosticAction::Check => DiagnosticsErrorClass::EndpointUnavailable,
        AppUpdateDiagnosticAction::Install => DiagnosticsErrorClass::UpdaterInstallFailed,
    }
}

pub(super) fn runtime_manager(state: &AppState) -> RuntimeManager<'_> {
    let manager = RuntimeManager::new(
        state.database(),
        state.runtime_paths().clone(),
        state.supervisor(),
    );

    if let Some(seed_dir) = state.core_seed_resource_dir() {
        manager.with_core_seed_resource_dir(seed_dir.to_path_buf())
    } else {
        manager
    }
}

pub(super) fn speedtest_manager(state: &AppState) -> SpeedtestManager {
    state.speedtest_manager()
}

pub(super) fn tun_manager(state: &AppState) -> TunManager {
    TunManager::new(state.elevation_manager().state())
}

pub(super) fn update_manager(state: &AppState) -> UpdateManager<'_> {
    UpdateManager::new(state.database(), state.runtime_paths().clone())
}

pub(super) struct TauriHotkeyRegistrar<R: tauri::Runtime> {
    pub(super) app: tauri::AppHandle<R>,
}

impl<R> HotkeyRegistrar for TauriHotkeyRegistrar<R>
where
    R: tauri::Runtime + 'static,
{
    fn unregister_all(&self) -> Result<(), HotkeyManagerError> {
        self.app
            .global_shortcut()
            .unregister_all()
            .map_err(|error| HotkeyManagerError::Register(error.to_string()))
    }

    fn register(&self, bindings: &[GlobalHotkeyBinding]) -> Result<(), HotkeyManagerError> {
        for binding in bindings {
            voya_platform::hotkeys::validate_hotkey_accelerator(
                binding.action,
                &binding.accelerator,
            )?;
            let action = binding.action;
            self.app
                .global_shortcut()
                .on_shortcut(
                    binding.accelerator.as_str(),
                    move |app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            handle_global_hotkey(app, action);
                        }
                    },
                )
                .map_err(|error| HotkeyManagerError::Register(error.to_string()))?;
        }

        Ok(())
    }
}

pub(super) fn handle_global_hotkey<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    action: GlobalHotkey,
) {
    match action {
        GlobalHotkey::ShowForm => toggle_main_window(app),
        GlobalHotkey::SystemProxyClear => {
            spawn_global_hotkey_proxy_mode(app, SysProxyType::ForcedClear);
        }
        GlobalHotkey::SystemProxySet => {
            spawn_global_hotkey_proxy_mode(app, SysProxyType::ForcedChange);
        }
        GlobalHotkey::SystemProxyUnchanged => {
            spawn_global_hotkey_proxy_mode(app, SysProxyType::Unchanged);
        }
        GlobalHotkey::SystemProxyPac => {
            spawn_global_hotkey_proxy_mode(app, SysProxyType::Pac);
        }
    }
}

pub(super) fn toggle_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    match window.is_visible() {
        Ok(true) => {
            if let Err(error) = window.hide() {
                tracing::warn!(?error, "failed to hide main window from global hotkey");
            }
        }
        Ok(false) | Err(_) => {
            if let Err(error) = window.show() {
                tracing::warn!(?error, "failed to show main window from global hotkey");
            }
            if let Err(error) = window.set_focus() {
                tracing::warn!(?error, "failed to focus main window from global hotkey");
            }
        }
    }
}

pub(super) fn spawn_global_hotkey_proxy_mode<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    mode: SysProxyType,
) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        if let Err(error) = set_system_proxy_mode(app.clone(), state, mode) {
            tracing::warn!(?error, "global hotkey system proxy mode switch failed");
        }
    });
}

pub(super) fn apply_system_proxy<R>(
    _app: &tauri::AppHandle<R>,
    state: &AppState,
    config: &AppConfig,
    force_disable: bool,
) -> Result<SystemProxyStatus, SystemProxyManagerError>
where
    R: tauri::Runtime,
{
    let runtime_config = runtime_system_proxy_config(config, force_disable);
    state
        .system_proxy_manager()
        .apply_config(&runtime_config.config, runtime_config.force_disable)
}

#[derive(Debug, Clone)]
pub(super) struct RuntimeSystemProxyConfig {
    pub(super) config: AppConfig,
    pub(super) force_disable: bool,
}

pub(super) fn runtime_system_proxy_config(
    config: &AppConfig,
    force_disable: bool,
) -> RuntimeSystemProxyConfig {
    runtime_system_proxy_config_for_os(config, force_disable, TargetOs::current())
}

pub(super) fn runtime_system_proxy_config_for_os(
    config: &AppConfig,
    force_disable: bool,
    target_os: TargetOs,
) -> RuntimeSystemProxyConfig {
    let mut runtime = RuntimeSystemProxyConfig {
        config: config.clone(),
        force_disable,
    };

    if force_disable {
        return runtime;
    }

    if should_disable_native_tun_system_proxy(config, target_os) {
        runtime.force_disable = true;
        return runtime;
    }

    if should_apply_tun_system_proxy_fallback(config, target_os) {
        runtime.config.system_proxy_item.sys_proxy_type = SysProxyType::ForcedChange;
    }

    runtime
}

pub(super) fn should_disable_native_tun_system_proxy(
    config: &AppConfig,
    target_os: TargetOs,
) -> bool {
    config.tun_mode_item.enable_tun && tun_backend(target_os).is_native()
}

pub(super) fn should_apply_tun_system_proxy_fallback(
    config: &AppConfig,
    target_os: TargetOs,
) -> bool {
    config.tun_mode_item.enable_tun
        && config.system_proxy_item.sys_proxy_type == SysProxyType::ForcedClear
        && tun_backend(target_os) == PlatformTunBackend::Process
}

pub(super) fn runtime_proxy_url(
    prefer_proxy: bool,
    proxy_url: Option<String>,
    config: &AppConfig,
) -> Option<String> {
    runtime_proxy_url_for_os(prefer_proxy, proxy_url, config, TargetOs::current())
}

pub(super) fn runtime_proxy_url_for_os(
    prefer_proxy: bool,
    proxy_url: Option<String>,
    config: &AppConfig,
    target_os: TargetOs,
) -> Option<String> {
    let explicit = proxy_url.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    if !prefer_proxy {
        return explicit;
    }

    explicit.or_else(|| runtime_default_proxy_url_for_os(config, target_os))
}

pub(super) fn runtime_default_proxy_url_for_os(
    config: &AppConfig,
    target_os: TargetOs,
) -> Option<String> {
    if config.tun_mode_item.enable_tun && tun_backend(target_os).is_native() {
        return None;
    }

    let port = config
        .inbound
        .first()
        .map_or(voya_core::DEFAULT_LOCAL_PORT, |inbound| inbound.local_port);
    if !(1..=65535).contains(&port) {
        return None;
    }

    Some(format!("http://127.0.0.1:{port}"))
}

pub(crate) fn restore_system_proxy<R>(
    _app: &tauri::AppHandle<R>,
    state: &AppState,
) -> Result<SystemProxyStatus, AppError>
where
    R: tauri::Runtime,
{
    let config = current_config(state)?;

    state
        .system_proxy_manager()
        .restore(&config)
        .map_err(sysproxy_error)
}

pub(crate) fn restore_system_proxy_after_native_tun_failure<R>(
    app: &tauri::AppHandle<R>,
    state: &AppState,
    config: &AppConfig,
    reason: &str,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    if !should_disable_native_tun_system_proxy(config, TargetOs::current()) {
        return Ok(());
    }

    match restore_system_proxy(app, state) {
        Ok(status) => emit_sysproxy_changed(app, &status),
        Err(error) => {
            emit_runtime_log(
                app,
                LogLevel::Warn,
                &format!("System proxy restore after native TUN {reason} failed: {error:?}"),
            )?;
            Ok(())
        }
    }
}

pub(super) fn runtime_status_response(snapshot: SupervisorSnapshot) -> RuntimeStatusResponse {
    RuntimeStatusResponse {
        state: match snapshot.state {
            SupervisorConnectionState::Disconnected => RuntimeConnectionState::Disconnected,
            SupervisorConnectionState::Connected => RuntimeConnectionState::Connected,
        },
        active_profile_id: snapshot.active_profile_id,
        main_pid: snapshot.main_pid,
        pre_pid: snapshot.pre_pid,
        running_core_type: snapshot.running_core_type,
    }
}

pub(super) fn core_state_from_snapshot(snapshot: &SupervisorSnapshot) -> CoreState {
    match snapshot.state {
        SupervisorConnectionState::Disconnected => CoreState::Disconnected,
        SupervisorConnectionState::Connected => CoreState::Connected,
    }
}

pub(super) fn system_proxy_status_response(status: SystemProxyStatus) -> SystemProxyStatusResponse {
    SystemProxyStatusResponse {
        requested_mode: status.requested_type,
        effective_mode: status.effective_type,
        pac_available: status.pac_available,
        proxy: status.proxy,
        exceptions: status.exceptions,
        pac_url: status.pac_url,
    }
}

pub(crate) fn emit_runtime_log<R>(
    app: &tauri::AppHandle<R>,
    level: LogLevel,
    line: &str,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    TransientStreamEvent::LogLine(LogLineEvent {
        id: next_log_line_id(),
        level,
        line: line.to_string(),
    })
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(crate) fn emit_core_state<R>(
    app: &tauri::AppHandle<R>,
    state: CoreState,
    active_profile_id: Option<String>,
    snapshot: Option<&SupervisorSnapshot>,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    TransientStreamEvent::CoreState(core_state_event(state, active_profile_id, snapshot))
        .emit(app)
        .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(crate) fn emit_statistics_zero<R>(app: &tauri::AppHandle<R>) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    TransientStreamEvent::Statistics(crate::ipc::events::StatisticsSnapshot {
        active_profile_id: None,
        proxy_upload_bytes_per_second: 0.0,
        proxy_download_bytes_per_second: 0.0,
        direct_upload_bytes_per_second: 0.0,
        direct_download_bytes_per_second: 0.0,
        upload_bytes_per_second: 0.0,
        download_bytes_per_second: 0.0,
        server_stat: None,
    })
    .emit(app)
    .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn emit_speedtest_result<R>(
    app: &tauri::AppHandle<R>,
    result: &SpeedTestResult,
) -> Result<(), AppError>
where
    R: tauri::Runtime,
{
    TransientStreamEvent::SpeedtestResult(result.clone())
        .emit(app)
        .map_err(|error| AppError::EventEmit(error.to_string()))
}

pub(super) fn core_state_event(
    state: CoreState,
    active_profile_id: Option<String>,
    snapshot: Option<&SupervisorSnapshot>,
) -> CoreStateEvent {
    CoreStateEvent {
        state,
        active_profile_id: snapshot
            .and_then(|snapshot| snapshot.active_profile_id.clone())
            .or(active_profile_id),
        main_pid: snapshot.and_then(|snapshot| snapshot.main_pid),
        pre_pid: snapshot.and_then(|snapshot| snapshot.pre_pid),
        running_core_type: snapshot.and_then(|snapshot| snapshot.running_core_type),
    }
}

pub(super) fn persist_config_if_changed(
    state: &AppState,
    original: &AppConfig,
    updated: &AppConfig,
) -> Result<(), AppError> {
    if original == updated {
        return Ok(());
    }

    state
        .config_store()
        .save(updated)
        .map_err(|error| AppError::ConfigSave(error.to_string()))?;
    let mut guard = state
        .config()
        .write()
        .map_err(|_| AppError::State("app config lock is poisoned".to_string()))?;
    *guard = updated.clone();

    Ok(())
}

pub(super) fn profile_error(error: ProfileManagerError) -> AppError {
    match error {
        ProfileManagerError::Database(error) => AppError::Database(error.to_string()),
        error => AppError::Profile(error.to_string()),
    }
}

pub(super) fn runtime_error(error: RuntimeError) -> AppError {
    let message = error.to_string();
    match error {
        RuntimeError::CoreInfo(CoreInfoError::ExecutableNotFound {
            core_type,
            search_dir: _,
            candidates,
            url,
        }) => AppError::MissingCore(MissingCoreError {
            message: missing_core_error_message(core_type),
            core_type,
            search_dir: missing_core_search_dir_label(),
            candidates: missing_core_candidates(&candidates),
            download_url: url.to_string(),
        }),
        _ => AppError::Runtime(message),
    }
}

pub(super) fn missing_core_error_message(core_type: CoreType) -> String {
    format!(
        "core {core_type:?} executable is missing; install or update the core package and try again"
    )
}

pub(super) fn missing_core_search_dir_label() -> String {
    MISSING_CORE_SEARCH_DIR_LABEL.to_string()
}

pub(super) fn missing_core_candidates(candidates: &str) -> Vec<String> {
    candidates
        .split(',')
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .map(ToString::to_string)
        .collect()
}

pub(super) fn core_seed_install_result(outcome: CoreSeedCopyOutcome) -> CoreSeedInstallResult {
    let status = match outcome.status {
        CoreSeedCopyStatus::Copied => CoreSeedInstallStatus::Installed,
        CoreSeedCopyStatus::AlreadyInstalled => CoreSeedInstallStatus::AlreadyInstalled,
        CoreSeedCopyStatus::SeedMissing => CoreSeedInstallStatus::SeedMissing,
    };
    let installed_files = outcome
        .copied_files
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();

    CoreSeedInstallResult {
        core_type: outcome.core_type,
        status,
        installed_files,
    }
}

pub(super) fn core_seed_install_error(error: CoreInfoError) -> AppError {
    AppError::Runtime(error.to_string())
}

pub(super) fn group_error(error: GroupManagerError) -> AppError {
    match error {
        GroupManagerError::Database(error) => AppError::Database(error.to_string()),
        GroupManagerError::Profile(error) => profile_error(error),
        error => AppError::Group(error.to_string()),
    }
}

pub(super) fn subscription_error(error: SubscriptionManagerError) -> AppError {
    match error {
        SubscriptionManagerError::Database(error) => AppError::Database(error.to_string()),
        error => AppError::Subscription(error.to_string()),
    }
}

pub(super) fn routing_error(error: RoutingManagerError) -> AppError {
    match error {
        RoutingManagerError::Database(error) => AppError::Database(error.to_string()),
        error => AppError::Routing(error.to_string()),
    }
}

pub(super) fn speedtest_error(error: SpeedtestError) -> AppError {
    AppError::Speedtest(error.to_string())
}

pub(super) fn preset_error(error: PresetManagerError) -> AppError {
    match error {
        PresetManagerError::Database(error) => AppError::Database(error.to_string()),
        PresetManagerError::Routing(RoutingManagerError::Database(error)) => {
            AppError::Database(error.to_string())
        }
        error => AppError::Preset(error.to_string()),
    }
}

pub(super) fn qr_error(error: QrCodeError) -> AppError {
    match error {
        QrCodeError::EmptyContent => AppError::Qr("QR content is empty".to_string()),
        QrCodeError::Generate(_) => AppError::Qr("failed to generate QR code".to_string()),
    }
}

pub(super) fn certificate_error(error: CertificateError) -> AppError {
    AppError::Certificate(error.to_string())
}

pub(super) fn template_error(error: FullConfigTemplateManagerError) -> AppError {
    match error {
        FullConfigTemplateManagerError::Db(error) => AppError::Database(error.to_string()),
        error => AppError::Template(error.to_string()),
    }
}

pub(super) fn export_error(error: ExportManagerError) -> AppError {
    match error {
        ExportManagerError::Database(error) => AppError::Database(error.to_string()),
        error => AppError::Export(error.to_string()),
    }
}

pub(super) fn clash_error(error: ClashManagerError) -> AppError {
    AppError::Clash(error.to_string())
}

pub(super) fn dns_error(error: DnsManagerError) -> AppError {
    match error {
        DnsManagerError::Database(error) => AppError::Database(error.to_string()),
        DnsManagerError::Validation(issues) => AppError::Dns(DnsCommandError {
            message: "DNS settings validation failed".to_string(),
            issues,
        }),
    }
}

pub(super) fn autostart_error(error: AutostartManagerError) -> AppError {
    AppError::Autostart(error.to_string())
}

pub(super) fn hotkey_error(error: HotkeyManagerError) -> AppError {
    AppError::Hotkey(error.to_string())
}

pub(super) fn sysproxy_error(error: SystemProxyManagerError) -> AppError {
    AppError::SysProxy(error.to_string())
}

pub(super) fn tun_error(error: TunManagerError) -> AppError {
    match error {
        TunManagerError::ElevationRequired => AppError::Sudo(error.to_string()),
        TunManagerError::UnsupportedPlatform | TunManagerError::ProviderPathMismatch { .. } => {
            AppError::Tun(error.to_string())
        }
    }
}

pub(super) fn app_updater_state_for_error(error: &tauri_plugin_updater::Error) -> AppUpdaterState {
    match error {
        tauri_plugin_updater::Error::EmptyEndpoints => AppUpdaterState::Unconfigured,
        tauri_plugin_updater::Error::UnsupportedArch
        | tauri_plugin_updater::Error::UnsupportedOs => AppUpdaterState::Unsupported,
        _ => AppUpdaterState::Error,
    }
}

pub(super) fn update_error(error: UpdateManagerError) -> AppError {
    match error {
        UpdateManagerError::Database(error) => AppError::Database(error.to_string()),
        error => AppError::Update(error.to_string()),
    }
}

pub(super) fn elevation_error(error: ElevationError) -> AppError {
    AppError::Sudo(error.to_string())
}

pub(super) fn current_unix_time() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            i64::try_from(duration.as_secs()).unwrap_or(i64::MAX)
        })
}
