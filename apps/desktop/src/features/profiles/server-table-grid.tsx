import type * as React from "react";
import { ArrowDown, ArrowUp, Inbox } from "lucide-react";

import {
  dataTableHeader,
  dataTableRowEven,
  dataTableRowHover,
  dataTableRowOdd,
  dataTableRowSelected,
  dataTableWell,
} from "@/components/app-shell/data-table-surface";
import { Checkbox } from "@voya/ui/components/checkbox";
import { EmptyState } from "@voya/ui/components/empty-state";
import { Skeleton } from "@voya/ui/components/skeleton";
import { copyProfiles, moveProfile, setActiveProfile } from "@/ipc";
import { cn } from "@voya/ui/lib/utils";

import { cellTitle, sortAriaValue } from "./server-table-columns";
import { ProfileRowContextMenu } from "./server-table-menus";
import { MOVE_ACTIONS } from "./profile-constants";
import type { ServerTableController } from "./use-server-table";

export function ServerTableGrid({ controller }: { controller: ServerTableController }) {
  const {
    allVisibleCheckboxState,
    draggedId,
    gridMinWidth,
    gridTemplateColumns,
    handleExport,
    handleSort,
    profiles,
    profilesQuery,
    renderedRows,
    requestDelete,
    rows,
    rowVirtualizer,
    runOperation,
    selectOnly,
    selectedIds,
    selectedIdsArray,
    setDialogState,
    setDraggedId,
    sortState,
    t,
    toggleAllVisible,
    toggleSelection,
    viewportRef,
    visibleColumns,
  } = controller;

  return (
    <div className="min-h-0 flex-1 overflow-hidden p-4">
      <div
        aria-busy={profilesQuery.isLoading}
        aria-colcount={visibleColumns.length + 1}
        aria-label={t("panes.profiles.title")}
        aria-rowcount={profiles.length}
        className={cn("flex h-full min-h-[18rem] flex-col", dataTableWell)}
        role="table"
      >
        <div className="overflow-x-auto border-b">
          <div
            aria-rowindex={1}
            className={cn("grid items-center", dataTableHeader)}
            role="row"
            style={{ gridTemplateColumns, minWidth: gridMinWidth }}
          >
            <div
              aria-colindex={1}
              className="flex h-9 items-center justify-center border-e px-2"
              role="columnheader"
            >
              <Checkbox
                aria-label={t("panes.profiles.aria.selectAll")}
                checked={allVisibleCheckboxState}
                onCheckedChange={(checked) => toggleAllVisible(checked === true)}
              />
            </div>
            {visibleColumns.map((column, columnIndex) => (
              <div
                aria-colindex={columnIndex + 2}
                aria-sort={sortAriaValue(column, sortState)}
                className="flex h-9 min-w-0 items-center border-e px-2 last:border-e-0"
                key={column.id}
                role="columnheader"
              >
                {column.sortKey ? (
                  <button
                    className="flex min-w-0 items-center gap-1 text-start"
                    onClick={() => void handleSort(column.sortKey!)}
                    type="button"
                  >
                    <span className="truncate">{t(column.labelKey)}</span>
                    {sortState?.key === column.sortKey ? (
                      sortState.ascending ? (
                        <ArrowUp className="size-3" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="size-3" aria-hidden="true" />
                      )
                    ) : null}
                  </button>
                ) : (
                  <span className="truncate">{t(column.labelKey)}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-auto"
          data-testid="server-table-viewport"
          ref={viewportRef}
          role="rowgroup"
        >
          {profilesQuery.isLoading ? (
            <ProfileSkeletonRows
              aria-label={t("panes.profiles.loading")}
              columnCount={visibleColumns.length}
              gridMinWidth={gridMinWidth}
              gridTemplateColumns={gridTemplateColumns}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              className="h-full content-center"
              description={t("panes.profiles.emptyDescription")}
              icon={Inbox}
              title={t("panes.profiles.empty")}
            />
          ) : (
            <div className="relative" style={{ height: rowVirtualizer.getTotalSize(), minWidth: gridMinWidth }}>
              {renderedRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) {
                  return null;
                }

                const item = row.original;
                const indexId = item.profile.IndexId;
                const isSelected = selectedIds.has(indexId);

                return (
                  <ProfileRowContextMenu
                    item={item}
                    key={row.id}
                    onActivate={() => void runOperation(() => setActiveProfile(indexId))}
                    onCopy={() => void runOperation(() => copyProfiles(selectedIds.has(indexId) ? selectedIdsArray : [indexId]))}
                    onDelete={() => requestDelete(selectedIds.has(indexId) ? selectedIdsArray : [indexId])}
                    onEdit={() => setDialogState({ mode: "edit", profile: item })}
                    onExport={(kind) =>
                      void handleExport(kind, selectedIds.has(indexId) ? selectedIdsArray : [indexId])
                    }
                    onSave={(kind) =>
                      void handleExport(kind, selectedIds.has(indexId) ? selectedIdsArray : [indexId], false, true)
                    }
                    onMove={(action) => void runOperation(() => moveProfile(null, indexId, action, null))}
                    onSelectOnly={() => selectOnly(indexId)}
                    onShowQr={() =>
                      void handleExport("shareLinks", selectedIds.has(indexId) ? selectedIdsArray : [indexId], true)
                    }
                  >
                    <div
                      aria-selected={isSelected}
                      className={cn(
                        "absolute start-0 grid h-9.5 items-center border-b text-sm outline-none",
                        isSelected
                          ? dataTableRowSelected
                          : cn(
                              virtualRow.index % 2 === 0 ? dataTableRowEven : dataTableRowOdd,
                              dataTableRowHover,
                            ),
                      )}
                      data-testid="server-row"
                      draggable
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey) {
                          toggleSelection(indexId, !isSelected);
                        } else {
                          selectOnly(indexId);
                        }
                      }}
                      onDoubleClick={() => void runOperation(() => setActiveProfile(indexId))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void runOperation(() => setActiveProfile(indexId));
                        }
                        if (event.key === " ") {
                          event.preventDefault();
                          toggleSelection(indexId, !isSelected);
                        }
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={(event) => {
                        setDraggedId(indexId);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/profile-id", indexId);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = event.dataTransfer.getData("text/profile-id") || draggedId;
                        if (sourceId && sourceId !== indexId) {
                          void runOperation(() => moveProfile(null, sourceId, MOVE_ACTIONS.Position, virtualRow.index));
                        }
                        setDraggedId(null);
                      }}
                      aria-rowindex={virtualRow.index + 2}
                      role="row"
                      style={{
                        gridTemplateColumns,
                        minWidth: gridMinWidth,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      tabIndex={0}
                    >
                      <div
                        aria-colindex={1}
                        className="flex h-full items-center justify-center border-e px-2"
                        role="cell"
                      >
                        <Checkbox
                          aria-label={t("panes.profiles.aria.selectRow", { name: item.profile.Remarks || indexId })}
                          checked={isSelected}
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={(checked) => toggleSelection(indexId, checked === true)}
                        />
                      </div>
                      {visibleColumns.map((column, columnIndex) => {
                        const cell = column.cell(item, virtualRow.index + 1, t);

                        return (
                          <div
                            aria-colindex={columnIndex + 2}
                            className="flex h-full min-w-0 items-center border-e px-2 last:border-e-0"
                            key={column.id}
                            role="cell"
                            title={cellTitle(cell)}
                          >
                            <span className="truncate">{cell}</span>
                          </div>
                        );
                      })}
                    </div>
                  </ProfileRowContextMenu>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Mirror the grid geometry of a real row so the loading state holds the same
// layout as the populated table — the connections pane skeleton pattern.
function ProfileSkeletonRows({
  columnCount,
  gridMinWidth,
  gridTemplateColumns,
  ...props
}: React.ComponentProps<"div"> & {
  columnCount: number;
  gridMinWidth: string;
  gridTemplateColumns: string;
}) {
  return (
    <div role="status" {...props}>
      {Array.from({ length: 12 }).map((_, rowIndex) => (
        <div
          className="grid h-9.5 items-center border-b"
          key={rowIndex}
          style={{ gridTemplateColumns, minWidth: gridMinWidth }}
        >
          <div className="flex h-full items-center justify-center border-e px-2">
            <Skeleton className="size-4 rounded-sm" />
          </div>
          {Array.from({ length: columnCount }).map((_, columnIndex) => (
            <div className="flex h-full items-center border-e px-2 last:border-e-0" key={columnIndex}>
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
