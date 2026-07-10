import { AlertTriangle, PackageCheck } from "lucide-react";

import { Alert, AlertDescription } from "@voya/ui/components/alert";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@voya/ui/components/dialog";

import { AppUpdatePanel } from "./app-update-panel";
import { UpdateChannelControls } from "./update-channel-controls";
import { redactUpdateMessage } from "./update-dialog-utils";
import { UpdateTargetTable } from "./update-target-table";
import { useCheckUpdateDialog } from "./use-check-update-dialog";

export function CheckUpdateDialog() {
  const controller = useCheckUpdateDialog();
  const { error, selectedIds, t } = controller;

  return (
    <DialogContent className="sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PackageCheck className="size-4" aria-hidden="true" />
          {t("updates.title")}
        </DialogTitle>
        <DialogDescription className="sr-only">{t("updates.description")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
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
            <AlertDescription className="break-words">
              {redactUpdateMessage(error, t)}
            </AlertDescription>
          </Alert>
        ) : null}

        <AppUpdatePanel controller={controller} />
        <UpdateTargetTable controller={controller} />
      </div>

      <DialogFooter />
    </DialogContent>
  );
}
