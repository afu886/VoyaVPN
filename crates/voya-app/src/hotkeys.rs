use std::sync::Arc;

use thiserror::Error;
use voya_core::{AppConfig, KeyEventItem};
use voya_platform::hotkeys::{
    normalize_show_window_shortcut, show_window_hotkey_registration, HotkeyError,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShowWindowShortcutBinding {
    pub accelerator: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HotkeyStatus {
    pub show_window_shortcut: Option<KeyEventItem>,
    pub registered: Vec<ShowWindowShortcutBinding>,
}

pub trait HotkeyRegistrar: Send + Sync {
    fn unregister_all(&self) -> Result<(), HotkeyManagerError>;
    fn register(&self, bindings: &[ShowWindowShortcutBinding]) -> Result<(), HotkeyManagerError>;
}

#[derive(Clone)]
pub struct HotkeyManager {
    registrar: Arc<dyn HotkeyRegistrar>,
}

impl HotkeyManager {
    #[must_use]
    pub fn new(registrar: Arc<dyn HotkeyRegistrar>) -> Self {
        Self { registrar }
    }

    pub fn status(&self, config: &AppConfig) -> Result<HotkeyStatus, HotkeyManagerError> {
        status_from_settings(config.show_window_shortcut.as_ref())
    }

    pub fn register_from_config(
        &self,
        config: &AppConfig,
    ) -> Result<HotkeyStatus, HotkeyManagerError> {
        let status = self.status(config)?;
        self.registrar.unregister_all()?;
        self.registrar.register(&status.registered)?;

        Ok(status)
    }

    pub fn save_settings(
        &self,
        config: &mut AppConfig,
        shortcut: Option<KeyEventItem>,
    ) -> Result<HotkeyStatus, HotkeyManagerError> {
        config.show_window_shortcut = shortcut;
        self.register_from_config(config)
    }
}

#[derive(Debug, Error)]
pub enum HotkeyManagerError {
    #[error(transparent)]
    Platform(#[from] HotkeyError),
    #[error("global hotkey registration failed: {0}")]
    Register(String),
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NoopHotkeyRegistrar;

impl HotkeyRegistrar for NoopHotkeyRegistrar {
    fn unregister_all(&self) -> Result<(), HotkeyManagerError> {
        Ok(())
    }

    fn register(&self, _bindings: &[ShowWindowShortcutBinding]) -> Result<(), HotkeyManagerError> {
        Ok(())
    }
}

fn status_from_settings(
    shortcut: Option<&KeyEventItem>,
) -> Result<HotkeyStatus, HotkeyManagerError> {
    let normalized = normalize_show_window_shortcut(shortcut);
    let registered = show_window_hotkey_registration(shortcut)?
        .map(|registration| ShowWindowShortcutBinding {
            accelerator: registration.accelerator,
        })
        .into_iter()
        .collect();

    Ok(HotkeyStatus {
        show_window_shortcut: shortcut.map(|_| normalized),
        registered,
    })
}

#[cfg(test)]
mod hotkey_app_tests {
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    struct FakeHotkeyRegistrar {
        registered: Mutex<Vec<Vec<ShowWindowShortcutBinding>>>,
        unregisters: Mutex<u32>,
    }

    impl HotkeyRegistrar for FakeHotkeyRegistrar {
        fn unregister_all(&self) -> Result<(), HotkeyManagerError> {
            *self.unregisters.lock().expect("unregisters") += 1;
            Ok(())
        }

        fn register(
            &self,
            bindings: &[ShowWindowShortcutBinding],
        ) -> Result<(), HotkeyManagerError> {
            self.registered
                .lock()
                .expect("registered")
                .push(bindings.to_vec());
            Ok(())
        }
    }

    #[test]
    fn hotkey_manager_registers_enabled_settings_with_fake_registrar() {
        let registrar = Arc::new(FakeHotkeyRegistrar::default());
        let manager = HotkeyManager::new(registrar.clone());
        let mut config = AppConfig::default();

        manager
            .save_settings(
                &mut config,
                Some(KeyEventItem {
                    control: true,
                    alt: true,
                    shift: false,
                    key_code: Some(86),
                }),
            )
            .expect("save hotkeys");

        assert!(config.show_window_shortcut.is_some());
        assert_eq!(
            registrar.registered.lock().expect("registered")[0],
            vec![ShowWindowShortcutBinding {
                accelerator: "Ctrl+Alt+KeyV".to_string(),
            },]
        );
        assert_eq!(*registrar.unregisters.lock().expect("unregisters"), 1);
    }
}
