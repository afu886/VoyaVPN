import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@voya/ui/components/button";
import { Separator } from "@voya/ui/components/separator";
import { useI18n } from "@voya/i18n/use-i18n";
import {
  autostartStatus,
  diagnosticsStatus,
  loadUiPreferences,
  saveUiPreferences,
  setAutostartEnabled,
  setDiagnosticsEnabled,
} from "@/ipc";
import type { AutostartStatus, DiagnosticsStatus, UiPreferences } from "@/ipc/bindings";
import { type ThemeMode, usePreferencesStore } from "@/stores/preferences-store";
import { redactOperationalError } from "@voya/utils/operational-redaction";
import { useMountedRef } from "@voya/utils/use-mounted-ref";
import { getErrorMessage } from "@voya/utils/error";
import { cn } from "@voya/ui/lib/utils";

import { SettingsCheckbox, SettingsCheckboxGroup, SettingsGroup, SettingsRow } from "./settings-form";
import {
  applyUiPreferences,
  normalizeUiPreferences,
  UI_PREFERENCES_QUERY_KEY,
  useUiPreferencesQuery,
} from "./ui-preferences";

const themeOptions: Array<{ icon: typeof Monitor; labelKey: string; value: ThemeMode }> = [
  { icon: Monitor, labelKey: "menu.themeSystem", value: "system" },
  { icon: Sun, labelKey: "menu.themeLight", value: "light" },
  { icon: Moon, labelKey: "menu.themeDark", value: "dark" },
];

// Selected option buttons (theme/language) read blue — an accent-blue-light
// tint with a blue border/text, matching the sidebar's active-row treatment —
// instead of the neutral secondary fill. Applied on the `aria-pressed` button.
export const selectedOptionClass =
  "border border-primary bg-accent-blue-light text-brand hover:bg-accent-blue-light hover:text-brand";

