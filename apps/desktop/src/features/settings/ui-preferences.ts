import { useQuery } from "@tanstack/react-query";

import {
  applyDocumentLocale,
  changeLocale,
  getInitialLocale,
  i18next,
  localeOptions,
  type Locale,
} from "@voya/i18n";
import { loadUiPreferences } from "@/ipc";
import type { UiPreferences } from "@/ipc/bindings";
import {
  isThemeMode,
  type ThemeMode,
  usePreferencesStore,
} from "@/stores/preferences-store";

export const UI_PREFERENCES_QUERY_KEY = ["ui-preferences"] as const;

type NormalizedUiPreferences = UiPreferences & {
  language: Locale;
  theme: ThemeMode;
};

export function useUiPreferencesQuery() {
  return useQuery({
    queryFn: loadUiPreferences,
    queryKey: UI_PREFERENCES_QUERY_KEY,
    select: normalizeUiPreferences,
  });
}

export function normalizeUiPreferences(preferences: UiPreferences): NormalizedUiPreferences {
  return {
    language: isLocale(preferences.language) ? preferences.language : getInitialLocale(),
    theme: isThemeMode(preferences.theme) ? preferences.theme : "system",
  };
}

export async function applyUiPreferences(preferences: UiPreferences) {
  const normalized = normalizeUiPreferences(preferences);
  usePreferencesStore.getState().setThemeMode(normalized.theme);

  const currentLanguage = i18next.resolvedLanguage ?? i18next.language;
  if (currentLanguage === normalized.language) {
    applyDocumentLocale(normalized.language);
    return;
  }

  await changeLocale(normalized.language);
}

function isLocale(value: string): value is Locale {
  return localeOptions.some((locale) => locale.code === value);
}
