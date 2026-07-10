import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  checkAppUpdatePaths,
  installCheckedAppUpdate,
  loadAppUpdatePaths,
  type AppUpdateCheckResult,
  type AppUpdateInstallResult,
  type AppUpdatePaths,
} from "@/features/updates/app-update-flow";
import {
  checkUpdates,
  downloadUpdates,
  saveUpdatePreferences,
  updateStatus,
} from "@/ipc";
import type {
  AppUpdaterStatus,
  ManualAppUpdateLinks,
  UpdateCheckResult,
  UpdateStatus,
} from "@/ipc/bindings";
import { relaunch } from "@/ipc/process";
import { useI18n } from "@voya/i18n/use-i18n";
import { useMountedRef } from "@voya/utils/use-mounted-ref";

import type { CoreRunMode, PreferenceSnapshot, RunMode } from "./check-update-dialog-types";
import {
  clonePreferenceSnapshot,
  errorMessage,
  preferenceSnapshotFromStatus,
  preferenceSnapshotKey,
} from "./update-dialog-utils";

export function useCheckUpdateDialog() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [appUpdaterStatus, setAppUpdaterStatus] = useState<AppUpdaterStatus | null>(null);
  const [appUpdaterCheck, setAppUpdaterCheck] = useState<AppUpdateCheckResult | null>(null);
  const [appUpdaterError, setAppUpdaterError] = useState<string | null>(null);
  const [appInstallResult, setAppInstallResult] = useState<AppUpdateInstallResult | null>(null);
  const [manualLinks, setManualLinks] = useState<ManualAppUpdateLinks | null>(null);
  const [manualLinksError, setManualLinksError] = useState<string | null>(null);
  const [preRelease, setPreRelease] = useState(false);
  const [results, setResults] = useState<UpdateCheckResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [working, setWorking] = useState<RunMode | null>(null);
  const preferenceSnapshotRef = useRef<PreferenceSnapshot>({
    preRelease: false,
    selectedIds: [],
  });
  const preferenceSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestPreferenceRequestRef = useRef(0);
  const latestPreferenceSaveRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const lastPersistedPreferenceKeyRef = useRef<string | null>(null);
  const pendingPreferenceSaveCountRef = useRef(0);
  const statusGenerationRef = useRef(0);
  const mountedRef = useMountedRef();

  function applyAppUpdatePaths(paths: AppUpdatePaths) {
    if (paths.updaterStatus) {
      setAppUpdaterStatus(paths.updaterStatus);
    }
    if (paths.updaterCheck) {
      setAppUpdaterCheck(paths.updaterCheck);
      setAppInstallResult(null);
    }
    setManualLinks(paths.manualLinks);
    setAppUpdaterError(paths.updaterError);
    setManualLinksError(paths.manualError);
  }

  const setPreferenceSnapshot = useCallback((nextPreference: PreferenceSnapshot) => {
    const snapshot = clonePreferenceSnapshot(nextPreference);
    preferenceSnapshotRef.current = snapshot;
    setPreRelease(snapshot.preRelease);
    setSelectedIds(new Set(snapshot.selectedIds));
  }, []);

  const applyUpdateStatus = useCallback((nextStatus: UpdateStatus) => {
    const nextPreference = preferenceSnapshotFromStatus(nextStatus);
    lastPersistedPreferenceKeyRef.current = preferenceSnapshotKey(nextPreference);
    setStatus(nextStatus);
    setPreferenceSnapshot(nextPreference);
  }, [setPreferenceSnapshot]);

  useEffect(() => {
    const generation = ++statusGenerationRef.current;
    const isCurrent = () => mountedRef.current && generation === statusGenerationRef.current;

    void updateStatus()
      .then(async (nextStatus) => {
        if (!isCurrent()) {
          return;
        }
        applyUpdateStatus(nextStatus);
        const appPaths = await loadAppUpdatePaths(nextStatus.preRelease, true, null);
        if (isCurrent()) {
          applyAppUpdatePaths(appPaths);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent()) {
          setError(errorMessage(error));
        }
      });

    return () => {
      statusGenerationRef.current += 1;
    };
  }, [applyUpdateStatus, mountedRef]);

  const resultByTarget = useMemo(
    () => new Map(results.map((result) => [result.targetId, result])),
    [results],
  );

  function persistPreference(nextPreference: PreferenceSnapshot) {
    const snapshot = clonePreferenceSnapshot(nextPreference);
    const key = preferenceSnapshotKey(snapshot);
    const latestSave = latestPreferenceSaveRef.current;

    if (pendingPreferenceSaveCountRef.current === 0 && key === lastPersistedPreferenceKeyRef.current) {
      return Promise.resolve();
    }

    if (latestSave && latestSave.key === key) {
      return latestSave.promise;
    }

    const requestId = latestPreferenceRequestRef.current + 1;
    latestPreferenceRequestRef.current = requestId;
    pendingPreferenceSaveCountRef.current += 1;

    const request = preferenceSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const nextStatus = await saveUpdatePreferences(snapshot.preRelease, snapshot.selectedIds);
        const savedPreference = preferenceSnapshotFromStatus(nextStatus);
        lastPersistedPreferenceKeyRef.current = preferenceSnapshotKey(savedPreference);

        if (requestId === latestPreferenceRequestRef.current) {
          setStatus(nextStatus);
          setPreferenceSnapshot(savedPreference);
        }
      });

    preferenceSaveChainRef.current = request.catch(() => undefined);
    latestPreferenceSaveRef.current = { key, promise: request };
    void request.then(
      () => clearTrackedPreferenceSave(request),
      () => clearTrackedPreferenceSave(request),
    );

    return request;
  }

  function clearTrackedPreferenceSave(request: Promise<void>) {
    pendingPreferenceSaveCountRef.current = Math.max(0, pendingPreferenceSaveCountRef.current - 1);
    if (latestPreferenceSaveRef.current?.promise === request) {
      latestPreferenceSaveRef.current = null;
    }
  }

  async function waitForPendingPreferenceSaves() {
    await preferenceSaveChainRef.current;
  }

  async function run(mode: CoreRunMode) {
    setWorking(mode);
    setError(null);
    try {
      await waitForPendingPreferenceSaves();
      const preference = clonePreferenceSnapshot(preferenceSnapshotRef.current);
      const [runResult, appPaths] = await Promise.allSettled([
        mode === "check"
          ? checkUpdates(preference.preRelease, preference.selectedIds, true, null)
          : downloadUpdates(preference.preRelease, preference.selectedIds, true, null),
        mode === "check"
          ? checkAppUpdatePaths(preference.preRelease, true, null)
          : loadAppUpdatePaths(preference.preRelease, true, null),
      ]);

      if (runResult.status === "fulfilled") {
        applyUpdateStatus({ preRelease: runResult.value.preRelease, targets: runResult.value.targets });
        setResults(runResult.value.results);
      } else {
        setError(errorMessage(runResult.reason));
      }

      if (appPaths.status === "fulfilled") {
        applyAppUpdatePaths(appPaths.value);
      } else {
        setAppUpdaterError(errorMessage(appPaths.reason));
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function runAppUpdaterCheck() {
    setWorking("app-check");
    setAppUpdaterError(null);
    try {
      applyAppUpdatePaths(await checkAppUpdatePaths(preferenceSnapshotRef.current.preRelease, true, null));
    } catch (error) {
      setAppUpdaterError(errorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function installAppUpdate() {
    setWorking("app-install");
    setAppUpdaterError(null);
    setAppInstallResult(null);
    try {
      setAppInstallResult(await installCheckedAppUpdate());
    } catch (error) {
      setAppUpdaterError(errorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function restartApp() {
    setWorking("app-restart");
    setAppUpdaterError(null);
    try {
      await relaunch();
    } catch (error) {
      setAppUpdaterError(errorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function toggleTarget(id: string, checked: boolean) {
    const nextSelected = new Set(preferenceSnapshotRef.current.selectedIds);
    if (checked) {
      nextSelected.add(id);
    } else {
      nextSelected.delete(id);
    }

    const nextPreference = {
      preRelease: preferenceSnapshotRef.current.preRelease,
      selectedIds: [...nextSelected],
    };
    setPreferenceSnapshot(nextPreference);
    void persistPreference(nextPreference).catch((error: unknown) => setError(errorMessage(error)));
  }

  function togglePreRelease(checked: boolean) {
    const nextPreference = {
      preRelease: checked,
      selectedIds: preferenceSnapshotRef.current.selectedIds,
    };
    setPreferenceSnapshot(nextPreference);
    void persistPreference(nextPreference).catch((error: unknown) => setError(errorMessage(error)));
  }

  return {
    appInstallResult,
    appUpdaterCheck,
    appUpdaterError,
    appUpdaterStatus,
    error,
    installAppUpdate,
    manualLinks,
    manualLinksError,
    preRelease,
    resultByTarget,
    restartApp,
    run,
    runAppUpdaterCheck,
    selectedIds,
    status,
    t,
    togglePreRelease,
    toggleTarget,
    working,
  };
}

export type CheckUpdateDialogController = ReturnType<typeof useCheckUpdateDialog>;
