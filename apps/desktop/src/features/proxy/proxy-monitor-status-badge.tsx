import { AlertTriangle, CircleDot, LoaderCircle, PauseCircle } from "lucide-react";

import { Badge } from "@voya/ui/components/badge";
import { useI18n } from "@voya/i18n/use-i18n";
import type { TranslationFunction } from "@voya/i18n";
import type { RuntimeProxyMonitorStatus } from "@/ipc/runtime-event-store";
import { cn } from "@voya/ui/lib/utils";

type MonitorTone = "failed" | "live" | "starting" | "stale";

type MonitorStatusDisplay = {
  detail: string | null;
  label: string;
  tone: MonitorTone;
};

const toneClassName: Record<MonitorTone, string> = {
  failed: "border-destructive/35 bg-destructive/10 text-destructive [&>svg]:text-destructive",
  live: "border-success-bold/30 bg-success-bg text-success [&>svg]:text-success-icon",
  starting: "border-information/30 bg-information-bg text-information [&>svg]:text-information",
  stale: "border-warning-bold/35 bg-warning-bg text-warning [&>svg]:text-warning-icon",
};

export function ProxyMonitorStatusBadge({
  className,
  status,
}: {
  className?: string;
  status: RuntimeProxyMonitorStatus;
}) {
  const { t } = useI18n();
  const display = monitorStatusDisplay(status, t);
  const title = [display.label, display.detail].filter(Boolean).join(": ");
  const iconClassName = cn("size-3 shrink-0", status.state === "starting" && "animate-spin");

  return (
    <span className={cn("min-w-0 max-w-[18rem]", className)}>
      <Badge
        aria-label={title}
        className={cn(
          "w-full min-w-0 justify-start gap-1.5 px-2 py-1 font-normal",
          toneClassName[display.tone],
        )}
        role="status"
        title={title}
        variant="outline"
      >
        {status.state === "failed" ? <AlertTriangle className={iconClassName} aria-hidden="true" /> : null}
        {status.state === "starting" ? <LoaderCircle className={iconClassName} aria-hidden="true" /> : null}
        {status.state !== "failed" && status.state !== "starting" && status.stale ? (
          <PauseCircle className={iconClassName} aria-hidden="true" />
        ) : null}
        {status.state !== "failed" && status.state !== "starting" && !status.stale ? (
          <CircleDot className={iconClassName} aria-hidden="true" />
        ) : null}
        <span className="shrink-0">{display.label}</span>
        {display.detail ? <span className="min-w-0 truncate opacity-80">{display.detail}</span> : null}
      </Badge>
    </span>
  );
}

function monitorStatusDisplay(
  status: RuntimeProxyMonitorStatus,
  t: TranslationFunction,
): MonitorStatusDisplay {
  if (status.state === "failed") {
    return {
      detail: status.message,
      label: t("proxy.monitorFailed"),
      tone: "failed",
    };
  }

  if (status.state === "starting") {
    return {
      detail: status.stale ? t("proxy.monitorStale") : null,
      label: t("proxy.monitorStarting"),
      tone: status.stale ? "stale" : "starting",
    };
  }

  if (!status.stale && status.running) {
    return {
      detail: status.message,
      label: t("proxy.monitorLive"),
      tone: "live",
    };
  }

  return {
    detail: status.state === "stopped" ? t("proxy.monitorStopped") : status.message,
    label: t("proxy.monitorStale"),
    tone: "stale",
  };
}
