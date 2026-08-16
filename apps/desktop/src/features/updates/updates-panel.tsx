import { AppUpdatePanel } from "./app-update-panel";
import { ResourceUpdatePanel } from "./resource-update-panel";
import { useCheckUpdateDialog } from "./use-check-update-dialog";

export function UpdatesPanel() {
  const controller = useCheckUpdateDialog();
  const { t } = controller;

  return (
    <div className="grid gap-4">
      <h3 className="sr-only">{t("updates.title")}</h3>

      <AppUpdatePanel controller={controller} />
      <ResourceUpdatePanel controller={controller} />
    </div>
  );
}
