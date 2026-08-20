import { useState } from "react";
import type * as React from "react";
import { Route, Save } from "lucide-react";

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
    const parsed = routingProfileSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodIssuesToErrorMap(parsed.error));
      return;
    }
    setFieldErrors({});
    await onSubmit(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,42rem)]" closeLabel={t("actions.close")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="size-4" aria-hidden="true" />
            {t(mode === "edit" ? "panes.routing.editProfile" : "panes.routing.createProfile")}
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
            label={t("panes.routing.remarks")}
            onChange={(value) => setForm((current) => ({ ...current, remarks: value }))}
            value={form.remarks}
          />
          <div className="grid gap-3">
            <SelectField
              error={fieldErrors.singboxDomainStrategy}
              label={t("panes.routing.domainStrategy")}
              onChange={(value) => setForm((current) => ({ ...current, singboxDomainStrategy: value }))}
              options={SINGBOX_DOMAIN_STRATEGIES.map((strategy) => ({
                label: strategy || t("panes.routing.defaultValue"),
                value: strategy,
              }))}
              value={form.singboxDomainStrategy}
            />
          </div>
          <TextField
            error={fieldErrors.singboxRulesetPath}
            label={t("panes.routing.rulesetPath")}
            onChange={(value) => setForm((current) => ({ ...current, singboxRulesetPath: value }))}
            value={form.singboxRulesetPath}
          />
          <TextField
            error={fieldErrors.sourceUrl}
            label={t("panes.routing.sourceUrl")}
            onChange={(value) => setForm((current) => ({ ...current, sourceUrl: value }))}
            value={form.sourceUrl}
          />
          <CheckboxField
            checked={form.enabled}
            label={t("panes.routing.enabled")}
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
