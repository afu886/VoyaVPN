import { Save } from "lucide-react";

import { Button } from "@voya/ui/components/button";
import { useI18n } from "@voya/i18n/use-i18n";

import type { RuntimeConfigController } from "./use-runtime-config";

export function RuntimeSaveRow({ controller }: { controller: RuntimeConfigController }) {
  const { t } = useI18n();
  const { error, save, saved, working } = controller;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={working} onClick={() => void save()} size="sm" type="button" variant="outline">
        <Save className="size-4" aria-hidden="true" />
        {t("actions.save")}
      </Button>
      {saved ? <span className="text-xs text-muted-foreground">{t("options.saved")}</span> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
