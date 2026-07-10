import type { UpdateStatus } from "@/ipc/bindings";
import { getErrorMessage } from "@voya/utils/error";
import { redactOperationalMessage } from "@voya/utils/operational-redaction";

import type { PreferenceSnapshot } from "./check-update-dialog-types";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function clonePreferenceSnapshot(snapshot: PreferenceSnapshot): PreferenceSnapshot {
  return {
    preRelease: snapshot.preRelease,
    selectedIds: [...snapshot.selectedIds],
  };
}

export function preferenceSnapshotFromStatus(status: UpdateStatus): PreferenceSnapshot {
  return {
    preRelease: status.preRelease,
    selectedIds: status.targets.filter((target) => target.selected).map((target) => target.id),
  };
}

export function preferenceSnapshotKey(snapshot: PreferenceSnapshot) {
  return JSON.stringify({
    preRelease: snapshot.preRelease,
    selectedIds: [...new Set(snapshot.selectedIds)].sort(),
  });
}

export function errorMessage(error: unknown) {
  return getErrorMessage(error);
}

export function redactUpdateMessage(message: string, t: Translate) {
  return redactOperationalMessage(message, {
    redactedUrl: t("updates.redactedUrl"),
    redactedValue: t("updates.redactedValue"),
  });
}
