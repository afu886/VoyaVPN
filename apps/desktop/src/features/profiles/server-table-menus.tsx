import type * as React from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Clock,
  Copy,
  Download,
  FileJson2,
  Gauge,
  Link,
  Pencil,
  Play,
  QrCode,
  Radio,
  Share2,
  Square,
  Trash2,
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
import type { ProfileListItem_Serialize, SpeedActionType } from "@/ipc/bindings";
import { useI18n } from "@voya/i18n/use-i18n";

import { MOVE_ACTIONS, SPEED_ACTIONS } from "./profile-constants";
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

export function ProfileRowContextMenu({
  children,
  item,
  onActivate,
  onCopy,
  onDelete,
  onEdit,
  onExport,
  onMove,
  onSave,
  onSelectOnly,
  onShowQr,
}: {
  children: React.ReactNode;
  item: ProfileListItem_Serialize;
  onActivate: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onExport: (kind: ProfileExportKind) => void;
  onMove: (action: number) => void;
  onSave: (kind: ProfileExportKind) => void;
  onSelectOnly: () => void;
  onShowQr: () => void;
}) {
  const { t } = useI18n();

  return (
    <ContextMenu.Root onOpenChange={(open) => open && onSelectOnly()}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-48 rounded-md border bg-card p-1 text-sm shadow-xl outline-none">
          <ContextMenu.Label className="truncate px-2 py-1.5 text-xs text-muted-foreground">
            {item.profile.Remarks || t("panes.profiles.untitled")}
          </ContextMenu.Label>
          <ContextItem icon={Play} label={t("panes.profiles.menu.activate")} onSelect={onActivate} />
          <ContextItem icon={Pencil} label={t("panes.profiles.menu.edit")} onSelect={onEdit} />
          <ContextItem icon={Copy} label={t("panes.profiles.menu.copy")} onSelect={onCopy} />
          <ContextItem icon={Trash2} label={t("panes.profiles.menu.delete")} onSelect={onDelete} />
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextItem icon={Link} label={t("panes.profiles.export.shareLinks")} onSelect={() => onExport("shareLinks")} />
          <ContextItem icon={Share2} label={t("panes.profiles.export.shareBase64")} onSelect={() => onExport("shareBase64")} />
          <ContextItem icon={Link} label={t("panes.profiles.export.innerLinks")} onSelect={() => onExport("innerLinks")} />
          <ContextItem icon={FileJson2} label={t("panes.profiles.export.clientConfig")} onSelect={() => onExport("clientConfig")} />
          <ContextItem icon={QrCode} label={t("panes.profiles.export.showQr")} onSelect={onShowQr} />
          <ContextItem icon={Download} label={t("panes.profiles.export.saveShareLinks")} onSelect={() => onSave("shareLinks")} />
          <ContextItem icon={FileJson2} label={t("panes.profiles.export.saveClientConfig")} onSelect={() => onSave("clientConfig")} />
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextItem icon={ChevronsUp} label={t("panes.profiles.menu.moveTop")} onSelect={() => onMove(MOVE_ACTIONS.Top)} />
          <ContextItem icon={ArrowUp} label={t("panes.profiles.menu.moveUp")} onSelect={() => onMove(MOVE_ACTIONS.Up)} />
          <ContextItem icon={ArrowDown} label={t("panes.profiles.menu.moveDown")} onSelect={() => onMove(MOVE_ACTIONS.Down)} />
          <ContextItem icon={ChevronsDown} label={t("panes.profiles.menu.moveBottom")} onSelect={() => onMove(MOVE_ACTIONS.Bottom)} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
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

function ContextItem({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none focus:bg-accent focus:text-accent-foreground"
      onSelect={onSelect}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </ContextMenu.Item>
  );
}
