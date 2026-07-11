import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge } from "@voya/ui/components/badge";
import { Checkbox } from "@voya/ui/components/checkbox";
import { ScrollArea } from "@voya/ui/components/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voya/ui/components/table";
import { useI18n } from "@voya/i18n/use-i18n";
import { cn } from "@voya/ui/lib/utils";
import type {
  ManualAppUpdateLinks,
  UpdateAcquisition,
  UpdateCheckResult,
  UpdateResultStatus,
  UpdateTarget,
  UpdateTargetKind,
} from "@/ipc/bindings";

import { redactUpdateMessage } from "./update-dialog-utils";
import type { CheckUpdateDialogController } from "./use-check-update-dialog";

export function UpdateTargetTable({ controller }: { controller: CheckUpdateDialogController }) {
  const { manualLinks, manualLinksError, resultByTarget, selectedIds, status, t, toggleTarget, working } = controller;

  return (
    <ScrollArea className="h-[24rem] rounded-md border">
      <Table className="min-w-[42rem]">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 px-3" scope="col">
              <span className="sr-only">{t("updates.selected")}</span>
            </TableHead>
            <TableHead className="px-3" scope="col">
              {t("updates.target")}
            </TableHead>
            <TableHead className="px-3" scope="col">
              {t("updates.version")}
            </TableHead>
            <TableHead className="px-3" scope="col">
              {t("updates.status")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(status?.targets ?? []).map((target) => {
            const result = resultByTarget.get(target.id);

            return (
              <TableRow key={target.id}>
                <TableCell className="px-3 py-2 align-top">
                  <Checkbox
                    aria-label={`${t("updates.selected")} ${target.name}`}
                    checked={selectedIds.has(target.id)}
                    disabled={working !== null}
                    onCheckedChange={(checked) => toggleTarget(target.id, checked === true)}
                  />
                </TableCell>
                <TableCell className="min-w-48 whitespace-normal px-3 py-2 align-top">
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{target.name}</span>
                      <TargetKindBadge kind={target.kind} />
                      <UpdateSupportBadge target={target} />
                      {target.kind === "app" ? (
                        <ManualStateBadge manualLinks={manualLinks} manualLinksError={manualLinksError} />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AcquisitionBadge acquisition={target.acquisition} />
                      {target.license ? <Badge variant="outline">{target.license}</Badge> : null}
                    </div>
                    <span className="break-words text-xs text-muted-foreground">{target.remarks}</span>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-2 align-top text-muted-foreground">
                  {result?.remoteVersion ?? result?.currentVersion ?? "-"}
                </TableCell>
                <TableCell className="min-w-56 px-3 py-2 align-top">
                  <div className="flex flex-wrap items-start gap-2">
                    <UpdateResultBadge result={result} target={target} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

function UpdateResultBadge({
  result,
  target,
}: {
  result: UpdateCheckResult | undefined;
  target: UpdateTarget;
}) {
  const { t } = useI18n();

  if (!result) {
    return <Badge variant="secondary">{t("updates.waiting")}</Badge>;
  }

  const isFailed = result.status === "error";
  const tone = statusTone(result.status);
  const label = updateResultLabel({ result, target, t });

  return (
    <Badge
      className={cn(
        "max-w-full items-start justify-start gap-2 whitespace-normal px-2 py-1 text-left",
        tone,
      )}
      variant="outline"
    >
      {result.status === "upToDate" || result.status === "downloaded" ? (
        <CheckCircle2 className="mt-0.5 shrink-0" aria-hidden="true" />
      ) : isFailed ? (
        <AlertTriangle className="shrink-0" aria-hidden="true" />
      ) : null}
      <span className="min-w-0 break-words">{label}</span>
    </Badge>
  );
}

function TargetKindBadge({ kind }: { kind: UpdateTargetKind }) {
  const { t } = useI18n();

  return <Badge variant="outline">{t(`updates.kind.${kind}`)}</Badge>;
}

function UpdateSupportBadge({ target }: { target: UpdateTarget }) {
  const { t } = useI18n();
  const automatic = target.updateSupported;

  return (
    <Badge variant={automatic ? "secondary" : "outline"}>
      {automatic ? t("updates.support.auto") : t("updates.support.manual")}
    </Badge>
  );
}

function AcquisitionBadge({ acquisition }: { acquisition: UpdateAcquisition }) {
  const { t } = useI18n();

  return <Badge variant="outline">{t(`updates.acquisition.${acquisition}`)}</Badge>;
}

function ManualStateBadge({
  manualLinks,
  manualLinksError,
}: {
  manualLinks: ManualAppUpdateLinks | null;
  manualLinksError: string | null;
}) {
  const { t } = useI18n();

  if (manualLinks?.hasUpdate) {
    return <Badge variant="secondary">{t("updates.manualState.available")}</Badge>;
  }

  if (manualLinks) {
    return <Badge variant="outline">{t("updates.manualState.current")}</Badge>;
  }

  if (manualLinksError) {
    return <Badge variant="outline">{t("updates.manualState.failed")}</Badge>;
  }

  return <Badge variant="outline">{t("updates.manualState.waiting")}</Badge>;
}

function updateResultLabel({
  result,
  target,
  t,
}: {
  result: UpdateCheckResult;
  target: UpdateTarget;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  switch (result.status) {
    case "downloaded":
      return result.remoteVersion
        ? t("updates.statusDownloadedVersion", { version: result.remoteVersion })
        : t("updates.statusDownloaded");
    case "updateAvailable":
      return result.remoteVersion
        ? t("updates.statusUpdateAvailableVersion", { version: result.remoteVersion })
        : t("updates.statusUpdateAvailable");
    case "upToDate": {
      const version = result.remoteVersion ?? result.currentVersion;

      return version ? t("updates.statusCurrentVersion", { version }) : t("updates.statusCurrent");
    }
    case "skipped":
      return target.selected ? t("updates.statusSkipped") : t("updates.statusNotSelected");
    case "error":
      return t("updates.statusFailedMessage", {
        message: redactUpdateMessage(result.message, t),
      });
  }
}

function statusTone(status: UpdateResultStatus) {
  switch (status) {
    case "downloaded":
    case "upToDate":
      return "border-success-bold/30 bg-success-bg text-success";
    case "updateAvailable":
      return "border-primary/30 bg-accent-blue-light text-brand";
    case "error":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "skipped":
      return "border-transparent bg-muted text-muted-foreground";
  }
}
