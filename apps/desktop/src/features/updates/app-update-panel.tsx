import { ExternalLink, PackageCheck, RefreshCw } from "lucide-react";

import { Badge } from "@voya/ui/components/badge";
import { Button } from "@voya/ui/components/button";
import { cn } from "@voya/ui/lib/utils";
import type { ManualAppUpdateDownload } from "@/ipc/bindings";

import { redactUpdateMessage } from "./update-dialog-utils";
import type { CheckUpdateDialogController } from "./use-check-update-dialog";

export function AppUpdatePanel({ controller }: { controller: CheckUpdateDialogController }) {
  const {
    appInstallResult,
    appUpdaterCheck,
    appUpdaterError,
    appUpdaterStatus,
    installAppUpdate: onInstall,
    manualLinks,
    manualLinksError,
    restartApp: onRestart,
    runAppUpdaterCheck: onCheck,
    t,
    working,
  } = controller;
  const update = appUpdaterCheck?.update ?? null;
  const statusMessage = appUpdaterStatus?.message
    ? redactUpdateMessage(appUpdaterStatus.message, t)
    : t("updates.appUpdaterReady");

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{t("updates.appUpdater")}</span>
            <Badge variant={appUpdaterStatus?.state === "ready" ? "secondary" : "outline"}>
              {appUpdaterStatus
                ? t(`updates.appUpdaterState.${appUpdaterStatus.state}`)
                : t("updates.waiting")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {update
              ? t("updates.appUpdateAvailable", { version: update.version })
              : appUpdaterCheck
                ? t("updates.noAppUpdate")
                : statusMessage}
          </p>
          {appInstallResult ? (
            <p className="text-xs text-muted-foreground">
              {appInstallResult.state === "installed" && appInstallResult.installedVersion
                ? t("updates.appInstalled", { version: appInstallResult.installedVersion })
                : t("updates.noAppUpdate")}
            </p>
          ) : null}
          {appInstallResult?.restartRequired ? (
            <p className="text-xs text-muted-foreground">{t("updates.restartRequired")}</p>
          ) : null}
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button
            disabled={working !== null}
            onClick={() => void onCheck()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={cn("size-4", working === "app-check" && "animate-spin")}
              aria-hidden="true"
            />
            {t("updates.checkApp")}
          </Button>
          <Button
            disabled={working !== null || !update}
            onClick={() => void onInstall()}
            size="sm"
            type="button"
          >
            <PackageCheck
              className={cn("size-4", working === "app-install" && "animate-pulse")}
              aria-hidden="true"
            />
            {t("updates.installApp")}
          </Button>
          {appInstallResult?.restartRequired ? (
            <Button
              disabled={working !== null}
              onClick={() => void onRestart()}
              size="sm"
              type="button"
            >
              <RefreshCw
                className={cn("size-4", working === "app-restart" && "animate-spin")}
                aria-hidden="true"
              />
              {t("updates.restartApp")}
            </Button>
          ) : null}
        </div>
      </div>

      {appUpdaterError ? (
        <p className="break-words text-xs text-destructive">
          {redactUpdateMessage(appUpdaterError, t)}
        </p>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t("updates.manualDownloads")}</span>
          {manualLinks ? (
            <Badge variant={manualLinks.hasUpdate ? "secondary" : "outline"}>
              {manualLinks.hasUpdate
                ? t("updates.manualUpdateAvailable", {
                    version: manualLinks.remoteVersion ?? manualLinks.currentVersion,
                  })
                : t("updates.manualCurrent")}
            </Badge>
          ) : null}
        </div>

        {manualLinks?.downloads.length ? (
          <div className="flex flex-wrap gap-2">
            {manualLinks.downloads.map((download) => (
              <a
                className="inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-md border px-3 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
                href={download.url}
                key={`${download.kind}:${download.url}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="truncate">{manualDownloadLabel(download)}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="break-words text-xs text-muted-foreground">
            {manualLinksError
              ? redactUpdateMessage(manualLinksError, t)
              : t("updates.manualLinksUnavailable")}
          </p>
        )}
      </div>
    </div>
  );
}

function manualDownloadLabel(download: ManualAppUpdateDownload) {
  const kind = download.kind.trim();

  return kind ? `${kind.toUpperCase()} ${download.name}` : download.name;
}
