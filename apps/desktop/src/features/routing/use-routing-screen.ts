import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteRoutingRules,
  deleteRoutings,
  importRoutingTemplates,
  listRoutings,
  loadAppConfig,
  moveRoutingRule,
  saveAppConfig,
  saveRouting,
  saveRoutingRule,
  setActiveRouting,
} from "@/ipc";
import type {
  AppConfig_Serialize,
  MoveAction,
  RoutingItem_Serialize,
  RulesItem_Serialize,
} from "@/ipc/bindings";
import { getErrorMessage } from "@voya/utils/error";

import {
  firstZodMessage,
  routingTemplateUrlSchema,
  type RoutingFormPayload,
  type RoutingRulePayload,
} from "./routing-form-schema";

type RoutingDialogState =
  | { mode: "create"; routing?: null }
  | { mode: "edit"; routing: RoutingItem_Serialize }
  | null;

type RuleDialogState =
  | { mode: "create"; rule?: null }
  | { mode: "edit"; rule: RulesItem_Serialize }
  | null;

export function useRoutingScreen() {
  const queryClient = useQueryClient();
  const [operationError, setOperationError] = useState<string | null>(null);
  const [routingDialog, setRoutingDialog] = useState<RoutingDialogState>(null);
  const [ruleDialog, setRuleDialog] = useState<RuleDialogState>(null);
  const [selectedRoutingId, setSelectedRoutingId] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [templateUrlDraft, setTemplateUrlDraft] = useState<string | null>(null);
  const [templateUrlError, setTemplateUrlError] = useState<string | null>(null);
  const routingsQuery = useQuery({
    queryFn: listRoutings,
    queryKey: ["routings"],
  });
  const configQuery = useQuery({
    queryFn: loadAppConfig,
    queryKey: ["app-config"],
  });
  const routings = useMemo(() => routingsQuery.data ?? [], [routingsQuery.data]);
  const selectedRouting = useMemo(
    () =>
      routings.find((routing) => routing.Id === selectedRoutingId) ??
      routings.find((routing) => routing.IsActive) ??
      routings[0] ??
      null,
    [routings, selectedRoutingId],
  );
  const selectedRule =
    selectedRouting?.RuleSet.find((rule) => rule.Id === selectedRuleId) ??
    selectedRouting?.RuleSet[0] ??
    null;
  const templateUrl = templateUrlDraft ?? configQuery.data?.ConstItem.RouteRulesTemplateSourceUrl ?? "";

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

  async function saveTemplateUrl(config: AppConfig_Serialize | undefined, url: string) {
    const current = config ?? (await loadAppConfig());
    await saveAppConfig({
      ...current,
      ConstItem: {
        ...current.ConstItem,
        RouteRulesTemplateSourceUrl: url || null,
      },
    });
    setTemplateUrlDraft(url);
    await queryClient.invalidateQueries({ queryKey: ["app-config"] });
  }

  function handleTemplateUrlChange(url: string) {
    setTemplateUrlDraft(url);
    setTemplateUrlError(null);
  }

  async function handleImportTemplates() {
    const parsedTemplateUrl = routingTemplateUrlSchema.safeParse(templateUrl);
    if (!parsedTemplateUrl.success) {
      setTemplateUrlError(firstZodMessage(parsedTemplateUrl.error));
      setOperationError("Routing template URL validation failed");
      return;
    }

    setTemplateUrlError(null);
    await runOperation(async () => {
      await saveTemplateUrl(configQuery.data, parsedTemplateUrl.data);
      await importRoutingTemplates(true, null, false);
    });
  }

  async function handleSaveRouting(routing: RoutingFormPayload) {
    const saved = await runOperation(async () => {
      const saved = await saveRouting(routing);
      setSelectedRoutingId(saved.Id);
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
      const saved = await saveRoutingRule(selectedRouting.Id, rule);
      setSelectedRoutingId(saved.Id);
      setSelectedRuleId(rule.Id ?? saved.RuleSet.at(-1)?.Id ?? null);
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
      void runOperation(() => setActiveRouting(selectedRouting.Id));
    }
  }

  function deleteSelectedRouting() {
    if (selectedRouting) {
      void runOperation(async () => {
        await deleteRoutings([selectedRouting.Id]);
        setSelectedRoutingId(null);
        setSelectedRuleId(null);
      });
    }
  }

  function moveSelectedRule(action: MoveAction) {
    if (selectedRouting && selectedRule) {
      void runOperation(() => moveRoutingRule(selectedRouting.Id, selectedRule.Id, action, null));
    }
  }

  function deleteSelectedRule() {
    if (selectedRouting && selectedRule) {
      void runOperation(() => deleteRoutingRules(selectedRouting.Id, [selectedRule.Id]));
    }
  }

  return {
    activateSelectedRouting,
    deleteSelectedRouting,
    deleteSelectedRule,
    handleImportTemplates,
    handleSaveRouting,
    handleSaveRule,
    handleTemplateUrlChange,
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
    templateUrl,
    templateUrlError,
  };
}

export type RoutingScreenController = ReturnType<typeof useRoutingScreen>;
