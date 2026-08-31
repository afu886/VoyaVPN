import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Clock,
  Download,
  FileJson2,
  Gauge,
  Link,
  Pencil,
  QrCode,
  Radio,
  Share2,
  Square,
  Trash2,
  Wifi,
  Zap,
} from "lucide-react";
import type { ReactElement } from "react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@voya/ui/components/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@voya/ui/components/context-menu";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@voya/ui/components/menubar";
import { moveProfile } from "@/ipc";
import type { ProfileListEntry, SpeedTestKind, SpeedTestTarget } from "@/ipc/bindings";
import { useI18n } from "@voya/i18n/use-i18n";

import { MOVE_ACTIONS, SPEED_ACTIONS } from "./profile-constants";
import type { ProfileExportKind } from "./server-table-actions";
import type { TranslateFn } from "./server-table-columns";
import type { ServerTableController } from "./use-server-table";

// Speedtest split button: the default `Fast` ping runs straight from the primary
// control, while the chevron opens a menu for the remaining probe modes plus the
// running-only Stop. The dropdown reuses the Menubar primitive (no new
// dependency) so its trigger and items expose `menuitem` roles, mirroring the
// Columns menu.
export function SpeedtestSplitButton({
  disabled,
  label,
  onCancel,
  onRun,
  running,
}: {
  disabled: boolean;
  label: string;
  onCancel: () => Promise<void>;
  onRun: (kind: SpeedTestKind) => Promise<void>;
  running: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="flex items-center">
      <Button
        className="rounded-e-none"
        disabled={disabled || running}
        onClick={() => void onRun(SPEED_ACTIONS.Latency)}
        size="sm"
        title={t("panes.profiles.speedtest.buttonTitle", { label })}
        type="button"
        variant="outline"
      >
        <Zap className="size-4" aria-hidden="true" />
        {label}
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
              action={SPEED_ACTIONS.TcpConnect}
              disabled={running}
              icon={Activity}
              label={t("panes.profiles.speedtest.tcp")}
              onRun={onRun}
            />
            <SpeedMenuItem
              action={SPEED_ACTIONS.Latency}
              disabled={running}
              icon={Clock}
              label={t("panes.profiles.speedtest.real")}
              onRun={onRun}
            />
            <SpeedMenuItem
              action={SPEED_ACTIONS.Udp}
              disabled={running}
              icon={Radio}
              label={t("panes.profiles.speedtest.udp")}
              onRun={onRun}
            />
            <SpeedMenuItem
              action={SPEED_ACTIONS.Download}
              disabled={running}
              icon={Gauge}
              label={t("panes.profiles.speedtest.speed")}
              onRun={onRun}
            />
            <SpeedMenuItem
              action={SPEED_ACTIONS.Mixed}
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

export function ProfileRowContextMenu({
  children,
  controller,
  item,
}: {
  children: ReactElement;
  controller: ServerTableController;
  item: ProfileListEntry;
}) {
  const {
    handleCancelSpeedtest,
    handleExport,
    handleSpeedtest,
    requestDelete,
    runOperation,
    selectOnly,
    setDialogState,
    speedtestRunning,
    t,
  } = controller;
  const indexId = item.profile.id;
  const target: SpeedTestTarget = { scope: "profiles", profileIds: [indexId] };
  const runTargetSpeedtest = (kind: SpeedTestKind) => handleSpeedtest(kind, target);

  return (
    // A row action can open a modal dialog. Keeping the short-lived context
    // menu non-modal avoids competing focus scopes while the menu closes.
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild onContextMenu={() => selectOnly(indexId)}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label={t("panes.profiles.menu.actionsFor", {
          name: item.profile.remarks || indexId,
        })}
      >
        <ContextMenuItem onSelect={() => setDialogState({ mode: "edit", profile: item })}>
          <Pencil className="size-4" aria-hidden="true" />
          {t("panes.profiles.toolbar.edit")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Zap className="size-4" aria-hidden="true" />
            {t("panes.profiles.menu.speedtest")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextSpeedMenuItem
              action={SPEED_ACTIONS.Latency}
              disabled={speedtestRunning}
              icon={Zap}
              label={t("panes.profiles.speedtest.fast")}
              onRun={runTargetSpeedtest}
            />
            <ContextSpeedMenuItem
              action={SPEED_ACTIONS.TcpConnect}
              disabled={speedtestRunning}
              icon={Activity}
              label={t("panes.profiles.speedtest.tcp")}
              onRun={runTargetSpeedtest}
            />
            <ContextSpeedMenuItem
              action={SPEED_ACTIONS.Latency}
              disabled={speedtestRunning}
              icon={Clock}
              label={t("panes.profiles.speedtest.real")}
              onRun={runTargetSpeedtest}
            />
            <ContextSpeedMenuItem
              action={SPEED_ACTIONS.Udp}
              disabled={speedtestRunning}
              icon={Radio}
              label={t("panes.profiles.speedtest.udp")}
              onRun={runTargetSpeedtest}
            />
            <ContextSpeedMenuItem
              action={SPEED_ACTIONS.Download}
              disabled={speedtestRunning}
              icon={Gauge}
              label={t("panes.profiles.speedtest.speed")}
              onRun={runTargetSpeedtest}
            />
            <ContextSpeedMenuItem
              action={SPEED_ACTIONS.Mixed}
              disabled={speedtestRunning}
              icon={Wifi}
              label={t("panes.profiles.speedtest.mixed")}
              onRun={runTargetSpeedtest}
            />
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={!speedtestRunning}
              onSelect={() => void handleCancelSpeedtest()}
              title={t("panes.profiles.speedtest.cancelTitle")}
            >
              <Square className="size-4" aria-hidden="true" />
              {t("panes.profiles.speedtest.stop")}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <ArrowDown className="size-4" aria-hidden="true" />
            {t("panes.profiles.menu.move")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onSelect={() => void runOperation(() => moveProfile(null, indexId, MOVE_ACTIONS.Top, null))}>
              <ChevronsUp className="size-4" aria-hidden="true" />
              {t("panes.profiles.menu.moveTop")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void runOperation(() => moveProfile(null, indexId, MOVE_ACTIONS.Up, null))}>
              <ArrowUp className="size-4" aria-hidden="true" />
              {t("panes.profiles.menu.moveUp")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void runOperation(() => moveProfile(null, indexId, MOVE_ACTIONS.Down, null))}>
              <ArrowDown className="size-4" aria-hidden="true" />
              {t("panes.profiles.menu.moveDown")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void runOperation(() => moveProfile(null, indexId, MOVE_ACTIONS.Bottom, null))}>
              <ChevronsDown className="size-4" aria-hidden="true" />
              {t("panes.profiles.menu.moveBottom")}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Share2 className="size-4" aria-hidden="true" />
            {t("panes.profiles.export.export")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextExportMenuItems
              onExport={(kind) => void handleExport(kind, [indexId])}
              onSave={(kind) => void handleExport(kind, [indexId], false, true)}
              onShowQr={() => void handleExport("shareLinks", [indexId], true)}
              t={t}
            />
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => requestDelete([indexId])} variant="destructive">
          <Trash2 className="size-4" aria-hidden="true" />
          {t("panes.profiles.toolbar.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
      <MenubarItem onSelect={() => onExport("voyaBundle")}>
        <Link className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.voyaBundle")}
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

function ContextExportMenuItems({
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
      <ContextMenuItem onSelect={() => onExport("shareLinks")}>
        <Link className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.shareLinks")}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onExport("shareBase64")}>
        <Share2 className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.shareBase64")}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onExport("voyaBundle")}>
        <Link className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.voyaBundle")}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onExport("clientConfig")}>
        <FileJson2 className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.clientConfig")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onShowQr}>
        <QrCode className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.showQr")}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onSave("shareLinks")}>
        <Download className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.saveShareLinks")}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onSave("clientConfig")}>
        <FileJson2 className="size-4" aria-hidden="true" />
        {t("panes.profiles.export.saveClientConfig")}
      </ContextMenuItem>
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
  action: SpeedTestKind;
  disabled: boolean;
  icon: LucideIcon;
  label: string;
  onRun: (kind: SpeedTestKind) => Promise<void>;
}) {
  return (
    <MenubarItem disabled={disabled} onSelect={() => void onRun(action)}>
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </MenubarItem>
  );
}

function ContextSpeedMenuItem({
  action,
  disabled,
  icon: Icon,
  label,
  onRun,
}: {
  action: SpeedTestKind;
  disabled: boolean;
  icon: LucideIcon;
  label: string;
  onRun: (kind: SpeedTestKind) => Promise<void>;
}) {
  return (
    <ContextMenuItem disabled={disabled} onSelect={() => void onRun(action)}>
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </ContextMenuItem>
  );
}
