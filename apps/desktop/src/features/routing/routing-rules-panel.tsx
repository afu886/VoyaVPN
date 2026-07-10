import { ArrowDown, ArrowUp, Pencil, Plus, Route, Trash2 } from "lucide-react";

import {
  dataTableHeader,
  dataTableRowEven,
  dataTableRowHover,
  dataTableRowOdd,
  dataTableRowSelected,
} from "@/components/app-shell/data-table-surface";
import { Badge } from "@voya/ui/components/badge";
import { Button } from "@voya/ui/components/button";
import { EmptyState } from "@voya/ui/components/empty-state";
import { ScrollArea } from "@voya/ui/components/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voya/ui/components/table";
import { cn } from "@voya/ui/lib/utils";
import { MOVE_ACTIONS } from "@/features/profiles/profile-constants";

import { RULE_TYPES } from "./routing-constants";
import type { RoutingScreenController } from "./use-routing-screen";

export function RoutingRulesPanel({ controller }: { controller: RoutingScreenController }) {
  const {
    deleteSelectedRule,
    moveSelectedRule,
    selectedRouting,
    selectedRule,
    setRuleDialog,
    setSelectedRuleId,
  } = controller;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{selectedRouting?.Remarks ?? "No routing profile"}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {selectedRouting
              ? `${selectedRouting.RuleNum} rules · sing-box ${selectedRouting.DomainStrategy4Singbox || "default"}`
              : ""}
          </p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button disabled={!selectedRouting} onClick={() => setRuleDialog({ mode: "create" })} size="sm" type="button">
            <Plus className="size-4" aria-hidden="true" />
            Rule
          </Button>
          <Button
            disabled={!selectedRule}
            onClick={() => selectedRule && setRuleDialog({ mode: "edit", rule: selectedRule })}
            size="sm"
            type="button"
            variant="outline"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
          <Button
            disabled={!selectedRouting || !selectedRule}
            onClick={() => moveSelectedRule(MOVE_ACTIONS.Up)}
            size="icon"
            type="button"
            variant="outline"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            disabled={!selectedRouting || !selectedRule}
            onClick={() => moveSelectedRule(MOVE_ACTIONS.Down)}
            size="icon"
            type="button"
            variant="outline"
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </Button>
          <Button
            disabled={!selectedRouting || !selectedRule}
            onClick={deleteSelectedRule}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 bg-surface-sunken">
        {(selectedRouting?.RuleSet ?? []).length > 0 ? (
          <Table className="min-w-[58rem]">
            <TableHeader className={cn("sticky top-0 z-10", dataTableHeader)}>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 px-3 text-muted-foreground" scope="col">
                  #
                </TableHead>
                <TableHead className="px-3 text-muted-foreground" scope="col">
                  Remarks
                </TableHead>
                <TableHead className="px-3 text-muted-foreground" scope="col">
                  Outbound
                </TableHead>
                <TableHead className="px-3 text-muted-foreground" scope="col">
                  Type
                </TableHead>
                <TableHead className="px-3 text-muted-foreground" scope="col">
                  Domain
                </TableHead>
                <TableHead className="px-3 text-muted-foreground" scope="col">
                  IP
                </TableHead>
                <TableHead className="px-3 text-muted-foreground" scope="col">
                  Port
                </TableHead>
                <TableHead className="px-3 text-muted-foreground" scope="col">
                  Network
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(selectedRouting?.RuleSet ?? []).map((rule, index) => (
                <TableRow
                  className={cn(
                    "cursor-default",
                    selectedRule?.Id === rule.Id
                      ? dataTableRowSelected
                      : cn(index % 2 === 0 ? dataTableRowEven : dataTableRowOdd, dataTableRowHover),
                    !rule.Enabled ? "opacity-55" : "",
                  )}
                  key={rule.Id}
                  onClick={() => setSelectedRuleId(rule.Id)}
                >
                  <TableCell className="px-3 py-2 tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="max-w-52 truncate px-3 py-2 font-medium">{rule.Remarks ?? ""}</TableCell>
                  <TableCell className="px-3 py-2">{rule.OutboundTag ?? ""}</TableCell>
                  <TableCell className="px-3 py-2">
                    <RuleTypeBadge ruleType={rule.RuleType} />
                  </TableCell>
                  <TableCell className="max-w-72 truncate px-3 py-2">{formatList(rule.Domain)}</TableCell>
                  <TableCell className="max-w-56 truncate px-3 py-2">{formatList(rule.Ip)}</TableCell>
                  <TableCell className="px-3 py-2">{rule.Port ?? ""}</TableCell>
                  <TableCell className="px-3 py-2">{rule.Network ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState className="h-full content-center" icon={Route} title="No routing rules" />
        )}
      </ScrollArea>
    </div>
  );
}

function RuleTypeBadge({ ruleType }: { ruleType: number | null | undefined }) {
  return (
    <Badge className="bg-background" variant="outline">
      {formatRuleType(ruleType)}
    </Badge>
  );
}

function formatRuleType(ruleType: number | null | undefined) {
  switch (ruleType) {
    case RULE_TYPES.Routing:
      return "Routing";
    case RULE_TYPES.Dns:
      return "DNS";
    case RULE_TYPES.All:
    default:
      return "All";
  }
}

function formatList(values: string[] | null | undefined) {
  return values?.join(", ") ?? "";
}
