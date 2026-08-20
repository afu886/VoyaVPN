import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteRoutingRules,
  deleteRoutings,
  listRoutings,
  moveRoutingRule,
  saveRouting,
  saveRoutingRule,
  setActiveRouting,
} from "@/ipc";
import type { MoveAction, RoutingRule, Routing_Serialize } from "@/ipc/bindings";
import { getErrorMessage } from "@voya/utils/error";

import { type RoutingFormPayload, type RoutingRulePayload } from "./routing-form-schema";

type RoutingDialogState =
  | { mode: "create"; routing?: null }
  | { mode: "edit"; routing: Routing_Serialize }
  | null;

type RuleDialogState =
  | { mode: "create"; rule?: null }
  | { mode: "edit"; rule: RoutingRule }
  | null;

export function useRoutingScreen() {
  const queryClient = useQueryClient();
  const [operationError, setOperationError] = useState<string | null>(null);
  const [routingDialog, setRoutingDialog] = useState<RoutingDialogState>(null);
  const [ruleDialog, setRuleDialog] = useState<RuleDialogState>(null);
  const [selectedRoutingId, setSelectedRoutingId] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const routingsQuery = useQuery({
    queryFn: listRoutings,
    queryKey: ["routings"],
  });
  const routings = useMemo(() => routingsQuery.data ?? [], [routingsQuery.data]);
  const selectedRouting = useMemo(
    () =>
      routings.find((routing) => routing.id === selectedRoutingId) ??
      routings.find((routing) => routing.isActive) ??
      routings[0] ??
      null,
    [routings, selectedRoutingId],
  );
  const selectedRule =
    selectedRouting?.rules.find((rule) => rule.id === selectedRuleId) ??
    selectedRouting?.rules[0] ??
    null;
  async function runOperation(operation: () => Promise<unknown>) {
    setOperationError(null);
    try {
      await operation();
      await queryClient.invalidateQueries({ queryKey: ["routings"] });
      return true;
    } catch (error) {
      setOperationError(getErrorMessage(error));
      return false;
    }
  }

  async function handleSaveRouting(routing: RoutingFormPayload) {
    const saved = await runOperation(async () => {
      const saved = await saveRouting(routing);
      setSelectedRoutingId(saved.id);
    });
    if (saved) {
      setRoutingDialog(null);
    }
  }

  async function handleSaveRule(rule: RoutingRulePayload) {
    if (!selectedRouting) {
      return;
    }
    const saved = await runOperation(async () => {
      const saved = await saveRoutingRule(selectedRouting.id, rule);
      setSelectedRoutingId(saved.id);
      setSelectedRuleId(rule.id ?? saved.rules.at(-1)?.id ?? null);
    });
    if (saved) {
      setRuleDialog(null);
    }
  }

  function selectRouting(routingId: string) {
    setSelectedRoutingId(routingId);
    setSelectedRuleId(null);
  }

  function activateSelectedRouting() {
    if (selectedRouting) {
      void runOperation(() => setActiveRouting(selectedRouting.id));
    }
  }

  function deleteSelectedRouting() {
    if (selectedRouting) {
      void runOperation(async () => {
        await deleteRoutings([selectedRouting.id]);
        setSelectedRoutingId(null);
        setSelectedRuleId(null);
      });
    }
  }

  function moveSelectedRule(action: MoveAction) {
    if (selectedRouting && selectedRule) {
      void runOperation(() => moveRoutingRule(selectedRouting.id, selectedRule.id, action, null));
    }
  }

  function deleteSelectedRule() {
    if (selectedRouting && selectedRule) {
      void runOperation(() => deleteRoutingRules(selectedRouting.id, [selectedRule.id]));
    }
  }

  return {
    activateSelectedRouting,
    deleteSelectedRouting,
    deleteSelectedRule,
    handleSaveRouting,
    handleSaveRule,
    moveSelectedRule,
    operationError,
    routings,
    routingDialog,
    ruleDialog,
    selectRouting,
    selectedRouting,
    selectedRule,
    setRoutingDialog,
    setRuleDialog,
    setSelectedRuleId,
  };
}

export type RoutingScreenController = ReturnType<typeof useRoutingScreen>;
