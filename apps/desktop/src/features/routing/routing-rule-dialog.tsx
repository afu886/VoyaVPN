import { useState } from "react";
import type * as React from "react";
import { Route, Save } from "lucide-react";
import { z } from "zod";
import { useI18n } from "@voya/i18n/use-i18n";

import { Button } from "@voya/ui/components/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollableDialogContent,
} from "@voya/ui/components/dialog";
import type { RoutingRule, RoutingRuleScope } from "@/ipc/bindings";

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
  rule: RoutingRule | null;
}) {
  const { t } = useI18n();
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
          <DialogDescription className="sr-only">{t("panes.routing.ruleEditor")}</DialogDescription>
        </DialogHeader>

        <form
          className="grid min-h-0 gap-4 overflow-y-auto pe-1"
          id="routing-rule-form"
          onSubmit={(event) => void submitForm(event)}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem]">
            <TextField
              error={fieldErrors.remarks}
              label="remarks"
              onChange={(value) => setForm((current) => ({ ...current, remarks: value }))}
              value={form.remarks}
            />
            <SelectField
              error={fieldErrors.scope}
              label="Rule type"
              onChange={(value) => setForm((current) => ({ ...current, scope: value as RoutingRuleScope }))}
              options={[
                { label: "All", value: String(RULE_TYPES.All) },
                { label: "Routing", value: String(RULE_TYPES.Routing) },
                { label: "DNS", value: String(RULE_TYPES.Dns) },
              ]}
              value={String(form.scope)}
            />
            <TextField
              error={fieldErrors.outbound}
              label="Outbound"
              onChange={(value) => setForm((current) => ({ ...current, outbound: value }))}
              value={form.outbound}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              error={fieldErrors.port}
              label="port"
              onChange={(value) => setForm((current) => ({ ...current, port: value }))}
              value={form.port}
            />
            <TextField
              error={fieldErrors.network}
              label="network"
              onChange={(value) => setForm((current) => ({ ...current, network: value }))}
              value={form.network}
            />
            <TextField
              error={fieldErrors.kind}
              label="type"
              onChange={(value) => setForm((current) => ({ ...current, kind: value }))}
              value={form.kind}
            />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <TextAreaField
              error={fieldErrors.domain}
              label="domain"
              onChange={(value) => setForm((current) => ({ ...current, domain: value }))}
              value={form.domain}
            />
            <TextAreaField
              error={fieldErrors.ip}
              label="IP"
              onChange={(value) => setForm((current) => ({ ...current, ip: value }))}
              value={form.ip}
            />
            <TextAreaField
              error={fieldErrors.protocol}
              label="protocol"
              onChange={(value) => setForm((current) => ({ ...current, protocol: value }))}
              value={form.protocol}
            />
            <TextAreaField
              error={fieldErrors.process}
              label="process"
              onChange={(value) => setForm((current) => ({ ...current, process: value }))}
              value={form.process}
            />
            <TextAreaField
              error={fieldErrors.inboundTags}
              label="Inbound tags"
              onChange={(value) => setForm((current) => ({ ...current, inboundTags: value }))}
              value={form.inboundTags}
            />
          </div>
          <CheckboxField
            checked={form.enabled}
            label="enabled"
            onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))}
          />
        </form>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button form="routing-rule-form" type="submit">
            <Save className="size-4" aria-hidden="true" />
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  );
}
