import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Columns3,
  Copy,
  ChevronsDown,
  ChevronsUp,
  FilePlus2,
  Filter,
  Pencil,
  RotateCcw,
  Rows3,
  Rss,
  Search,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";

import { BulkActionBar, Toolbar, ToolbarGroup, ToolbarOverflow } from "@/components/app-shell/toolbar";
import { InlinePageError } from "@/components/app-shell/inline-page-error";
import { PageHeader, PageHeaderHeading } from "@/components/app-shell/page-section";
import { Button } from "@voya/ui/components/button";
import { Input } from "@voya/ui/components/input";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@voya/ui/components/menubar";
import { copyProfiles, dedupeProfiles, moveProfile } from "@/ipc";
import { getErrorMessage } from "@voya/utils/error";

import { COLUMN_LABEL_KEY_BY_ID } from "./server-table-columns";
import { ExportMenuItems, SpeedtestSplitButton } from "./server-table-menus";
import { MOVE_ACTIONS } from "./profile-constants";
import type { ServerTableController } from "./use-server-table";

export function ServerTableToolbar({ controller }: { controller: ServerTableController }) {
  const {
    filterText,
    handleCancelSpeedtest,
    handleExport,
    handleImportFromClipboard,
    handleSpeedtest,
    hideableColumns,
    importingFromClipboard,
    operationError,
    operationMessage,
    primarySelection,
    profiles,
    profilesQuery,
    requestDelete,
    resetColumnVisibility,
    runOperation,
    selected,
    selectedIdsArray,
    setDialogState,
    setFilterText,
    setImportOpen,
    setSubscriptionsOpen,
    speedtestRunning,
    t,
  } = controller;

  return (
    <>
      <PageHeader>
        <PageHeaderHeading
          count={t("panes.profiles.toolbar.rows", { rows: profiles.length.toLocaleString() })}
          icon={Rows3}
          title={t("panes.profiles.title")}
        />

        <div className="relative ms-auto min-w-[14rem]">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label={t("panes.profiles.aria.filter")}
            className="h-9 ps-9"
            onChange={(event) => setFilterText(event.target.value)}
            placeholder={t("panes.profiles.toolbar.filterPlaceholder")}
            type="search"
            value={filterText}
          />
        </div>
      </PageHeader>

      <Toolbar className="shrink-0 border-b px-4 py-2">
        <ToolbarGroup>
          <Button onClick={() => setDialogState({ mode: "create" })} size="sm" type="button">
            <FilePlus2 className="size-4" aria-hidden="true" />
            {t("panes.profiles.toolbar.add")}
          </Button>
        </ToolbarGroup>

        <ToolbarGroup>
          <Menubar className="h-auto border-0 bg-transparent p-0 shadow-none">
            <MenubarMenu>
              <MenubarTrigger asChild>
                <Button size="sm" type="button" variant="outline">
                  <Columns3 className="size-4" aria-hidden="true" />
                  {t("panes.profiles.columns.toggle")}
                </Button>
              </MenubarTrigger>
              <MenubarContent align="end">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {t("panes.profiles.columns.heading")}
                </div>
                <MenubarSeparator />
                {hideableColumns.map((column) => (
                  <MenubarCheckboxItem
                    checked={column.getIsVisible()}
                    key={column.id}
                    onCheckedChange={(value) => column.toggleVisibility(value === true)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {t(COLUMN_LABEL_KEY_BY_ID[column.id])}
                  </MenubarCheckboxItem>
                ))}
                <MenubarSeparator />
                <MenubarItem onSelect={() => resetColumnVisibility()}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {t("panes.profiles.columns.reset")}
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarOverflow label={t("panes.profiles.toolbar.more")}>
            <MenubarItem
              disabled={importingFromClipboard}
              onSelect={() => void handleImportFromClipboard()}
            >
              <ClipboardPaste className="size-4" aria-hidden="true" />
              {t("panes.profiles.import.clipboard")}
            </MenubarItem>
            <MenubarItem onSelect={() => setImportOpen(true)}>
              <Upload className="size-4" aria-hidden="true" />
              {t("panes.profiles.toolbar.import")}
            </MenubarItem>
            <MenubarItem onSelect={() => setSubscriptionsOpen(true)}>
              <Rss className="size-4" aria-hidden="true" />
              {t("panes.profiles.toolbar.subscriptions")}
            </MenubarItem>
            <MenubarItem onSelect={() => void runOperation(() => dedupeProfiles(null, null))}>
              <Filter className="size-4" aria-hidden="true" />
              {t("panes.profiles.toolbar.dedupe")}
            </MenubarItem>
          </ToolbarOverflow>
        </ToolbarGroup>
      </Toolbar>

      {selected.length > 0 ? (
        <BulkActionBar>
          <span className="text-sm font-medium">
            {t("panes.profiles.bulk.selected", { count: selected.length })}
          </span>
          <div className="ms-auto flex items-center gap-2">
            <Button
              disabled={selected.length !== 1}
              onClick={() => primarySelection && setDialogState({ mode: "edit", profile: primarySelection })}
              size="sm"
              type="button"
              variant="outline"
            >
              <Pencil className="size-4" aria-hidden="true" />
              {t("panes.profiles.toolbar.edit")}
            </Button>
            <Button
              onClick={() => void runOperation(() => copyProfiles(selectedIdsArray))}
              size="sm"
              type="button"
              variant="outline"
            >
              <Copy className="size-4" aria-hidden="true" />
              {t("panes.profiles.toolbar.copy")}
            </Button>
            <SpeedtestSplitButton
              disabled={selected.length === 0}
              onCancel={handleCancelSpeedtest}
              onRun={handleSpeedtest}
              running={speedtestRunning}
            />
            <Menubar className="h-auto border-0 bg-transparent p-0 shadow-none">
              <MenubarMenu>
                <MenubarTrigger asChild>
                  <Button disabled={selected.length !== 1} size="sm" type="button" variant="outline">
                    <ArrowDown className="size-4" aria-hidden="true" />
                    {t("panes.profiles.menu.move")}
                  </Button>
                </MenubarTrigger>
                <MenubarContent align="end">
                  <MenubarItem
                    onSelect={() => primarySelection && void runOperation(() => moveProfile(null, primarySelection.profile.IndexId, MOVE_ACTIONS.Top, null))}
                  >
                    <ChevronsUp className="size-4" aria-hidden="true" />
                    {t("panes.profiles.menu.moveTop")}
                  </MenubarItem>
                  <MenubarItem
                    onSelect={() => primarySelection && void runOperation(() => moveProfile(null, primarySelection.profile.IndexId, MOVE_ACTIONS.Up, null))}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                    {t("panes.profiles.menu.moveUp")}
                  </MenubarItem>
                  <MenubarItem
                    onSelect={() => primarySelection && void runOperation(() => moveProfile(null, primarySelection.profile.IndexId, MOVE_ACTIONS.Down, null))}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                    {t("panes.profiles.menu.moveDown")}
                  </MenubarItem>
                  <MenubarItem
                    onSelect={() => primarySelection && void runOperation(() => moveProfile(null, primarySelection.profile.IndexId, MOVE_ACTIONS.Bottom, null))}
                  >
                    <ChevronsDown className="size-4" aria-hidden="true" />
                    {t("panes.profiles.menu.moveBottom")}
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
            <Menubar className="h-auto border-0 bg-transparent p-0 shadow-none">
              <MenubarMenu>
                <MenubarTrigger asChild>
                  <Button size="sm" type="button" variant="outline">
                    <Share2 className="size-4" aria-hidden="true" />
                    {t("panes.profiles.export.export")}
                  </Button>
                </MenubarTrigger>
                <MenubarContent align="end">
                  <ExportMenuItems
                    onExport={(kind) => void handleExport(kind, selectedIdsArray)}
                    onSave={(kind) => void handleExport(kind, selectedIdsArray, false, true)}
                    onShowQr={() => void handleExport("shareLinks", selectedIdsArray, true)}
                    t={t}
                  />
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
            <Button
              onClick={() => requestDelete(selectedIdsArray)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t("panes.profiles.toolbar.delete")}
            </Button>
          </div>
        </BulkActionBar>
      ) : null}

      {operationError ? <InlinePageError>{operationError}</InlinePageError> : null}
      {profilesQuery.isError ? <InlinePageError>{getErrorMessage(profilesQuery.error)}</InlinePageError> : null}
      {operationMessage ? (
        <div className="border-b bg-connected/10 px-4 py-2 text-sm text-connected">{operationMessage}</div>
      ) : null}
    </>
  );
}
