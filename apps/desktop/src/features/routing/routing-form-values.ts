import type { RoutingItem_Serialize, RulesItem_Serialize } from "@/ipc/bindings";

import { RULE_TYPES } from "./routing-constants";

export type RuleFormState = {
  Id?: string;
  Domain: string;
  Enabled: boolean;
  InboundTag: string;
  Ip: string;
  Network: string;
  OutboundTag: string;
  Port: string;
  Process: string;
  Protocol: string;
  Remarks: string;
  RuleType: number;
  Type: string;
};

export type RoutingFormState = {
  Id?: string;
  CustomIcon?: string;
  CustomRulesetPath4Singbox: string;
  DomainStrategy: string;
  DomainStrategy4Singbox: string;
  Enabled: boolean;
  IsActive?: boolean;
  Locked?: boolean;
  Remarks: string;
  RuleNum?: number;
  RuleSet: RulesItem_Serialize[];
  Sort?: number;
  Url: string;
};

type RulePayload = {
  Id?: string;
  Domain: string[] | null;
  Enabled: boolean;
  InboundTag: string[] | null;
  Ip: string[] | null;
  Network: string | null;
  OutboundTag: string | null;
  Port: string | null;
  Process: string[] | null;
  Protocol: string[] | null;
  Remarks: string | null;
  RuleType: number;
  Type: string | null;
};

export function routingToForm(routing: RoutingItem_Serialize | null): RoutingFormState {
  return routing
    ? {
        CustomIcon: routing.CustomIcon,
        CustomRulesetPath4Singbox: routing.CustomRulesetPath4Singbox,
        DomainStrategy: routing.DomainStrategy || "AsIs",
        DomainStrategy4Singbox: routing.DomainStrategy4Singbox,
        Enabled: routing.Enabled,
        Id: routing.Id,
        IsActive: routing.IsActive,
        Locked: routing.Locked,
        Remarks: routing.Remarks,
        RuleNum: routing.RuleNum,
        RuleSet: routing.RuleSet,
        Sort: routing.Sort,
        Url: routing.Url,
      }
    : createDefaultRouting();
}

export function ruleToForm(rule: RulesItem_Serialize | null): RuleFormState {
  return {
    Id: rule?.Id,
    Domain: listToText(rule?.Domain),
    Enabled: rule?.Enabled ?? true,
    InboundTag: listToText(rule?.InboundTag),
    Ip: listToText(rule?.Ip),
    Network: rule?.Network ?? "",
    OutboundTag: rule?.OutboundTag ?? "proxy",
    Port: rule?.Port ?? "",
    Process: listToText(rule?.Process),
    Protocol: listToText(rule?.Protocol),
    Remarks: rule?.Remarks ?? "",
    RuleType: rule?.RuleType ?? RULE_TYPES.Routing,
    Type: rule?.Type ?? "",
  };
}

export function formToRule(form: RuleFormState): RulePayload {
  return {
    Id: form.Id,
    Domain: textToList(form.Domain),
    Enabled: form.Enabled,
    InboundTag: textToList(form.InboundTag),
    Ip: textToList(form.Ip),
    Network: emptyToNull(form.Network),
    OutboundTag: emptyToNull(form.OutboundTag),
    Port: emptyToNull(form.Port),
    Process: textToList(form.Process),
    Protocol: textToList(form.Protocol),
    Remarks: emptyToNull(form.Remarks),
    RuleType: form.RuleType,
    Type: emptyToNull(form.Type),
  };
}

function createDefaultRouting(): RoutingFormState {
  return {
    CustomRulesetPath4Singbox: "",
    DomainStrategy: "AsIs",
    DomainStrategy4Singbox: "",
    Enabled: true,
    Remarks: "",
    RuleSet: [],
    Url: "",
  };
}

function listToText(values: string[] | null | undefined) {
  return values?.join("\n") ?? "";
}

function textToList(value: string) {
  const list = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return list.length > 0 ? list : null;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}
