import {
  Activity,
  ChevronDown,
  Clock,
  Download,
  FileJson2,
  Gauge,
  Link,
  QrCode,
  Radio,
  Share2,
  Square,
  Wifi,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@voya/ui/components/button";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@voya/ui/components/menubar";
import type { SpeedActionType } from "@/ipc/bindings";
import { useI18n } from "@voya/i18n/use-i18n";

import { SPEED_ACTIONS } from "./profile-constants";
import type { ProfileExportKind } from "./server-table-actions";
import type { TranslateFn } from "./server-table-columns";

// Speedtest split button: the default `Fast` ping runs straight from the primary
// control, while the chevron opens a menu for the remaining probe modes plus the
// running-only Stop. The dropdown reuses the Menubar primitive (no new
// dependency) so its trigger and items expose `menuitem` roles, mirroring the
// Columns menu.
export function SpeedtestSplitButton({
  disabled,
  onCancel,
  onRun,
  running,
}: {
  disabled: boolean;
  onCancel: () => Promise<void>;
  onRun: (action: SpeedActionType) => Promise<void>;
  running: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="flex items-center">
      <Button
        className="rounded-e-none"
        disabled={disabled || running}
        onClick={() => void onRun(SPEED_ACTIONS.FastRealping)}
        size="sm"
        title={t("panes.profiles.speedtest.buttonTitle", { label: t("panes.profiles.speedtest.fast") })}
        type="button"
        variant="outline"
      >
        <Zap className="size-4" aria-hidden="true" />
        {t("panes.profiles.speedtest.fast")}
      </Button>
      <Menubar className="h-auto border-0 bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger asChild>
            <Button
              aria-label={t("panes.profiles.speedtest.more")}
              className="rounded-s-none border-s-0 px-2"
              disabled={disabled}
              size="sm"
              title={t("panes.profiles.speedtest.more")}
              type="button"
              variant="outline"
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
          </MenubarTrigger>
          <MenubarContent align="start">
            <SpeedMenuItem
              action={SPEED_ACTIONS.Tcping}
              disabled={running}
              icon={Activity}
              label={t("panes.profiles.speedtest.tcp")}
              onRun={onRun}
            />
            <SpeedMenuItem
              action={SPEED_ACTIONS.Realping}
              disabled={running}
              icon={Clock}
              label={t("panes.profiles.speedtest.real")}
              onRun={onRun}
            />
            <SpeedMenuItem
              action={SPEED_ACTIONS.UdpTest}
              disabled={running}
              icon={Radio}
              label={t("panes.profiles.speedtest.udp")}
              onRun={onRun}
            />
            <SpeedMenuItem
              action={SPEED_ACTIONS.Speedtest}
              disabled={running}
              icon={Gauge}
              label={t("panes.profiles.speedtest.speed")}
              onRun={onRun}
            />
            <SpeedMenuItem
              action={SPEED_ACTIONS.Mixedtest}
              disabled={running}
              icon={Wifi}
              label={t("panes.profiles.speedtest.mixed")}
              onRun={onRun}
            />
            <MenubarSeparator />
            <MenubarItem
              disabled={!running}
              onSelect={() => void onCancel()}
              title={t("panes.profiles.speedtest.cancelTitle")}
            >
              <Square className="size-4" aria-hidden="true" />
              {t("panes.profiles.speedtest.stop")}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </div>
  );
}

export function ExportMenuItems({
  onExport,
  onSave,
  onShowQr,
  t,
}: {
  onExport: (kind: ProfileExportKind) => void;
  onSave: (kind: ProfileExportKind) => void;
  onShowQr: () => void;
  t: TranslateFn;
}) {
  return (
    <>
      <MenubarItem onSelect={() => onExport("shareLinks")}>
        <Link className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.shareLinks")}
      </MenubarItem>
      <MenubarItem onSelect={() => onExport("shareBase64")}>
        <Share2 className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.shareBase64")}
      </MenubarItem>
      <MenubarItem onSelect={() => onExport("innerLinks")}>
        <Link className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.innerLinks")}
      </MenubarItem>
      <MenubarItem onSelect={() => onExport("clientConfig")}>
        <FileJson2 className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.clientConfig")}
      </MenubarItem>
      <MenubarSeparator />
      <MenubarItem onSelect={onShowQr}>
        <QrCode className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.showQr")}
      </MenubarItem>
      <MenubarItem onSelect={() => onSave("shareLinks")}>
        <Download className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.saveShareLinks")}
      </MenubarItem>
      <MenubarItem onSelect={() => onSave("clientConfig")}>
        <FileJson2 className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.saveClientConfig")}
      </MenubarItem>
    </>
  );
}

function SpeedMenuItem({
  action,
  disabled,
  icon: Icon,
  label,
  onRun,
}: {
  action: SpeedActionType;
  disabled: boolean;
  icon: LucideIcon;
  label: string;
  onRun: (action: SpeedActionType) => Promise<void>;
}) {
  return (
    <MenubarItem disabled={disabled} onSelect={() => void onRun(action)}>
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </MenubarItem>
  );
}
