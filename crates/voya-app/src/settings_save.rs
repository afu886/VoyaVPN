use voya_core::AppConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsRuntimeAction {
    None,
    ReapplySystemProxy,
    Restart,
}

#[must_use]
pub const fn settings_runtime_action(
    runtime_restart_required: bool,
    system_proxy_reapply_required: bool,
) -> SettingsRuntimeAction {
    if runtime_restart_required {
        SettingsRuntimeAction::Restart
    } else if system_proxy_reapply_required {
        SettingsRuntimeAction::ReapplySystemProxy
    } else {
        SettingsRuntimeAction::None
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AppliedSettingsSideEffects {
    autostart_touched: bool,
    hotkeys_touched: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsSideEffectStage {
    Autostart,
    Hotkeys,
}

#[derive(Debug)]
pub struct SettingsSideEffectFailure<E> {
    pub stage: SettingsSideEffectStage,
    pub source: E,
    pub compensation_errors: Vec<E>,
}

pub trait SettingsSideEffectAdapter {
    type Error;

    fn apply_autostart(&self, config: &AppConfig) -> Result<(), Self::Error>;
    fn apply_hotkeys(&self, config: &AppConfig) -> Result<(), Self::Error>;
}

pub fn apply_settings_side_effects<A>(
    adapter: &A,
    original: &AppConfig,
    target: &AppConfig,
) -> Result<AppliedSettingsSideEffects, SettingsSideEffectFailure<A::Error>>
where
    A: SettingsSideEffectAdapter,
{
    let mut applied = AppliedSettingsSideEffects::default();
    if original.gui_item.auto_run != target.gui_item.auto_run {
        applied.autostart_touched = true;
        if let Err(source) = adapter.apply_autostart(target) {
            return Err(SettingsSideEffectFailure {
                stage: SettingsSideEffectStage::Autostart,
                source,
                compensation_errors: compensate_settings_side_effects(adapter, original, applied),
            });
        }
    }
    if original.global_hotkeys != target.global_hotkeys {
        applied.hotkeys_touched = true;
        if let Err(source) = adapter.apply_hotkeys(target) {
            return Err(SettingsSideEffectFailure {
                stage: SettingsSideEffectStage::Hotkeys,
                source,
                compensation_errors: compensate_settings_side_effects(adapter, original, applied),
            });
        }
    }
    Ok(applied)
}

pub fn compensate_settings_side_effects<A>(
    adapter: &A,
    original: &AppConfig,
    applied: AppliedSettingsSideEffects,
) -> Vec<A::Error>
where
    A: SettingsSideEffectAdapter,
{
    let mut errors = Vec::new();
    if applied.hotkeys_touched {
        if let Err(error) = adapter.apply_hotkeys(original) {
            errors.push(error);
        }
    }
    if applied.autostart_touched {
        if let Err(error) = adapter.apply_autostart(original) {
            errors.push(error);
        }
    }
    errors
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use voya_core::{GlobalHotkey, KeyEventItem};

    use super::*;

    #[derive(Default)]
    struct FakeSideEffects {
        calls: Mutex<Vec<String>>,
        fail_autostart_for: Mutex<Option<bool>>,
        fail_hotkeys_for_key: Mutex<Option<i32>>,
    }

    impl SettingsSideEffectAdapter for FakeSideEffects {
        type Error = String;

        fn apply_autostart(&self, config: &AppConfig) -> Result<(), Self::Error> {
            let enabled = config.gui_item.auto_run;
            self.calls
                .lock()
                .expect("calls lock")
                .push(format!("autostart:{enabled}"));
            if *self.fail_autostart_for.lock().expect("autostart lock") == Some(enabled) {
                return Err(format!("autostart failed for {enabled}"));
            }
            Ok(())
        }

        fn apply_hotkeys(&self, config: &AppConfig) -> Result<(), Self::Error> {
            let key = config
                .global_hotkeys
                .first()
                .and_then(|item| item.key_code)
                .unwrap_or_default();
            self.calls
                .lock()
                .expect("calls lock")
                .push(format!("hotkeys:{key}"));
            if *self.fail_hotkeys_for_key.lock().expect("hotkey lock") == Some(key) {
                return Err(format!("hotkeys failed for {key}"));
            }
            Ok(())
        }
    }

    fn config(autostart: bool, key_code: i32) -> AppConfig {
        let mut config = AppConfig::default();
        config.gui_item.auto_run = autostart;
        config.global_hotkeys = vec![KeyEventItem {
            global_hotkey: GlobalHotkey::ShowForm,
            control: true,
            key_code: Some(key_code),
            ..KeyEventItem::default()
        }];
        config
    }

    #[test]
    fn failed_hotkey_application_restores_every_touched_side_effect() {
        let original = config(false, 65);
        let target = config(true, 66);
        let effects = FakeSideEffects::default();
        *effects.fail_hotkeys_for_key.lock().expect("hotkey lock") = Some(66);

        let failure = apply_settings_side_effects(&effects, &original, &target)
            .expect_err("hotkey application should fail");

        assert_eq!(failure.stage, SettingsSideEffectStage::Hotkeys);
        assert_eq!(failure.source, "hotkeys failed for 66");
        assert!(failure.compensation_errors.is_empty());
        assert_eq!(
            *effects.calls.lock().expect("calls lock"),
            [
                "autostart:true",
                "hotkeys:66",
                "hotkeys:65",
                "autostart:false"
            ]
        );
    }

    #[test]
    fn failed_autostart_application_attempts_authoritative_restore() {
        let original = config(false, 65);
        let target = config(true, 65);
        let effects = FakeSideEffects::default();
        *effects.fail_autostart_for.lock().expect("autostart lock") = Some(true);

        let failure = apply_settings_side_effects(&effects, &original, &target)
            .expect_err("autostart application should fail");

        assert_eq!(failure.stage, SettingsSideEffectStage::Autostart);
        assert!(failure.compensation_errors.is_empty());
        assert_eq!(
            *effects.calls.lock().expect("calls lock"),
            ["autostart:true", "autostart:false"]
        );
    }

    #[test]
    fn restart_dominates_proxy_reapply_as_the_single_runtime_action() {
        assert_eq!(
            settings_runtime_action(true, true),
            SettingsRuntimeAction::Restart
        );
        assert_eq!(
            settings_runtime_action(false, true),
            SettingsRuntimeAction::ReapplySystemProxy
        );
        assert_eq!(
            settings_runtime_action(false, false),
            SettingsRuntimeAction::None
        );
    }
}
