import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Save } from "lucide-react";

import { Button } from "@voya/ui/components/button";
import { Input } from "@voya/ui/components/input";
import { useI18n } from "@voya/i18n/use-i18n";
import { globalHotkeyStatus, saveGlobalHotkeys } from "@/ipc";
import type {
  GlobalHotkey,
  HotkeyStatus_Serialize,
  KeyEventItem_Deserialize,
  KeyEventItem_Serialize,
} from "@/ipc/bindings";
import { useMountedRef } from "@voya/utils/use-mounted-ref";
import { getErrorMessage } from "@voya/utils/error";

import { SettingsGroup, SettingsRow } from "./settings-form";

type MutableKeyEventItem = Required<Pick<KeyEventItem_Deserialize, "Alt" | "Control" | "Shift">> & {
  EGlobalHotkey: GlobalHotkey;
  KeyCode: number | null;
};

export function HotkeysTab() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [hotkeys, setHotkeys] = useState<HotkeyStatus_Serialize | null>(null);
  const [settings, setSettings] = useState<MutableKeyEventItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [working, setWorking] = useState(false);
  const generationRef = useRef(0);
  const mountedRef = useMountedRef();

  useEffect(() => {
    const generation = ++generationRef.current;
    const isCurrent = () => mountedRef.current && generation === generationRef.current;

    void globalHotkeyStatus()
      .then((status) => {
        if (!isCurrent()) {
          return;
        }
        setHotkeys(status);
        setSettings(status.settings.map(toMutableSetting));
      })
      .catch((error: unknown) => {
        if (isCurrent()) {
          setError(getErrorMessage(error));
        }
      });

    return () => {
      generationRef.current += 1;
    };
  }, [mountedRef]);

  async function saveHotkeys() {
    setWorking(true);
    setError(null);
    setSaved(false);
    try {
      const status = await saveGlobalHotkeys(settings.map(toKeyEventPayload));
      setHotkeys(status);
      setSettings(status.settings.map(toMutableSetting));
      setSaved(true);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  function patchSetting(action: GlobalHotkey, patch: Partial<MutableKeyEventItem>) {
    setSaved(false);
    setSettings((current) =>
      current.map((setting) => (setting.EGlobalHotkey === action ? { ...setting, ...patch } : setting)),
    );
  }

  return (
    <div className="grid gap-4">
      <SettingsGroup>
        {hotkeys?.actions.map((action) => {
          const setting = settings.find((item) => item.EGlobalHotkey === action.action);

          if (!setting) {
            return null;
          }

          return (
            <SettingsRow key={action.action} label={hotkeyLabel(action.action, action.label, t)}>
              <div className="flex flex-wrap items-center gap-2">
                <ModifierButton
                  active={setting.Control}
                  label="Ctrl"
                  onClick={() => patchSetting(action.action, { Control: !setting.Control })}
                />
                <ModifierButton
                  active={setting.Alt}
                  label="Alt"
                  onClick={() => patchSetting(action.action, { Alt: !setting.Alt })}
                />
                <ModifierButton
                  active={setting.Shift}
                  label="Shift"
                  onClick={() => patchSetting(action.action, { Shift: !setting.Shift })}
                />
                <Input
                  aria-label={t("options.hotkeyKey")}
                  className="h-8 w-28 px-2 text-sm"
                  data-hotkey-capture=""
                  onKeyDown={(event) => {
                    const keyCode = keyCodeFromEvent(event);
                    if (keyCode !== null) {
                      patchSetting(action.action, { KeyCode: keyCode });
                    }
                  }}
                  readOnly
                  value={keyCodeLabel(setting.KeyCode)}
                />
                <Button
                  className="h-7 px-2 text-xs"
                  onClick={() => patchSetting(action.action, { KeyCode: null })}
                  type="button"
                  variant="ghost"
                >
                  {t("actions.clear")}
                </Button>
              </div>
            </SettingsRow>
          );
        })}

        <SettingsRow>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!hotkeys || working}
              onClick={() => void saveHotkeys()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Save className="size-4" aria-hidden="true" />
              {t("actions.save")}
            </Button>
            {saved ? <span className="text-xs text-muted-foreground">{t("options.saved")}</span> : null}
            {hotkeys ? (
              <span className="text-xs text-muted-foreground">
                {t("options.hotkeysRegistered", { count: hotkeys.registered.length })}
              </span>
            ) : null}
          </div>
        </SettingsRow>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </SettingsGroup>
    </div>
  );
}

function ModifierButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-pressed={active}
      className="h-8 px-2 text-xs"
      onClick={onClick}
      type="button"
      variant={active ? "secondary" : "outline"}
    >
      {label}
    </Button>
  );
}

function toMutableSetting(setting: KeyEventItem_Serialize): MutableKeyEventItem {
  return {
    Alt: setting.Alt,
    Control: setting.Control,
    EGlobalHotkey: setting.EGlobalHotkey,
    KeyCode: setting.KeyCode ?? null,
    Shift: setting.Shift,
  };
}

function toKeyEventPayload(setting: MutableKeyEventItem): KeyEventItem_Deserialize {
  return {
    Alt: setting.Alt,
    Control: setting.Control,
    EGlobalHotkey: setting.EGlobalHotkey,
    KeyCode: setting.KeyCode,
    Shift: setting.Shift,
  };
}

function hotkeyLabel(action: GlobalHotkey, fallback: string, t: (key: string) => string): string {
  switch (action) {
    case 0:
      return t("options.hotkeyShowWindow");
    case 1:
      return t("options.hotkeyProxyClear");
    case 2:
      return t("options.hotkeyProxySet");
    case 3:
      return t("options.hotkeyProxyKeep");
    case 4:
      return t("options.hotkeyProxyPac");
    default:
      return fallback;
  }
}

function keyCodeFromEvent(event: KeyboardEvent<HTMLInputElement>): number | null {
  if (["Alt", "Control", "Meta", "Shift"].includes(event.key)) {
    return null;
  }

  // Recording swallows the key's default action. Escape-dismissal of the
  // Settings window is vetoed separately by settings-window.tsx's capture
  // listener, keyed off the data-hotkey-capture attribute.
  event.preventDefault();
  return event.keyCode || event.which || null;
}

function keyCodeLabel(keyCode: number | null): string {
  if (!keyCode) {
    return "";
  }
  if (keyCode >= 65 && keyCode <= 90) {
    return String.fromCharCode(keyCode);
  }
  if (keyCode >= 48 && keyCode <= 57) {
    return String.fromCharCode(keyCode);
  }
  if (keyCode >= 112 && keyCode <= 135) {
    return `F${keyCode - 111}`;
  }

  const labels: Record<number, string> = {
    8: "Backspace",
    9: "Tab",
    13: "Enter",
    27: "Esc",
    32: "Space",
    33: "Page Up",
    34: "Page Down",
    35: "End",
    36: "Home",
    37: "Left",
    38: "Up",
    39: "Right",
    40: "Down",
    45: "Insert",
    46: "Delete",
    186: ";",
    187: "=",
    188: ",",
    189: "-",
    190: ".",
    191: "/",
    192: "`",
    219: "[",
    220: "\\",
    221: "]",
    222: "'",
  };

  return labels[keyCode] ?? `#${keyCode}`;
}
