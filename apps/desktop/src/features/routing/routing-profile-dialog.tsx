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
import type { RoutingItem_Serialize } from "@/ipc/bindings";

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
  routing: RoutingItem_Serialize | null;
}) {
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
          <DialogDescription className="sr-only">Routing profile editor</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          id="routing-profile-form"
          onSubmit={(event) => void submitForm(event)}
        >
          <TextField
            error={fieldErrors.Remarks}
            label="Remarks"
            onChange={(value) => setForm((current) => ({ ...current, Remarks: value }))}
            value={form.Remarks ?? ""}
          />
          <div className="grid gap-3">
            <SelectField
              error={fieldErrors.DomainStrategy4Singbox}
              label="sing-box domain strategy"
              onChange={(value) => setForm((current) => ({ ...current, DomainStrategy4Singbox: value }))}
              options={SINGBOX_DOMAIN_STRATEGIES.map((strategy) => ({
                label: strategy || "default",
                value: strategy,
              }))}
              value={form.DomainStrategy4Singbox ?? ""}
            />
          </div>
          <TextField
            error={fieldErrors.CustomRulesetPath4Singbox}
            label="Ruleset path for sing-box"
            onChange={(value) => setForm((current) => ({ ...current, CustomRulesetPath4Singbox: value }))}
            value={form.CustomRulesetPath4Singbox ?? ""}
          />
          <TextField
            error={fieldErrors.Url}
            label="Source URL"
            onChange={(value) => setForm((current) => ({ ...current, Url: value }))}
            value={form.Url ?? ""}
          />
          <CheckboxField
            checked={form.Enabled ?? true}
            label="Enabled"
            onCheckedChange={(checked) => setForm((current) => ({ ...current, Enabled: checked }))}
          />
        </form>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button form="routing-profile-form" type="submit">
            <Save className="size-4" aria-hidden="true" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
