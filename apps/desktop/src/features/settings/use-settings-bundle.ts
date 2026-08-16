import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { loadSettingsBundle, saveSettingsBundle } from "@/ipc";
import type {
  SettingsBundle_Deserialize,
  SettingsBundle_Serialize,
  UiPreferences,
} from "@/ipc/bindings";
import { getErrorMessage } from "@voya/utils/error";

import { applyUiPreferences, UI_PREFERENCES_QUERY_KEY } from "./ui-preferences";

const PREFERENCES_STORAGE_KEY = "voyavpn.preferences";
const LOCALE_STORAGE_KEY = "voyavpn.locale";
const SETTINGS_BUNDLE_QUERY_KEY = ["settings-bundle"] as const;

export type SettingsBundleController = {
  bundle: SettingsBundle_Serialize | null;
  dirty: boolean;
  discard: () => Promise<void>;
  error: string | null;
  reload: () => Promise<void>;
  save: () => Promise<boolean>;
  saved: boolean;
  setUiPreferences: (preferences: UiPreferences) => void;
  update: (
    updater: (current: SettingsBundle_Serialize) => SettingsBundle_Serialize,
  ) => void;
  working: boolean;
};

export function useSettingsBundle(): SettingsBundleController {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryFn: loadSettingsBundle,
    queryKey: SETTINGS_BUNDLE_QUERY_KEY,
  });
  const [draft, setDraft] = useState<SettingsBundle_Serialize | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const original = settingsQuery.data ?? null;
  const bundle = draft ?? original;

  const load = useCallback(async () => {
    setOperationError(null);
    setDraft(null);
    setSaved(false);
    const result = await settingsQuery.refetch();
    if (result.error) {
      setOperationError(getErrorMessage(result.error));
    }
  }, [settingsQuery]);

  const dirty = Boolean(draft && original && !bundlesEqual(draft, original));

  const update = useCallback(
    (updater: (current: SettingsBundle_Serialize) => SettingsBundle_Serialize) => {
      setSaved(false);
      setDraft((current) => {
        const next = current ?? settingsQuery.data;
        return next ? updater(next) : current;
      });
    },
    [settingsQuery.data],
  );

  const setUiPreferences = useCallback(
    (preferences: UiPreferences) => {
      update((current) => ({ ...current, uiPreferences: preferences }));
      void applyUiPreferencesPreview(preferences).catch((previewError: unknown) => {
        setOperationError(getErrorMessage(previewError));
      });
    },
    [update],
  );

  const discard = useCallback(async () => {
    if (!original) {
      return;
    }
    setDraft(null);
    setSaved(false);
    setOperationError(null);
    await applyUiPreferences(original.uiPreferences).catch((rollbackError: unknown) => {
      setOperationError(getErrorMessage(rollbackError));
    });
  }, [original]);

  const save = useCallback(async () => {
    if (!bundle) {
      return false;
    }
    setSaving(true);
    setOperationError(null);
    setSaved(false);
    try {
      const authoritative = await saveSettingsBundle(bundle as SettingsBundle_Deserialize);
      queryClient.setQueryData(SETTINGS_BUNDLE_QUERY_KEY, authoritative);
      setDraft(null);
      setSaved(true);
      await applyUiPreferences(authoritative.uiPreferences);
      queryClient.setQueryData(UI_PREFERENCES_QUERY_KEY, authoritative.uiPreferences);
      return true;
    } catch (saveError) {
      setOperationError(getErrorMessage(saveError));
      try {
        const authoritative = await loadSettingsBundle();
        queryClient.setQueryData(SETTINGS_BUNDLE_QUERY_KEY, authoritative);
        setDraft(null);
        await applyUiPreferences(authoritative.uiPreferences);
      } catch {
        // Keep the original save error; a later Reload can retry the snapshot.
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [bundle, queryClient]);

  return {
    bundle,
    dirty,
    discard,
    error: operationError ?? (settingsQuery.error ? getErrorMessage(settingsQuery.error) : null),
    reload: load,
    save,
    saved,
    setUiPreferences,
    update,
    working: saving || settingsQuery.isPending || settingsQuery.isFetching,
  };
}

async function applyUiPreferencesPreview(preferences: UiPreferences) {
  const stored = new Map(
    [PREFERENCES_STORAGE_KEY, LOCALE_STORAGE_KEY].map((key) => [
      key,
      window.localStorage.getItem(key),
    ]),
  );
  try {
    await applyUiPreferences(preferences);
  } finally {
    for (const [key, value] of stored) {
      if (value === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
      }
    }
  }
}

function bundlesEqual(left: SettingsBundle_Serialize, right: SettingsBundle_Serialize) {
  return JSON.stringify(left) === JSON.stringify(right);
}
