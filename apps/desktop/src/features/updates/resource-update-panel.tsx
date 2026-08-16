import { Database, Download, LoaderCircle } from "lucide-react";

import { Badge } from "@voya/ui/components/badge";
import { Button } from "@voya/ui/components/button";

import { redactUpdateMessage } from "./update-dialog-utils";
import type { CheckUpdateDialogController } from "./use-check-update-dialog";

export function ResourceUpdatePanel({ controller }: { controller: CheckUpdateDialogController }) {
  return (
    <div className="grid divide-y rounded-md border">
      <ResourceRow controller={controller} kind="geo" />
      <ResourceRow controller={controller} kind="srs" />
    </div>
  );
}

function ResourceRow({
  controller,
  kind,
}: {
  controller: CheckUpdateDialogController;
  kind: "geo" | "srs";
}) {
  const { resourceErrors, resourceResults, t, updateResource, working } = controller;
  const result = resourceResults[kind];
  const error = resourceErrors[kind];
  const busy = working === kind;
  const title = kind === "geo" ? t("updates.geoTitle") : t("updates.srsTitle");
  const description = kind === "geo" ? t("updates.geoDescription") : t("updates.srsDescription");
  const Icon = kind === "geo" ? Database : Download;

  return (
    <section className="flex flex-wrap items-start gap-3 p-3" aria-label={title}>
      <Icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {result ? (
            <Badge variant="secondary">
              {t("updates.resourceUpdated", { count: result.length })}
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        {result?.length ? (
          <p className="break-words text-xs text-muted-foreground">
            {result.map((file) => file.name).join(", ")}
          </p>
        ) : null}
        {error ? (
          <p className="break-words text-xs text-destructive">
            {redactUpdateMessage(error, t)}
          </p>
        ) : null}
      </div>
      <Button
        disabled={working !== null}
        onClick={() => void updateResource(kind)}
        size="sm"
        type="button"
        variant="outline"
      >
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-4" aria-hidden="true" />
        )}
        {t("updates.updateNow")}
      </Button>
    </section>
  );
}
