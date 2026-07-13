use serde::Serialize;
use specta::Type;
use tauri::Manager;

use super::commands::AppError;
use crate::AppState;

const SETTINGS_WINDOW_LABEL: &str = "settings";

/// Title-bar layout selected per platform. Windows uses a fully self-drawn
/// borderless bar (minimize/maximize/close + drag region); every other platform
/// keeps its native window frame and draws no custom title bar (`None`).
// Only one variant is constructed in a given single-platform build, so the
// others are legitimately never built; allow dead_code rather than cfg the enum.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum TitleBarLayout {
    Windows,
    None,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WindowChromeConfig {
    pub title_bar_layout: TitleBarLayout,
}

/// Report the window decoration this build should render. Only Windows gets the
/// custom borderless title bar; macOS and Linux keep their native frame, and the
/// web fallback (no Tauri runtime) resolves to `none` on the frontend.
#[tauri::command]
#[specta::specta]
pub fn get_window_chrome_config() -> Result<WindowChromeConfig, AppError> {
    #[cfg(target_os = "windows")]
    let title_bar_layout = TitleBarLayout::Windows;
    #[cfg(not(target_os = "windows"))]
    let title_bar_layout = TitleBarLayout::None;

    Ok(WindowChromeConfig { title_bar_layout })
}

/// Open the settings window from its fixed Tauri configuration template.
/// Serializing creation avoids a check-then-create race when the user invokes
/// the command more than once before the first webview has finished building.
#[tauri::command]
#[specta::specta]
pub async fn open_settings_window<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let _creation_guard = state.settings_window_lock().lock().await;

    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        return restore_settings_window(&window);
    }

    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == SETTINGS_WINDOW_LABEL)
        .cloned()
        .ok_or_else(|| AppError::State("settings window configuration is missing".to_string()))?;
    let window = tauri::WebviewWindowBuilder::from_config(&app, &config)
        .map_err(|error| AppError::State(error.to_string()))?
        .build()
        .map_err(|error| AppError::State(error.to_string()))?;

    restore_settings_window(&window)
}

fn restore_settings_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), AppError> {
    window
        .unminimize()
        .map_err(|error| AppError::State(error.to_string()))?;
    window
        .show()
        .map_err(|error| AppError::State(error.to_string()))?;
    window
        .set_focus()
        .map_err(|error| AppError::State(error.to_string()))?;

    Ok(())
}

/// Tint the Windows Acrylic blur material to match the in-app light/dark theme.
/// The frontend drives its own (non-system) theme, so this command sets the tint
/// explicitly per mode to keep the native material's base color aligned with the
/// UI. Acrylic has a single variant; light and dark differ only by `color`.
///
/// Non-Windows platforms are a no-op: window effects are an OS capability, and
/// macOS / Linux / web fall back to the flat CSS neutral-gray veil.
#[tauri::command]
#[specta::specta]
#[allow(unused_variables)]
pub fn set_window_acrylic(window: tauri::WebviewWindow, dark: bool) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        use tauri::window::{Color, Effect, EffectsBuilder};
        // Higher alpha reads as a more solid, controllable gray; lower is glassier.
        // Neutral gray, one tint per mode — kept in sync with the `.voyavpn-acrylic`
        // veil in globals.css so the native material and the CSS layer agree.
        let color = if dark {
            Color(1, 4, 9, 200)
        } else {
            Color(246, 248, 250, 200)
        };
        window
            .set_effects(
                EffectsBuilder::new()
                    .effect(Effect::Acrylic)
                    .color(color)
                    .build(),
            )
            .map_err(|error| AppError::State(error.to_string()))?;
    }
    Ok(())
}
