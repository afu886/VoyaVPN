use thiserror::Error;
use voya_core::KeyEventItem;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HotkeyRegistration {
    pub accelerator: String,
}

#[must_use]
pub fn normalize_show_window_shortcut(item: Option<&KeyEventItem>) -> KeyEventItem {
    item.cloned().unwrap_or_default()
}

pub fn show_window_hotkey_registration(
    item: Option<&KeyEventItem>,
) -> Result<Option<HotkeyRegistration>, HotkeyError> {
    key_event_item_accelerator(&normalize_show_window_shortcut(item))
        .map(|accelerator| accelerator.map(|accelerator| HotkeyRegistration { accelerator }))
}

pub fn key_event_item_accelerator(item: &KeyEventItem) -> Result<Option<String>, HotkeyError> {
    let Some(key_code) = item.key_code else {
        return Ok(None);
    };
    if key_code <= 0 {
        return Ok(None);
    }

    let Some(key) = key_code_to_accelerator_key(key_code) else {
        return Err(HotkeyError::UnsupportedKeyCode(key_code));
    };

    let mut parts = Vec::new();
    if item.control {
        parts.push("Ctrl");
    }
    if item.alt {
        parts.push("Alt");
    }
    if item.shift {
        parts.push("Shift");
    }
    parts.push(key);

    let accelerator = parts.join("+");
    validate_hotkey_accelerator(&accelerator)?;

    Ok(Some(accelerator))
}

pub fn validate_hotkey_accelerator(accelerator: &str) -> Result<(), HotkeyError> {
    let mut saw_control = false;
    let mut saw_alt = false;
    let mut saw_shift = false;
    let mut saw_key = false;

    for part in accelerator.split('+') {
        match part {
            "Ctrl" if !saw_control && !saw_key => saw_control = true,
            "Alt" if !saw_alt && !saw_key => saw_alt = true,
            "Shift" if !saw_shift && !saw_key => saw_shift = true,
            key if !saw_key && is_known_accelerator_key(key) => saw_key = true,
            _ => {
                return Err(HotkeyError::InvalidAccelerator(accelerator.to_string()));
            }
        }
    }

    if !saw_key {
        return Err(HotkeyError::InvalidAccelerator(accelerator.to_string()));
    }
    validate_hotkey_modifiers(accelerator, saw_control, saw_alt)
}

fn validate_hotkey_modifiers(
    accelerator: &str,
    control: bool,
    alt: bool,
) -> Result<(), HotkeyError> {
    if control || alt {
        Ok(())
    } else {
        Err(HotkeyError::UnsupportedModifierChord(
            accelerator.to_string(),
        ))
    }
}

fn is_known_accelerator_key(key: &str) -> bool {
    (1..=222).any(|key_code| key_code_to_accelerator_key(key_code) == Some(key))
}

