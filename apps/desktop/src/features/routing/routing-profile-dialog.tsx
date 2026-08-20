import { useState } from "react";
import type * as React from "react";
import { Route, Save } from "lucide-react";
import { z } from "zod";

import { Button } from "@voya/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@voya/ui/components/dialog";
import type { Routing_Serialize } from "@/ipc/bindings";
import { useI18n } from "@voya/i18n/use-i18n";

import { SINGBOX_DOMAIN_STRATEGIES } from "./routing-constants";
import { CheckboxField, SelectField, TextField } from "./routing-form-fields";
import {
  routingProfileSchema,
  zodIssuesToErrorMap,
  type ErrorMap,
  type RoutingFormPayload,
} from "./routing-form-schema";
import { routingToForm } from "./routing-form-values";

export function RoutingProfileDialog({
  mode,
  onOpenChange,
  onSubmit,
  open,
  routing,
}: {
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onSubmit: (routing: RoutingFormPayload) => Promise<void>;
  open: boolean;
  routing: Routing_Serialize | null;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => routingToForm(routing));
  const [fieldErrors, setFieldErrors] = useState<ErrorMap>({});

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const payload = routingProfileSchema.parse(form);
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
      <DialogContent className="w-[min(96vw,42rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="size-4" aria-hidden="true" />
            {mode === "edit" ? "Edit routing profile" : "Create routing profile"}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("panes.routing.editor")}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          id="routing-profile-form"
          onSubmit={(event) => void submitForm(event)}
        >
          <TextField
            error={fieldErrors.remarks}
            label="remarks"
            onChange={(value) => setForm((current) => ({ ...current, remarks: value }))}
            value={form.remarks ?? ""}
          />
          <div className="grid gap-3">
            <SelectField
              error={fieldErrors.singboxDomainStrategy}
              label="sing-box domain strategy"
              onChange={(value) => setForm((current) => ({ ...current, singboxDomainStrategy: value }))}
              options={SINGBOX_DOMAIN_STRATEGIES.map((strategy) => ({
                label: strategy || "default",
                value: strategy,
              }))}
              value={form.singboxDomainStrategy ?? ""}
            />
          </div>
          <TextField
            error={fieldErrors.singboxRulesetPath}
            label="Ruleset path for sing-box"
            onChange={(value) => setForm((current) => ({ ...current, singboxRulesetPath: value }))}
            value={form.singboxRulesetPath ?? ""}
          />
          <TextField
            error={fieldErrors.sourceUrl}
            label="Source URL"
            onChange={(value) => setForm((current) => ({ ...current, sourceUrl: value }))}
            value={form.sourceUrl ?? ""}
          />
          <CheckboxField
            checked={form.enabled ?? true}
            label="enabled"
            onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))}
          />
        </form>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button form="routing-profile-form" type="submit">
            <Save className="size-4" aria-hidden="true" />
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
