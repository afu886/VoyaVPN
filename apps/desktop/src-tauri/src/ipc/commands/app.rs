use super::{lifecycle::*, support::*, *};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum UiThemeMode {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UiPreferences {
    pub language: String,
    pub theme: UiThemeMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TunAdvancedSettings {
    pub auto_route: bool,
    pub strict_route: bool,
    pub stack: String,
    pub mtu: i32,
    pub enable_ipv6_address: bool,
    pub icmp_routing: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemProxyAdvancedSettings {
    pub system_proxy_exceptions: String,
    pub not_proxy_local_address: bool,
    pub system_proxy_advanced_protocol: String,
    pub custom_system_proxy_pac_path: Option<String>,
    pub custom_system_proxy_script_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSettings {
    pub tun: TunAdvancedSettings,
    pub system_proxy: SystemProxyAdvancedSettings,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsBundle {
    pub ui_preferences: UiPreferences,
    pub autostart_enabled: bool,
    pub show_window_hotkey: KeyEventItem,
    pub sources: ConfigSourceSettings,
    pub sub_convert_url: Option<String>,
    pub core_basic_item: voya_core::CoreBasicItem,
    pub mux4_sbox_item: voya_core::Mux4SboxItem,
    pub hysteria_item: voya_core::HysteriaItem,
    pub network: NetworkSettings,
    pub speed_test_item: voya_core::SpeedTestItem,
}

#[tauri::command]
#[specta::specta]
pub fn load_ui_preferences(state: tauri::State<'_, AppState>) -> Result<UiPreferences, AppError> {
    let config = current_config(&state)?;

    Ok(ui_preferences_from_config(&config))
}

#[tauri::command]
#[specta::specta]
pub fn load_settings_bundle(state: tauri::State<'_, AppState>) -> Result<SettingsBundle, AppError> {
    Ok(settings_bundle_from_config(&current_config(&state)?))
}

#[tauri::command]
#[specta::specta]
pub async fn save_settings_bundle<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    bundle: SettingsBundle,
) -> Result<SettingsBundle, AppError> {
    validate_settings_bundle(&bundle)?;

    let original = current_config(&state)?;
    let target = apply_settings_bundle(&original, bundle)?;
    let runtime_changed = saved_config_requires_runtime_restart(&original, &target);
    let system_proxy_changed = original.system_proxy_item != target.system_proxy_item;
    let side_effects = TauriSettingsSideEffects {
        autostart: AutostartManager::new(),
        hotkeys: HotkeyManager::new(std::sync::Arc::new(TauriHotkeyRegistrar {
            app: app.clone(),
        })),
    };
    let applied_side_effects = match apply_settings_side_effects(&side_effects, &original, &target)
    {
        Ok(applied) => applied,
        Err(failure) => {
            tracing::error!(stage = ?failure.stage, error = ?failure.source, "settings side effect failed");
            log_settings_compensation_errors(&failure.compensation_errors);
            return Err(failure.source);
        }
    };

    if let Err(error) = persist_config_if_changed(&state, &original, &target) {
        let compensation_errors =
            compensate_settings_side_effects(&side_effects, &original, applied_side_effects);
        log_settings_compensation_errors(&compensation_errors);
        return Err(error);
    }

    let apply_result = match settings_runtime_action(runtime_changed, system_proxy_changed) {
        SettingsRuntimeAction::Restart => {
            restart_if_connected_after_config_change(&app, &state, &target, "Settings saved").await
        }
        SettingsRuntimeAction::ReapplySystemProxy => {
            apply_system_proxy_if_connected_after_config_change(&app, &state, &target).await
        }
        SettingsRuntimeAction::None => Ok(()),
    };

    if let Err(error) = apply_result {
        if let Err(rollback_error) = persist_config_if_changed(&state, &target, &original) {
            tracing::error!(?rollback_error, "failed to roll back settings persistence");
        }
        let compensation_errors =
            compensate_settings_side_effects(&side_effects, &original, applied_side_effects);
        log_settings_compensation_errors(&compensation_errors);
        return Err(error);
    }

    if original != target {
        if let Err(error) = emit_settings_bundle_invalidation(&app, "settings-bundle-saved") {
            tracing::error!(
                ?error,
                "failed to broadcast committed settings invalidation"
            );
        }
    }

    Ok(settings_bundle_from_config(&target))
}

fn settings_bundle_from_config(config: &AppConfig) -> SettingsBundle {
    let mut show_window_hotkey = config
        .global_hotkeys
        .iter()
        .find(|item| item.global_hotkey == GlobalHotkey::ShowForm)
        .cloned()
        .unwrap_or_default();
    show_window_hotkey.global_hotkey = GlobalHotkey::ShowForm;

    SettingsBundle {
        ui_preferences: ui_preferences_from_config(config),
        autostart_enabled: config.gui_item.auto_run,
        show_window_hotkey,
        sources: voya_app::updates::source_settings(config),
        sub_convert_url: config.const_item.sub_convert_url.clone(),
        core_basic_item: config.core_basic_item.clone(),
        mux4_sbox_item: config.mux4_sbox_item.clone(),
        hysteria_item: config.hysteria_item.clone(),
        network: NetworkSettings {
            tun: TunAdvancedSettings {
                auto_route: config.tun_mode_item.auto_route,
                strict_route: config.tun_mode_item.strict_route,
                stack: config.tun_mode_item.stack.clone(),
                mtu: config.tun_mode_item.mtu,
                enable_ipv6_address: config.tun_mode_item.enable_ipv6_address,
                icmp_routing: config.tun_mode_item.icmp_routing.clone(),
            },
            system_proxy: SystemProxyAdvancedSettings {
                system_proxy_exceptions: config.system_proxy_item.system_proxy_exceptions.clone(),
                not_proxy_local_address: config.system_proxy_item.not_proxy_local_address,
                system_proxy_advanced_protocol: config
                    .system_proxy_item
                    .system_proxy_advanced_protocol
                    .clone(),
                custom_system_proxy_pac_path: config
                    .system_proxy_item
                    .custom_system_proxy_pac_path
                    .clone(),
                custom_system_proxy_script_path: config
                    .system_proxy_item
                    .custom_system_proxy_script_path
                    .clone(),
            },
        },
        speed_test_item: config.speed_test_item.clone(),
    }
}

fn apply_settings_bundle(
    latest: &AppConfig,
    mut bundle: SettingsBundle,
) -> Result<AppConfig, AppError> {
    let mut target = latest.clone();
    target.ui_item.current_language = bundle.ui_preferences.language.trim().to_string();
    target.ui_item.current_theme =
        Some(ui_theme_mode_to_config(bundle.ui_preferences.theme).to_string());
    target.gui_item.auto_run = bundle.autostart_enabled;

    bundle.show_window_hotkey.global_hotkey = GlobalHotkey::ShowForm;
    HotkeyManager::new(std::sync::Arc::new(voya_app::hotkeys::NoopHotkeyRegistrar))
        .save_settings(&mut target, vec![bundle.show_window_hotkey])
        .map_err(hotkey_error)?;

    voya_app::updates::apply_source_settings(&mut target, bundle.sources);
    target.const_item.sub_convert_url = clean_optional_setting(bundle.sub_convert_url);
    target.core_basic_item = bundle.core_basic_item;
    target.mux4_sbox_item = bundle.mux4_sbox_item;
    target.hysteria_item = bundle.hysteria_item;
    target.speed_test_item = bundle.speed_test_item;

    target.tun_mode_item.auto_route = bundle.network.tun.auto_route;
    target.tun_mode_item.strict_route = bundle.network.tun.strict_route;
    target.tun_mode_item.stack = bundle.network.tun.stack.trim().to_string();
    target.tun_mode_item.mtu = bundle.network.tun.mtu;
    target.tun_mode_item.enable_ipv6_address = bundle.network.tun.enable_ipv6_address;
    target.tun_mode_item.icmp_routing = bundle.network.tun.icmp_routing.trim().to_string();

    target.system_proxy_item.system_proxy_exceptions = bundle
        .network
        .system_proxy
        .system_proxy_exceptions
        .trim()
        .to_string();
    target.system_proxy_item.not_proxy_local_address =
        bundle.network.system_proxy.not_proxy_local_address;
    target.system_proxy_item.system_proxy_advanced_protocol = bundle
        .network
        .system_proxy
        .system_proxy_advanced_protocol
        .trim()
        .to_string();
    target.system_proxy_item.custom_system_proxy_pac_path =
        clean_optional_setting(bundle.network.system_proxy.custom_system_proxy_pac_path);
    target.system_proxy_item.custom_system_proxy_script_path =
        clean_optional_setting(bundle.network.system_proxy.custom_system_proxy_script_path);

    Ok(target)
}

fn validate_settings_bundle(bundle: &SettingsBundle) -> Result<(), AppError> {
    validate_required_ipc_text(
        bundle.ui_preferences.language.trim(),
        "UI language",
        IPC_NAME_MAX_CHARS,
        AppError::State,
    )?;
    for (label, value) in [
        ("Geo source URL", bundle.sources.geo_source_url.as_deref()),
        ("SRS source URL", bundle.sources.srs_source_url.as_deref()),
        (
            "routing template source URL",
            bundle.sources.route_rules_template_source_url.as_deref(),
        ),
        (
            "subscription converter URL",
            bundle.sub_convert_url.as_deref(),
        ),
    ] {
        validate_optional_ipc_text(value, label, IPC_PROXY_URL_MAX_CHARS, AppError::State)?;
        voya_app::updates::validate_optional_source_url(label, value)
            .map_err(|error| AppError::State(error.to_string()))?;
    }
    if !(576..=65_535).contains(&bundle.network.tun.mtu) {
        return Err(AppError::State(
            "TUN MTU must be between 576 and 65535".to_string(),
        ));
    }
    if bundle.hysteria_item.up_mbps < 0 || bundle.hysteria_item.down_mbps < 0 {
        return Err(AppError::State(
            "Hysteria bandwidth values cannot be negative".to_string(),
        ));
    }
    if bundle.hysteria_item.hop_interval < 5 {
        return Err(AppError::State(
            "Hysteria hop interval must be at least 5 seconds".to_string(),
        ));
    }
    Ok(())
}

fn clean_optional_setting(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[derive(Clone)]
struct TauriSettingsSideEffects {
    autostart: AutostartManager,
    hotkeys: HotkeyManager,
}

impl SettingsSideEffectAdapter for TauriSettingsSideEffects {
    type Error = AppError;

    fn apply_autostart(&self, config: &AppConfig) -> Result<(), Self::Error> {
        let mut config = config.clone();
        let enabled = config.gui_item.auto_run;
        self.autostart
            .set_enabled(&mut config, enabled)
            .map(|_| ())
            .map_err(autostart_error)
    }

    fn apply_hotkeys(&self, config: &AppConfig) -> Result<(), Self::Error> {
        self.hotkeys
            .register_from_config(config)
            .map(|_| ())
            .map_err(hotkey_error)
    }
}

fn log_settings_compensation_errors(errors: &[AppError]) {
    for error in errors {
        tracing::error!(?error, "failed to compensate settings side effect");
    }
}

fn ui_preferences_from_config(config: &AppConfig) -> UiPreferences {
    let language = config.ui_item.current_language.trim();
    UiPreferences {
        language: if language.is_empty() {
            voya_core::DEFAULT_LANGUAGE.to_string()
        } else {
            language.to_string()
        },
        theme: ui_theme_mode_from_config(config.ui_item.current_theme.as_deref()),
    }
}

fn ui_theme_mode_from_config(value: Option<&str>) -> UiThemeMode {
    match value.map(str::trim) {
        Some(value) if value.eq_ignore_ascii_case("dark") => UiThemeMode::Dark,
        Some(value) if value.eq_ignore_ascii_case("light") => UiThemeMode::Light,
        _ => UiThemeMode::System,
    }
}

fn ui_theme_mode_to_config(theme: UiThemeMode) -> &'static str {
    match theme {
        UiThemeMode::System => "FollowSystem",
        UiThemeMode::Light => "Light",
        UiThemeMode::Dark => "Dark",
    }
}

#[tauri::command]
#[specta::specta]
pub fn generate_qr_code(content: String) -> Result<QrCodeImage, AppError> {
    validate_ipc_qr_content(
        &content,
        "QR content",
        IPC_QR_CONTENT_MAX_CHARS,
        AppError::Qr,
    )?;

    QrCodeManager.generate_svg(&content).map_err(qr_error)
}

#[tauri::command]
#[specta::specta]
pub fn scan_screen_qr() -> Result<QrScanResult, AppError> {
    Ok(QrCodeManager.scan_screen())
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_certificate(
    request: CertificateFetchRequest,
) -> Result<CertificateFetchResult, AppError> {
    validate_required_ipc_text(
        &request.address,
        "certificate address",
        IPC_NAME_MAX_CHARS,
        AppError::Certificate,
    )?;
    if let Some(server_name) = request.server_name.as_deref() {
        validate_ipc_text(
            server_name,
            "certificate server name",
            IPC_NAME_MAX_CHARS,
            AppError::Certificate,
        )?;
    }

    fetch_certificate_impl(request)
        .await
        .map_err(certificate_error)
}

#[tauri::command]
#[specta::specta]
pub fn calculate_certificate_sha256(pem: String) -> Result<Vec<String>, AppError> {
    validate_required_ipc_text(
        &pem,
        "certificate PEM",
        IPC_QR_CONTENT_MAX_CHARS * 8,
        AppError::Certificate,
    )?;

    calculate_certificate_sha256_impl(&pem).map_err(certificate_error)
}

pub(crate) fn register_global_hotkeys_for_config<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    config: &AppConfig,
) -> Result<HotkeyStatus, AppError> {
    let registrar = std::sync::Arc::new(TauriHotkeyRegistrar { app: app.clone() });

    HotkeyManager::new(registrar)
        .register_from_config(config)
        .map_err(hotkey_error)
}

#[cfg(test)]
mod tests {
    use voya_core::SysProxyType;

    use super::*;

    #[test]
    fn saved_config_restart_scope_ignores_ui_only_changes() {
        let original = AppConfig::default();
        let mut updated = original.clone();
        updated.ui_item.current_language = "zh-Hans".to_string();
        updated.gui_item.display_real_time_speed = !updated.gui_item.display_real_time_speed;

        assert!(!saved_config_requires_runtime_restart(&original, &updated));
    }

    #[test]
    fn saved_config_restart_scope_detects_tun_and_inbound_changes() {
        let original = AppConfig::default();

        let mut tun_updated = original.clone();
        tun_updated.tun_mode_item.enable_tun = true;
        assert!(saved_config_requires_runtime_restart(
            &original,
            &tun_updated
        ));

        let mut inbound_updated = original.clone();
        inbound_updated.inbound[0].local_port += 1;
        assert!(saved_config_requires_runtime_restart(
            &original,
            &inbound_updated
        ));
    }

    #[test]
    fn saved_config_restart_scope_leaves_system_proxy_for_reapply_only() {
        let original = AppConfig::default();
        let mut updated = original.clone();
        updated.system_proxy_item.sys_proxy_type = SysProxyType::ForcedChange;

        assert!(!saved_config_requires_runtime_restart(&original, &updated));
    }

    #[test]
    fn ui_preferences_normalize_stored_language_and_theme() {
        let mut config = AppConfig::default();
        config.ui_item.current_language = "  fa  ".to_string();
        config.ui_item.current_theme = Some("dArK".to_string());

        assert_eq!(
            ui_preferences_from_config(&config),
            UiPreferences {
                language: "fa".to_string(),
                theme: UiThemeMode::Dark,
            }
        );

        config.ui_item.current_language.clear();
        config.ui_item.current_theme = Some("FollowSystem".to_string());
        assert_eq!(
            ui_preferences_from_config(&config),
            UiPreferences {
                language: voya_core::DEFAULT_LANGUAGE.to_string(),
                theme: UiThemeMode::System,
            }
        );
    }

    #[test]
    fn ui_theme_modes_use_existing_config_values() {
        assert_eq!(ui_theme_mode_to_config(UiThemeMode::System), "FollowSystem");
        assert_eq!(ui_theme_mode_to_config(UiThemeMode::Light), "Light");
        assert_eq!(ui_theme_mode_to_config(UiThemeMode::Dark), "Dark");
        assert_eq!(ui_theme_mode_from_config(Some("light")), UiThemeMode::Light);
        assert_eq!(ui_theme_mode_from_config(None), UiThemeMode::System);
    }

    #[test]
    fn settings_bundle_preserves_home_owned_tun_and_proxy_modes() {
        let mut latest = AppConfig::default();
        latest.tun_mode_item.enable_tun = true;
        latest.system_proxy_item.sys_proxy_type = SysProxyType::Pac;
        let mut bundle = settings_bundle_from_config(&latest);
        bundle.network.tun.mtu = 8_500;
        bundle.network.system_proxy.system_proxy_exceptions = "localhost".to_string();

        let target = apply_settings_bundle(&latest, bundle).expect("bundle should apply");

        assert!(target.tun_mode_item.enable_tun);
        assert_eq!(target.system_proxy_item.sys_proxy_type, SysProxyType::Pac);
        assert_eq!(target.tun_mode_item.mtu, 8_500);
        assert_eq!(
            target.system_proxy_item.system_proxy_exceptions,
            "localhost"
        );
    }

    #[test]
    fn settings_bundle_validation_rejects_the_complete_draft_before_apply() {
        let config = AppConfig::default();
        let mut bundle = settings_bundle_from_config(&config);
        bundle.network.tun.mtu = 100;

        assert!(validate_settings_bundle(&bundle).is_err());
        assert_eq!(config, AppConfig::default());
    }

    #[test]
    fn qr_generation_accepts_multiline_content() {
        let image = generate_qr_code("profile-1\r\nprofile-2\nprofile-3".to_string())
            .expect("multiline QR content should be accepted");

        assert_eq!(image.mime_type, "image/svg+xml");
        assert!(image.svg.contains("<svg"));
    }

    #[test]
    fn qr_generation_rejects_other_control_characters() {
        let error = generate_qr_code("profile-1\tprofile-2".to_string())
            .expect_err("non-line-ending control characters should be rejected");

        assert!(matches!(
            error,
            AppError::Qr(message) if message == "invalid QR content: control characters are not allowed"
        ));
    }

    #[test]
    fn qr_generation_rejects_content_over_4096_characters() {
        let error = generate_qr_code("a".repeat(IPC_QR_CONTENT_MAX_CHARS + 1))
            .expect_err("oversized QR content should be rejected");

        assert!(matches!(
            error,
            AppError::Qr(message) if message == "invalid QR content: value is too long"
        ));
    }
}
