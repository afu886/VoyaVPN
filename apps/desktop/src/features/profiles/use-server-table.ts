import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  cancelSpeedtest,
  deleteProfiles,
  importProfilesFromText,
  listProfiles,
  runSpeedtest,
  saveGroupProfile,
  saveProfile,
  saveTextFile,
  sortProfiles,
  useRuntimeEventStore,
} from "@/ipc";
import type {
  ImportProfilesResult,
  Profile,
  ProfileListEntry,
  ProfileSortKey,
  SpeedTestKind,
  SpeedTestTarget,
} from "@/ipc/bindings";
import { useI18n } from "@voya/i18n/use-i18n";
import { getErrorMessage } from "@voya/utils/error";
import { useProfileColumnsStore } from "@/stores/profile-columns-store";

import {
  exportFileFilter,
  exportFileName,
  formatImportOperationMessage,
  profilesQueryKey,
  runProfileExport,
  type ProfileExportKind,
} from "./server-table-actions";
import {
  buildGridMinWidth,
  buildGridTemplateColumns,
  serverColumns,
} from "./server-table-columns";
import { CONFIG_TYPES } from "./profile-constants";
import { applyLiveUpdates } from "./server-table-live-updates";

type DialogState =
  | { mode: "create"; profile?: null }
  | { mode: "edit"; profile: ProfileListEntry }
  | null;

