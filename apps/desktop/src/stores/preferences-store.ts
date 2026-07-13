import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { UiItem_Serialize } from "@/ipc/bindings";

export type ThemeMode = "system" | "light" | "dark";

type PersistedPreferences = {
  themeMode: ThemeMode;
};

type PreferencesState = {
  appConfigLoaded: boolean;
  hydrateFromConfig: (uiItem: UiItem_Serialize | null | undefined) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  themeMode: ThemeMode;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      appConfigLoaded: false,
      hydrateFromConfig: (uiItem) =>
        set({
          ...preferencesFromConfig(uiItem),
          appConfigLoaded: true,
        }),
      setThemeMode: (themeMode) => set({ themeMode }),
      themeMode: "system",
    }),
    {
      name: "voyavpn.preferences",
      partialize: (state): PersistedPreferences => ({
        themeMode: state.themeMode,
      }),
      merge: (persistedState, currentState) => mergePersistedPreferences(persistedState, currentState),
      storage: createJSONStorage(() => window.localStorage),
    },
  ),
);

export function resolveThemeMode(themeMode: ThemeMode) {
  if (themeMode !== "system") {
    return themeMode;
  }

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function preferencesFromConfig(
  uiItem: UiItem_Serialize | null | undefined,
): PersistedPreferences {
  return {
    themeMode: themeModeFromConfig(uiItem?.CurrentTheme),
  };
}

export function uiItemWithoutLegacyColor(
  uiItem: UiItem_Serialize | null | undefined,
): Partial<UiItem_Serialize> {
  const nextUiItem: Partial<UiItem_Serialize> = { ...(uiItem ?? {}) };
  delete nextUiItem.ColorPrimaryName;
  return nextUiItem;
}

export function themeModeFromConfig(value: string | null | undefined): ThemeMode {
  switch ((value ?? "").trim().toLowerCase()) {
    case "dark":
      return "dark";
    case "light":
      return "light";
    case "followsystem":
    case "follow-system":
    case "system":
    default:
      return "system";
  }
}

export function themeModeToConfig(themeMode: ThemeMode) {
  switch (themeMode) {
    case "dark":
      return "Dark";
    case "light":
      return "Light";
    case "system":
      return "FollowSystem";
  }
}

function mergePersistedPreferences(persistedState: unknown, currentState: PreferencesState): PreferencesState {
  if (!isRecord(persistedState)) {
    return currentState;
  }

  return {
    ...currentState,
    themeMode: typeof persistedState.themeMode === "string" ? themeModeFromConfig(persistedState.themeMode) : "system",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
