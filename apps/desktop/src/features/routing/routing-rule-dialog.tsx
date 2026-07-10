import { useState } from "react";
import type * as React from "react";
import { Route, Save } from "lucide-react";
import { z } from "zod";

import { Button } from "@voya/ui/components/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollableDialogContent,
} from "@voya/ui/components/dialog";
import type { RulesItem_Serialize } from "@/ipc/bindings";

import { RULE_TYPES } from "./routing-constants";
import { CheckboxField, SelectField, TextAreaField, TextField } from "./routing-form-fields";
import {
  routingRuleSchema,
  zodIssuesToErrorMap,
  type ErrorMap,
  type RoutingRulePayload,
} from "./routing-form-schema";
import { formToRule, ruleToForm } from "./routing-form-values";

export function RoutingRuleDialog({
  mode,
  onOpenChange,
  onSubmit,
  open,
  rule,
}: {
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onSubmit: (rule: RoutingRulePayload) => Promise<void>;
  open: boolean;
  rule: RulesItem_Serialize | null;
}) {
  const [form, setForm] = useState(() => ruleToForm(rule));
  const [fieldErrors, setFieldErrors] = useState<ErrorMap>({});

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const payload = routingRuleSchema.parse(formToRule(form));
      setFieldErrors({});
      await onSubmit(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        setFieldErrors(zodIssuesToErrorMap(error));
        return;
      }
      throw error;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent width="56rem">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="size-4" aria-hidden="true" />
            {mode === "edit" ? "Edit routing rule" : "Create routing rule"}
          </DialogTitle>
          <DialogDescription className="sr-only">Routing rule editor</DialogDescription>
        </DialogHeader>

        <form
          className="grid min-h-0 gap-4 overflow-y-auto pe-1"
          id="routing-rule-form"
          onSubmit={(event) => void submitForm(event)}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem]">
            <TextField
              error={fieldErrors.Remarks}
              label="Remarks"
              onChange={(value) => setForm((current) => ({ ...current, Remarks: value }))}
              value={form.Remarks}
            />
            <SelectField
              error={fieldErrors.RuleType}
              label="Rule type"
              onChange={(value) => setForm((current) => ({ ...current, RuleType: Number(value) }))}
              options={[
                { label: "All", value: String(RULE_TYPES.All) },
                { label: "Routing", value: String(RULE_TYPES.Routing) },
                { label: "DNS", value: String(RULE_TYPES.Dns) },
              ]}
              value={String(form.RuleType)}
            />
            <TextField
              error={fieldErrors.OutboundTag}
              label="Outbound"
              onChange={(value) => setForm((current) => ({ ...current, OutboundTag: value }))}
              value={form.OutboundTag}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              error={fieldErrors.Port}
              label="Port"
              onChange={(value) => setForm((current) => ({ ...current, Port: value }))}
              value={form.Port}
            />
            <TextField
              error={fieldErrors.Network}
              label="Network"
              onChange={(value) => setForm((current) => ({ ...current, Network: value }))}
              value={form.Network}
            />
            <TextField
              error={fieldErrors.Type}
              label="Type"
              onChange={(value) => setForm((current) => ({ ...current, Type: value }))}
              value={form.Type}
            />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <TextAreaField
              error={fieldErrors.Domain}
              label="Domain"
              onChange={(value) => setForm((current) => ({ ...current, Domain: value }))}
              value={form.Domain}
            />
            <TextAreaField
              error={fieldErrors.Ip}
              label="IP"
              onChange={(value) => setForm((current) => ({ ...current, Ip: value }))}
              value={form.Ip}
            />
            <TextAreaField
              error={fieldErrors.Protocol}
              label="Protocol"
              onChange={(value) => setForm((current) => ({ ...current, Protocol: value }))}
              value={form.Protocol}
            />
            <TextAreaField
              error={fieldErrors.Process}
              label="Process"
              onChange={(value) => setForm((current) => ({ ...current, Process: value }))}
              value={form.Process}
            />
            <TextAreaField
              error={fieldErrors.InboundTag}
              label="Inbound tags"
              onChange={(value) => setForm((current) => ({ ...current, InboundTag: value }))}
              value={form.InboundTag}
            />
          </div>
          <CheckboxField
            checked={form.Enabled}
            label="Enabled"
            onCheckedChange={(checked) => setForm((current) => ({ ...current, Enabled: checked }))}
          />
        </form>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button form="routing-rule-form" type="submit">
            <Save className="size-4" aria-hidden="true" />
            Save
          </Button>
        </DialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  );
}