export function useServerTable() {
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const [filterText, setFilterText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importingFromClipboard, setImportingFromClipboard] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareQrContent, setShareQrContent] = useState<string | null>(null);
  const [sortState, setSortState] = useState<{ ascending: boolean; key: ProfileSortKey } | null>(null);
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);
  const { t } = useI18n();
  const columnVisibility = useProfileColumnsStore((state) => state.columnVisibility);
  const setColumnVisibility = useProfileColumnsStore((state) => state.setColumnVisibility);
  const resetColumnVisibility = useProfileColumnsStore((state) => state.resetColumnVisibility);
  const serverStatsByProfileId = useRuntimeEventStore((state) => state.serverStatsByProfileId);
  const speedtestResultsByProfileId = useRuntimeEventStore((state) => state.speedtestResultsByProfileId);
  const speedtestRunning = useRuntimeEventStore((state) => state.speedtestRunning);
  const setSpeedtestRunning = useRuntimeEventStore((state) => state.setSpeedtestRunning);
  const queryClient = useQueryClient();
  const filter = filterText.trim();
  const profilesQuery = useQuery({
    queryFn: () => listProfiles(null, filter || null),
    queryKey: profilesQueryKey(filter),
  });
  const profiles = useMemo(
    () => applyLiveUpdates(profilesQuery.data ?? [], serverStatsByProfileId, speedtestResultsByProfileId),
    [profilesQuery.data, serverStatsByProfileId, speedtestResultsByProfileId],
  );

  const tableColumns = useMemo<ColumnDef<ProfileListEntry>[]>(
    () =>
      serverColumns.map((column) => ({
        id: column.id,
        header: column.labelKey,
        // The structural `#`/state column is always shown; everything else can
        // be collapsed through the column menu.
        enableHiding: column.id !== "state",
      })),
    [],
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table owns stable row-model helpers internally.
  const table = useReactTable({
    columns: tableColumns,
    data: profiles,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.profile.id,
    onColumnVisibilityChange: setColumnVisibility,
    state: { columnVisibility },
  });
  const hideableColumns = table.getAllLeafColumns().filter((column) => column.getCanHide());
  const visibleColumns = useMemo(
    () => serverColumns.filter((column) => column.id === "state" || columnVisibility[column.id] !== false),
    [columnVisibility],
  );
  const gridTemplateColumns = useMemo(() => buildGridTemplateColumns(visibleColumns), [visibleColumns]);
  const gridMinWidth = useMemo(() => buildGridMinWidth(visibleColumns), [visibleColumns]);
  const rows = table.getRowModel().rows;
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 38,
    getScrollElement: () => viewportRef.current,
    initialRect: { height: 520, width: 1200 },
    overscan: 10,
  });
  const visibleRows = rowVirtualizer.getVirtualItems();
  const renderedRows =
    visibleRows.length > 0
      ? visibleRows
      : rows.slice(0, Math.min(rows.length, 30)).map((row, index) => ({
          index,
          key: row.id,
          start: index * 38,
        }));
  async function runOperation(operation: () => Promise<unknown>) {
    setOperationError(null);
    setOperationMessage(null);
    try {
      await operation();
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    } catch (error) {
      setOperationError(getErrorMessage(error));
    }
  }

  // Destructive: route deletions through a confirmation gate instead of firing
  // the IPC call directly from the trigger.
  function requestDelete(indexIds: string[]) {
    if (indexIds.length > 0) {
      setPendingDelete(indexIds);
    }
  }

  function confirmDelete() {
    const indexIds = pendingDelete;
    setPendingDelete(null);
    if (indexIds && indexIds.length > 0) {
      if (selectedId && indexIds.includes(selectedId)) {
        setSelectedId(null);
      }
      void runOperation(() => deleteProfiles(indexIds));
    }
  }

  function selectOnly(indexId: string) {
    setSelectedId(indexId);
  }

  async function handleSort(sortKey: ProfileSortKey) {
    const ascending = sortState?.key === sortKey ? !sortState.ascending : true;
    setSortState({ ascending, key: sortKey });
    await runOperation(() => sortProfiles(null, sortKey, ascending));
  }

  async function handleSave(profile: Profile) {
    const save = profile.protocol.kind === CONFIG_TYPES.PolicyGroup || profile.protocol.kind === CONFIG_TYPES.ProxyChain
      ? saveGroupProfile
      : saveProfile;
    await runOperation(() => save(profile));
    setDialogState(null);
  }

  async function handleImportFromClipboard() {
    setOperationError(null);
    setOperationMessage(null);

    if (!navigator.clipboard?.readText) {
      setOperationError(t("panes.profiles.import.clipboardUnavailable"));
      return;
    }

    setImportingFromClipboard(true);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        throw new Error(t("panes.profiles.import.clipboardEmpty"));
      }

      const result = await importProfilesFromText(text, null);
      await handleDialogImport(result);
    } catch (error) {
      setOperationError(getErrorMessage(error));
    } finally {
      setImportingFromClipboard(false);
    }
  }

  async function handleDialogImport(result: ImportProfilesResult) {
    setOperationError(null);
    setOperationMessage(formatImportOperationMessage(result, t));
    const importedIndexIds = result.importedProfileIds;
    if (importedIndexIds.length > 0) {
      setFilterText("");
      setSelectedId(importedIndexIds[0] ?? null);
      const refreshedProfiles = await listProfiles(null, null);
      queryClient.setQueryData(profilesQueryKey(""), refreshedProfiles);
    } else {
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    }
    await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
  }

  async function performExport(
    kind: ProfileExportKind,
    indexIds: string[],
    showQr: boolean,
    saveFile: boolean,
  ) {
    const result = await runProfileExport(kind, indexIds);
    if (showQr) {
      setShareQrContent(result.text);
      return;
    }

    if (saveFile) {
      const path = await saveTextFile({
        defaultPath: exportFileName(kind),
        filters: [exportFileFilter(kind)],
        text: result.text,
      });
      if (path) {
        setOperationMessage(t("panes.profiles.export.savedFile", { path }));
      }
      return;
    }

    if (!navigator.clipboard?.writeText) {
      throw new Error(t("panes.profiles.export.clipboardUnavailable"));
    }
    await navigator.clipboard.writeText(result.text);
    setOperationMessage(t("panes.profiles.export.copied", { count: result.count }));
  }

  async function handleExport(kind: ProfileExportKind, indexIds: string[], showQr = false, saveFile = false) {
    setOperationError(null);
    setOperationMessage(null);
    if (indexIds.length === 0) {
      setOperationError(t("panes.profiles.export.noSelection"));
      return;
    }

    try {
      await performExport(kind, indexIds, showQr, saveFile);
    } catch (error) {
      setOperationError(getErrorMessage(error));
    }
  }

  async function handleBulkExport(kind: ProfileExportKind, showQr = false, saveFile = false) {
    setOperationError(null);
    setOperationMessage(null);
    try {
      const allProfiles = await listProfiles(null, null);
      const indexIds = allProfiles.map((item) => item.profile.id);
      if (indexIds.length === 0) {
        setOperationError(t("panes.profiles.export.noProfiles"));
        return;
      }
      await performExport(kind, indexIds, showQr, saveFile);
    } catch (error) {
      setOperationError(getErrorMessage(error));
    }
  }

  async function handleSpeedtest(kind: SpeedTestKind, target: SpeedTestTarget) {
    setColumnVisibility((current) => ({ ...current, delay: true, speed: true }));
    setSpeedtestRunning(true);
    try {
      await runOperation(() => runSpeedtest({
        kind,
        target,
      }));
    } finally {
      setSpeedtestRunning(false);
    }
  }

  async function handleCancelSpeedtest() {
    await runOperation(() => cancelSpeedtest());
    setSpeedtestRunning(false);
  }

  return {
    confirmDelete,
    dialogState,
    filterText,
    gridMinWidth,
    gridTemplateColumns,
    handleBulkExport,
    handleCancelSpeedtest,
    handleDialogImport,
    handleExport,
    handleImportFromClipboard,
    handleSave,
    handleSort,
    handleSpeedtest,
    hideableColumns,
    importOpen,
    importingFromClipboard,
    operationError,
    operationMessage,
    pendingDelete,
    profiles,
    profilesQuery,
    queryClient,
    renderedRows,
    requestDelete,
    resetColumnVisibility,
    rows,
    rowVirtualizer,
    runOperation,
    selectOnly,
    selectedId,
    setDialogState,
    setFilterText,
    setImportOpen,
    setPendingDelete,
    setShareQrContent,
    setSubscriptionsOpen,
    shareQrContent,
    sortState,
    speedtestRunning,
    subscriptionsOpen,
    t,
    viewportRef,
    visibleColumns,
  };
}

export type ServerTableController = ReturnType<typeof useServerTable>;
