import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@voya/ui/components/alert";

import { AppUpdatePanel } from "./app-update-panel";
import { UpdateChannelControls } from "./update-channel-controls";
import { redactUpdateMessage } from "./update-dialog-utils";
import { UpdateTargetList } from "./update-target-list";
import { useCheckUpdateDialog } from "./use-check-update-dialog";

export function UpdatesPanel() {
  const controller = useCheckUpdateDialog();
  const { error, selectedIds, t } = controller;

  return (
    <div className="grid gap-4">
      <h3 className="sr-only">{t("updates.title")}</h3>

      <UpdateChannelControls controller={controller} />

      {selectedIds.size === 0 ? (
        <Alert>
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>{t("updates.noSelectedTargets")}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription className="break-words">{redactUpdateMessage(error, t)}</AlertDescription>
        </Alert>
      ) : null}

      <AppUpdatePanel controller={controller} />
      <UpdateTargetList controller={controller} />
    </div>
  );
}
