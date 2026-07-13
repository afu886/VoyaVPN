import { useEffect } from "react";

import { applyDocumentLocale } from "@voya/i18n";
import { useI18n } from "@voya/i18n/use-i18n";
import { applyUiPreferences, useUiPreferencesQuery } from "@/features/settings/ui-preferences";
import {
  resolveThemeMode,
  type ThemeMode,
  usePreferencesStore,
} from "@/stores/preferences-store";

export function PreferencesBridge() {
  const preferencesQuery = useUiPreferencesQuery();
  const themeMode = usePreferencesStore((state) => state.themeMode);
  const { language } = useI18n();

  useEffect(() => {
    if (preferencesQuery.data) {
      void applyUiPreferences(preferencesQuery.data).catch(() => undefined);
    }
  }, [preferencesQuery.data]);

  useThemeEffects(themeMode);

  useEffect(() => {
    applyDocumentLocale(language);
  }, [language]);

  return null;
}

function useThemeEffects(themeMode: ThemeMode) {
  useEffect(() => {
    const root = document.documentElement;
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : undefined;

    const applyTheme = () => {
      const resolvedTheme = resolveThemeMode(themeMode);

      root.classList.toggle("dark", resolvedTheme === "dark");
      root.style.colorScheme = resolvedTheme;
    };

    applyTheme();

    if (
      themeMode !== "system" ||
      !media ||
      typeof media.addEventListener !== "function" ||
      typeof media.removeEventListener !== "function"
    ) {
      return undefined;
    }

    media.addEventListener("change", applyTheme);

    return () => media.removeEventListener("change", applyTheme);
  }, [themeMode]);
}
