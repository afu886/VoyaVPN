import { Download, RefreshCw } from "lucide-react";

import { Button } from "@voya/ui/components/button";
import { Checkbox } from "@voya/ui/components/checkbox";
import { Label } from "@voya/ui/components/label";
import { cn } from "@voya/ui/lib/utils";

import type { CheckUpdateDialogController } from "./use-check-update-dialog";

export function UpdateChannelControls({ controller }: { controller: CheckUpdateDialogController }) {
  const { preRelease, run, selectedIds, t, togglePreRelease, working } = controller;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={preRelease}
          disabled={working !== null}
          id="updates-pre-release"
          onCheckedChange={(checked) => togglePreRelease(checked === true)}
        />
        <Label className="cursor-pointer text-sm font-normal" htmlFor="updates-pre-release">
          {t("updates.preRelease")}
        </Label>
      </div>
      <div className="ms-auto flex items-center gap-2">
        <Button
          disabled={working !== null || selectedIds.size === 0}
          onClick={() => void run("check")}
          type="button"
          variant="outline"
        >
          <RefreshCw className={cn("size-4", working === "check" && "animate-spin")} aria-hidden="true" />
          {t("updates.check")}
        </Button>
        <Button
          disabled={working !== null || selectedIds.size === 0}
          onClick={() => void run("download")}
          type="button"
        >
          <Download className={cn("size-4", working === "download" && "animate-pulse")} aria-hidden="true" />
          {t("updates.download")}
        </Button>
      </div>
    </div>
  );
}
