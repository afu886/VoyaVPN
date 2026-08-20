import type * as React from "react";

import { Badge } from "@voya/ui/components/badge";
import type { TranslationFunction, TranslationKey } from "@voya/i18n";
import type { ProfileListItem_Serialize, ProfileSortKey } from "@/ipc/bindings";
import { formatDelay, formatSpeed, formatTraffic } from "@voya/utils/formatting";

import { getProtocolLabel } from "./profile-constants";

export type TranslateFn = TranslationFunction;

export type ServerColumn = {
  cell: (item: ProfileListItem_Serialize, rowNumber: number, t: TranslateFn) => React.ReactNode;
  id: string;
  labelKey: TranslationKey;
  sortKey?: ProfileSortKey;
  width: string;
};

export const serverColumns: ServerColumn[] = [
  {
    cell: (item, rowNumber, t) => (
      <span className="flex items-center gap-2">
        {item.isActive ? (
          // The live profile reads as a 6px green dot — intentionally distinct
          // from the blue row-selection state rendered by the surface tokens.
          <span
            aria-label={t("panes.profiles.aria.activeProfile")}
            className="size-1.5 rounded-full bg-connected"
            data-testid="active-profile-marker"
            role="img"
          />
        ) : (
          <span className="size-1.5" aria-hidden="true" />
        )}
        <span className="tabular-nums text-muted-foreground">{rowNumber}</span>
      </span>
    ),
    id: "state",
    labelKey: "panes.profiles.columns.labels.indexHeader",
    width: "5rem",
  },
  {
    cell: (item) => (
      <Badge className="max-w-full justify-start truncate text-muted-foreground" variant="outline">
        <span className="truncate">{getProtocolLabel(item.profile.ConfigType)}</span>
      </Badge>
    ),
    id: "configType",
    labelKey: "panes.profiles.columns.labels.protocol",
    sortKey: "configType",
    width: "8rem",
  },
  {
    cell: (item, _rowNumber, t) => item.profile.Remarks || t("panes.profiles.untitled"),
    id: "remarks",
    labelKey: "panes.profiles.columns.labels.remarks",
    sortKey: "remarks",
    width: "minmax(13rem,1.3fr)",
  },
  {
    cell: (item) => item.profile.Address,
    id: "address",
    labelKey: "panes.profiles.columns.labels.address",
    sortKey: "address",
    width: "minmax(12rem,1fr)",
  },
  {
    cell: (item) => <span className="tabular-nums">{item.profile.Port || ""}</span>,
    id: "port",
    labelKey: "panes.profiles.columns.labels.port",
    sortKey: "port",
    width: "5rem",
  },
  {
    cell: (item) => item.profile.Network || "tcp",
    id: "network",
    labelKey: "panes.profiles.columns.labels.transport",
    sortKey: "network",
    width: "7rem",
  },
  {
    cell: (item) => item.profile.StreamSecurity || "none",
    id: "security",
    labelKey: "panes.profiles.columns.labels.security",
    sortKey: "streamSecurity",
    width: "7rem",
  },
  {
    cell: (item) => formatDelay(item.profileEx.Delay),
    id: "delay",
    labelKey: "panes.profiles.columns.labels.delay",
    sortKey: "delay",
    width: "6rem",
  },
  {
    cell: (item) => formatSpeedOrMessage(item.profileEx.Speed, item.profileEx.Message),
    id: "speed",
    labelKey: "panes.profiles.columns.labels.speed",
    sortKey: "speed",
    width: "7rem",
  },
  {
    cell: (item) => formatTraffic(item.serverStat?.TodayUp),
    id: "todayUp",
    labelKey: "panes.profiles.columns.labels.todayUp",
    width: "8rem",
  },
  {
    cell: (item) => formatTraffic(item.serverStat?.TodayDown),
    id: "todayDown",
    labelKey: "panes.profiles.columns.labels.todayDown",
    width: "8rem",
  },
  {
    cell: (item) => formatTraffic(item.serverStat?.TotalUp),
    id: "totalUp",
    labelKey: "panes.profiles.columns.labels.totalUp",
    width: "8rem",
  },
  {
    cell: (item) => formatTraffic(item.serverStat?.TotalDown),
    id: "totalDown",
    labelKey: "panes.profiles.columns.labels.totalDown",
    width: "8rem",
  },
  {
    cell: (item) => item.profileEx.IpInfo ?? "",
    id: "ipInfo",
    labelKey: "panes.profiles.columns.labels.ipInfo",
    sortKey: "ipInfo",
    width: "10rem",
  },
  {
    cell: (item) => item.profile.Subid,
    id: "subid",
    labelKey: "panes.profiles.columns.labels.group",
    sortKey: "subid",
    width: "8rem",
  },
];

export const COLUMN_LABEL_KEY_BY_ID: Record<string, TranslationKey> = Object.fromEntries(
  serverColumns.map((column) => [column.id, column.labelKey]),
);

// Leading track is the selection checkbox column.
const SELECTION_COLUMN_WIDTH_REM = 2.75;

export function buildGridTemplateColumns(columns: ServerColumn[]) {
  return `${SELECTION_COLUMN_WIDTH_REM}rem ${columns.map((column) => column.width).join(" ")}`;
}

export function buildGridMinWidth(columns: ServerColumn[]) {
  const total = columns.reduce((sum, column) => sum + columnMinWidthRem(column.width), SELECTION_COLUMN_WIDTH_REM);
  return `${total}rem`;
}

export function sortAriaValue(
  column: ServerColumn,
  sortState: { ascending: boolean; key: ProfileSortKey } | null,
) {
  if (!column.sortKey || sortState?.key !== column.sortKey) {
    return "none" as const;
  }

  return sortState.ascending ? "ascending" : "descending";
}

export function cellTitle(cell: React.ReactNode) {
  return typeof cell === "string" || typeof cell === "number" ? String(cell) : undefined;
}

function columnMinWidthRem(width: string) {
  // Pick the first rem measurement — the fixed size, or the floor of a minmax().
  const match = /([\d.]+)rem/.exec(width);
  return match ? Number(match[1]) : 8;
}

function formatSpeedOrMessage(speed: number | null, message?: string | null) {
  if (isSpeedtestStatusMessage(message)) {
    return message;
  }

  const speedLabel = formatSpeed(speed);

  if (speedLabel) {
    return speedLabel;
  }

  if (!message || /^-?\d+(\.\d+)?$/.test(message)) {
    return "";
  }

  return message;
}

function isSpeedtestStatusMessage(message?: string | null) {
  return Boolean(message && !/^-?\d+(\.\d+)?$/.test(message));
}