export function GeneralTab() {
  const { language, localeOptions, t } = useI18n();
  const queryClient = useQueryClient();
  const themeMode = usePreferencesStore((state) => state.themeMode);
  const preferencesQuery = useUiPreferencesQuery();

  const [autostart, setAutostart] = useState<AutostartStatus | null>(null);
  const [autostartError, setAutostartError] = useState<string | null>(null);
  const [autostartWorking, setAutostartWorking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsStatus | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [diagnosticsWorking, setDiagnosticsWorking] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [preferencesWorking, setPreferencesWorking] = useState(false);
  const generationRef = useRef(0);
  const preferencesWorkingRef = useRef(false);
  const mountedRef = useMountedRef();

  useEffect(() => {
    const generation = ++generationRef.current;
    const isCurrent = () => mountedRef.current && generation === generationRef.current;

    void autostartStatus()
      .then((status) => {
        if (isCurrent()) {
          setAutostart(status);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent()) {
          setAutostartError(getErrorMessage(error));
        }
      });

    void diagnosticsStatus()
      .then((status) => {
        if (isCurrent()) {
          setDiagnostics(status);
          setDiagnosticsError(null);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent()) {
          setDiagnosticsError(redactOperationalError(error));
        }
      });

    return () => {
      generationRef.current += 1;
    };
  }, [mountedRef]);

  async function toggleAutostart(enabled: boolean) {
    setAutostartWorking(true);
    setAutostartError(null);
    try {
      setAutostart(await setAutostartEnabled(enabled));
    } catch (error) {
      setAutostartError(getErrorMessage(error));
    } finally {
      setAutostartWorking(false);
    }
  }

  async function toggleDiagnostics(enabled: boolean) {
    setDiagnosticsWorking(true);
    setDiagnosticsError(null);
    try {
      setDiagnostics(await setDiagnosticsEnabled(enabled));
    } catch (error) {
      setDiagnosticsError(redactOperationalError(error));
    } finally {
      setDiagnosticsWorking(false);
    }
  }

  async function persistPreferences(nextPreferences: UiPreferences) {
    const previousPreferences = preferencesQuery.data;
    if (!previousPreferences || preferencesWorkingRef.current) {
      return;
    }

    preferencesWorkingRef.current = true;
    setPreferencesWorking(true);
    setPreferencesError(null);

    try {
      await queryClient.cancelQueries({ queryKey: UI_PREFERENCES_QUERY_KEY });
      queryClient.setQueryData(UI_PREFERENCES_QUERY_KEY, nextPreferences);
      await applyUiPreferences(nextPreferences).catch(() => undefined);

      const savedPreferences = normalizeUiPreferences(
        await saveUiPreferences(nextPreferences),
      );
      queryClient.setQueryData(UI_PREFERENCES_QUERY_KEY, savedPreferences);
      try {
        await applyUiPreferences(savedPreferences);
      } catch (error) {
        if (mountedRef.current) {
          setPreferencesError(getErrorMessage(error));
        }
      }
    } catch (error) {
      let authoritativePreferences = previousPreferences;
      try {
        authoritativePreferences = normalizeUiPreferences(await loadUiPreferences());
      } catch {
        // If the authoritative reload also fails, the pre-mutation snapshot is
        // the safest available rollback value.
      }
      queryClient.setQueryData(UI_PREFERENCES_QUERY_KEY, authoritativePreferences);
      await applyUiPreferences(authoritativePreferences).catch(() => undefined);
      if (mountedRef.current) {
        setPreferencesError(getErrorMessage(error));
      }
    } finally {
      preferencesWorkingRef.current = false;
      if (mountedRef.current) {
        setPreferencesWorking(false);
      }
    }
  }

  const preferences = preferencesQuery.data;
  const preferencesDisabled = !preferences || preferencesWorking;
  const displayedPreferencesError = preferencesError ??
    (preferencesQuery.error ? getErrorMessage(preferencesQuery.error) : null);

  const artifact = autostart?.artifactPath
    ? autostart.artifactName
      ? `${autostart.artifactName} · ${autostart.artifactPath}`
      : autostart.artifactPath
    : (autostart?.artifactName ?? "");

  return (
    <div className="grid gap-4">
      <SettingsGroup>
        <SettingsRow label={t("modal.theme")}>
          <div className="flex flex-wrap gap-2">
            {themeOptions.map((option) => {
              const Icon = option.icon;

              return (
                <Button
                  key={option.value}
                  aria-pressed={themeMode === option.value}
                  className={cn("h-8 min-w-0 px-3", themeMode === option.value && selectedOptionClass)}
                  disabled={preferencesDisabled}
                  onClick={() => {
                    if (preferences && preferences.theme !== option.value) {
                      void persistPreferences({ ...preferences, theme: option.value });
                    }
                  }}
                  type="button"
                  variant={themeMode === option.value ? "secondary" : "outline"}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span className="truncate">{t(option.labelKey)}</span>
                </Button>
              );
            })}
          </div>
        </SettingsRow>

        <SettingsRow align="start" label={t("modal.language")}>
          <div className="flex flex-wrap gap-2">
            {localeOptions.map((locale) => (
              <Button
                key={locale.code}
                aria-pressed={language === locale.code}
                className={cn("h-8 min-w-12 px-2 text-xs", language === locale.code && selectedOptionClass)}
                disabled={preferencesDisabled}
                onClick={() => {
                  if (preferences && preferences.language !== locale.code) {
                    void persistPreferences({ ...preferences, language: locale.code });
                  }
                }}
                type="button"
                variant={language === locale.code ? "secondary" : "outline"}
              >
                {locale.label}
              </Button>
            ))}
          </div>
        </SettingsRow>
        {displayedPreferencesError ? (
          <p className="text-xs text-destructive" role="alert">
            {displayedPreferencesError}
          </p>
        ) : null}
      </SettingsGroup>

      <Separator />

      <SettingsGroup>
        <SettingsCheckboxGroup id="settings-startup-group" label={t("settings.startup")}>
          <SettingsCheckbox
            checked={autostart?.enabled ?? false}
            description={artifact || null}
            disabled={!autostart || autostartWorking}
            label={t("options.autostart")}
            onCheckedChange={(checked) => void toggleAutostart(checked === true)}
          />
          <SettingsCheckbox
            checked={diagnostics?.enabled ?? true}
            description={t("options.diagnosticsScope")}
            disabled={!diagnostics || diagnosticsWorking}
            label={t("options.diagnostics")}
            onCheckedChange={(checked) => void toggleDiagnostics(checked === true)}
          />
        </SettingsCheckboxGroup>
        {autostartError ? <p className="text-xs text-destructive">{autostartError}</p> : null}
        {diagnosticsError ? <p className="text-xs text-destructive">{diagnosticsError}</p> : null}
      </SettingsGroup>
    </div>
  );
}