#[must_use]
pub fn key_code_to_accelerator_key(key_code: i32) -> Option<&'static str> {
    match key_code {
        8 => Some("Backspace"),
        9 => Some("Tab"),
        13 => Some("Enter"),
        19 => Some("Pause"),
        20 => Some("CapsLock"),
        27 => Some("Escape"),
        32 => Some("Space"),
        33 => Some("PageUp"),
        34 => Some("PageDown"),
        35 => Some("End"),
        36 => Some("Home"),
        37 => Some("ArrowLeft"),
        38 => Some("ArrowUp"),
        39 => Some("ArrowRight"),
        40 => Some("ArrowDown"),
        45 => Some("Insert"),
        46 => Some("Delete"),
        48 => Some("Digit0"),
        49 => Some("Digit1"),
        50 => Some("Digit2"),
        51 => Some("Digit3"),
        52 => Some("Digit4"),
        53 => Some("Digit5"),
        54 => Some("Digit6"),
        55 => Some("Digit7"),
        56 => Some("Digit8"),
        57 => Some("Digit9"),
        65 => Some("KeyA"),
        66 => Some("KeyB"),
        67 => Some("KeyC"),
        68 => Some("KeyD"),
        69 => Some("KeyE"),
        70 => Some("KeyF"),
        71 => Some("KeyG"),
        72 => Some("KeyH"),
        73 => Some("KeyI"),
        74 => Some("KeyJ"),
        75 => Some("KeyK"),
        76 => Some("KeyL"),
        77 => Some("KeyM"),
        78 => Some("KeyN"),
        79 => Some("KeyO"),
        80 => Some("KeyP"),
        81 => Some("KeyQ"),
        82 => Some("KeyR"),
        83 => Some("KeyS"),
        84 => Some("KeyT"),
        85 => Some("KeyU"),
        86 => Some("KeyV"),
        87 => Some("KeyW"),
        88 => Some("KeyX"),
        89 => Some("KeyY"),
        90 => Some("KeyZ"),
        96 => Some("Numpad0"),
        97 => Some("Numpad1"),
        98 => Some("Numpad2"),
        99 => Some("Numpad3"),
        100 => Some("Numpad4"),
        101 => Some("Numpad5"),
        102 => Some("Numpad6"),
        103 => Some("Numpad7"),
        104 => Some("Numpad8"),
        105 => Some("Numpad9"),
        106 => Some("NumpadMultiply"),
        107 => Some("NumpadAdd"),
        109 => Some("NumpadSubtract"),
        110 => Some("NumpadDecimal"),
        111 => Some("NumpadDivide"),
        112 => Some("F1"),
        113 => Some("F2"),
        114 => Some("F3"),
        115 => Some("F4"),
        116 => Some("F5"),
        117 => Some("F6"),
        118 => Some("F7"),
        119 => Some("F8"),
        120 => Some("F9"),
        121 => Some("F10"),
        122 => Some("F11"),
        123 => Some("F12"),
        124 => Some("F13"),
        125 => Some("F14"),
        126 => Some("F15"),
        127 => Some("F16"),
        128 => Some("F17"),
        129 => Some("F18"),
        130 => Some("F19"),
        131 => Some("F20"),
        132 => Some("F21"),
        133 => Some("F22"),
        134 => Some("F23"),
        135 => Some("F24"),
        186 => Some("Semicolon"),
        187 => Some("Equal"),
        188 => Some("Comma"),
        189 => Some("Minus"),
        190 => Some("Period"),
        191 => Some("Slash"),
        192 => Some("Backquote"),
        219 => Some("BracketLeft"),
        220 => Some("Backslash"),
        221 => Some("BracketRight"),
        222 => Some("Quote"),
        _ => None,
    }
}

#[derive(Debug, Error)]
pub enum HotkeyError {
    #[error("unsupported hotkey key code {0}")]
    UnsupportedKeyCode(i32),
    #[error("invalid global hotkey accelerator {0}")]
    InvalidAccelerator(String),
    #[error("unsupported global hotkey modifier chord {0}")]
    UnsupportedModifierChord(String),
}

#[cfg(test)]
mod hotkey_tests {
    use super::*;

    #[test]
    fn hotkey_normalization_only_represents_show_window() {
        assert_eq!(
            normalize_show_window_shortcut(None),
            KeyEventItem::default()
        );
    }

    #[test]
    fn hotkey_registration_builds_accelerators_from_key_events() {
        let registration = show_window_hotkey_registration(Some(&KeyEventItem {
            control: true,
            alt: true,
            shift: false,
            key_code: Some(83),
        }))
        .expect("registration");

        assert_eq!(
            registration,
            Some(HotkeyRegistration {
                accelerator: "Ctrl+Alt+KeyS".to_string()
            })
        );
    }

    #[test]
    fn hotkey_registration_rejects_modifierless_accelerator() {
        let error = show_window_hotkey_registration(Some(&KeyEventItem {
            control: false,
            alt: false,
            shift: false,
            key_code: Some(72),
        }))
        .expect_err("modifierless hotkey should fail");

        assert!(matches!(
            error,
            HotkeyError::UnsupportedModifierChord(accelerator) if accelerator == "KeyH"
        ));
    }

    #[test]
    fn hotkey_accelerator_validator_rejects_unknown_string_parts() {
        let error = validate_hotkey_accelerator("Ctrl+Command+KeyH")
            .expect_err("unknown modifier should fail");

        assert!(matches!(
            error,
            HotkeyError::InvalidAccelerator(accelerator)
                if accelerator == "Ctrl+Command+KeyH"
        ));
    }
}
