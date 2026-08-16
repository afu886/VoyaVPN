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
import { cn } from "@voya/ui/lib/utils";

import { cellTitle, sortAriaValue } from "./server-table-columns";
import type { ServerTableController } from "./use-server-table";

export function ServerTableGrid({ controller }: { controller: ServerTableController }) {
  const {
    allVisibleCheckboxState,
    gridMinWidth,
    gridTemplateColumns,
    handleSort,
    profilesQuery,
    renderedRows,
    rows,
    rowVirtualizer,
    selectOnly,
    selectedIds,
    sortState,
    t,
    toggleAllVisible,
    toggleSelection,
    viewportRef,
    visibleColumns,
  } = controller;
  const hasVirtualizedRows = !profilesQuery.isLoading && renderedRows.length < rows.length;

  return (
    <div className="min-h-0 flex-1 overflow-hidden p-4">
      <div className={cn("flex h-full min-h-[18rem] flex-col", dataTableWell)}>
        <div
          className="min-h-0 flex-1 overflow-auto"
          data-testid="server-table-viewport"
          ref={viewportRef}
        >
          <table
            aria-busy={profilesQuery.isLoading}
            aria-colcount={visibleColumns.length + 1}
            aria-rowcount={hasVirtualizedRows ? rows.length + 1 : undefined}
            className="relative w-full border-separate border-spacing-0"
            style={{ minWidth: gridMinWidth }}
          >
            <caption className="sr-only">{t("panes.profiles.title")}</caption>
            <thead className="sticky top-0 z-10">
              <tr
                aria-rowindex={1}
                className={cn("grid items-center border-b", dataTableHeader)}
                style={{ gridTemplateColumns }}
              >
                <th className="flex h-9 items-center justify-center border-e px-2" scope="col">
                  <Checkbox
                    aria-label={t("panes.profiles.aria.selectAll")}
                    checked={allVisibleCheckboxState}
                    onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                  />
                </th>
                {visibleColumns.map((column) => (
                  <th
                    aria-sort={sortAriaValue(column, sortState)}
                    className="flex h-9 min-w-0 items-center border-e px-2 last:border-e-0"
                    key={column.id}
                    scope="col"
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
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              className={profilesQuery.isLoading || rows.length === 0 ? undefined : "relative block"}
              style={
                profilesQuery.isLoading || rows.length === 0
                  ? undefined
                  : { height: rowVirtualizer.getTotalSize() }
              }
            >
              {profilesQuery.isLoading ? (
                <ProfileSkeletonRows
                  columnCount={visibleColumns.length}
                  gridMinWidth={gridMinWidth}
                  gridTemplateColumns={gridTemplateColumns}
                />
              ) : rows.length === 0 ? (
                <tr>
                  <td className="p-0" colSpan={visibleColumns.length + 1}>
                    <EmptyState
                      className="min-h-[18rem] content-center"
                      description={t("panes.profiles.emptyDescription")}
                      icon={Inbox}
                      title={t("panes.profiles.empty")}
                    />
                  </td>
                </tr>
              ) : (
                renderedRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) {
                    return null;
                  }

                  const item = row.original;
                  const indexId = item.profile.IndexId;
                  const isSelected = selectedIds.has(indexId);

                  return (
                    <tr
                        key={row.id}
                        aria-rowindex={virtualRow.index + 2}
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
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey) {
                            toggleSelection(indexId, !isSelected);
                          } else {
                            selectOnly(indexId);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === " " || event.key === "Enter") {
                            event.preventDefault();
                            toggleSelection(indexId, !isSelected);
                          }
                        }}
                        style={{
                          gridTemplateColumns,
                          minWidth: gridMinWidth,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        tabIndex={0}
                      >
                        <td className="flex h-full items-center justify-center border-e px-2">
                          <Checkbox
                            aria-label={t("panes.profiles.aria.selectRow", { name: item.profile.Remarks || indexId })}
                            checked={isSelected}
                            onClick={(event) => event.stopPropagation()}
                            onCheckedChange={(checked) => toggleSelection(indexId, checked === true)}
                          />
                        </td>
                        {visibleColumns.map((column) => {
                          const cell = column.cell(item, virtualRow.index + 1, t);

                          return (
                            <td
                              className="flex h-full min-w-0 items-center border-e px-2 last:border-e-0"
                              key={column.id}
                              title={cellTitle(cell)}
                            >
                              <span className="truncate">{cell}</span>
                            </td>
                          );
                        })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
}: {
  columnCount: number;
  gridMinWidth: string;
  gridTemplateColumns: string;
}) {
  return (
    <>
      {Array.from({ length: 12 }).map((_, rowIndex) => (
        <tr
          className="grid h-9.5 items-center border-b"
          key={rowIndex}
          style={{ gridTemplateColumns, minWidth: gridMinWidth }}
        >
          <td className="flex h-full items-center justify-center border-e px-2">
            <Skeleton className="size-4 rounded-sm" />
          </td>
          {Array.from({ length: columnCount }).map((_, columnIndex) => (
            <td className="flex h-full items-center border-e px-2 last:border-e-0" key={columnIndex}>
              <Skeleton className="h-4 w-3/4" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
