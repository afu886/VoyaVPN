import { ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@voya/ui/components/card";
import type { DnsSettings } from "@/ipc/bindings";
import { useI18n } from "@voya/i18n/use-i18n";

import { CheckboxField, SelectField, TextAreaField, TextField } from "./dns-form-fields";
import type { DnsFieldErrors } from "./dns-form-schema";

export function SimpleDnsForm({
  errors,
  settings,
  updateSimple,
}: {
  errors: DnsFieldErrors;
  settings: DnsSettings;
  updateSimple: (patch: Partial<DnsSettings>) => void;
}) {
  const { t } = useI18n();

  return (
    <Card className="gap-3 rounded-xl bg-surface-raised p-3 shadow-raised">
      <CardHeader className="p-0">
        <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          {t("panes.dns.simpleTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-0">
        <div className="grid gap-2">
          <CheckboxField
            checked={Boolean(settings.useSystemHosts)}
            label="System hosts"
            onChange={(value) => updateSimple({ useSystemHosts: value })}
          />
          <CheckboxField
            checked={Boolean(settings.addCommonHosts)}
            label="Common hosts"
            onChange={(value) => updateSimple({ addCommonHosts: value })}
          />
          <CheckboxField
            checked={Boolean(settings.blockBindingQuery)}
            label="Block HTTPS/SVCB"
            onChange={(value) => updateSimple({ blockBindingQuery: value })}
          />
          <CheckboxField
            checked={Boolean(settings.serveStale)}
            label="Serve stale"
            onChange={(value) => updateSimple({ serveStale: value })}
          />
          <CheckboxField
            checked={Boolean(settings.parallelQuery)}
            label="Parallel query"
            onChange={(value) => updateSimple({ parallelQuery: value })}
          />
          <CheckboxField
            checked={Boolean(settings.fakeIp)}
            label="FakeIP"
            onChange={(value) => updateSimple({ fakeIp: value })}
          />
          <CheckboxField
            checked={Boolean(settings.globalFakeIp)}
            disabled={!settings.fakeIp}
            label="Global FakeIP"
            onChange={(value) => updateSimple({ globalFakeIp: value })}
          />
        </div>

        <TextField
          label="Direct DNS"
          onChange={(value) => updateSimple({ direct: value })}
          value={settings.direct ?? ""}
        />
        <TextField
          label="Remote DNS"
          onChange={(value) => updateSimple({ remote: value })}
          value={settings.remote ?? ""}
        />
        <TextField
          label="Bootstrap DNS"
          onChange={(value) => updateSimple({ bootstrap: value })}
          value={settings.bootstrap ?? ""}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <SelectField
            label="Direct strategy"
            onChange={(value) => updateSimple({ directStrategy: value || null })}
            value={settings.directStrategy ?? ""}
          />
          <SelectField
            label="Proxy strategy"
            onChange={(value) => updateSimple({ proxyStrategy: value || null })}
            value={settings.proxyStrategy ?? ""}
          />
        </div>

        <TextAreaField
          error={errors.hosts}
          label="Hosts"
          onChange={(value) => updateSimple({ hosts: value })}
          value={settings.hosts ?? ""}
        />
        <TextAreaField
          error={errors.directExpectedIps}
          label="Expected IPs"
          onChange={(value) => updateSimple({ directExpectedIps: value })}
          value={settings.directExpectedIps ?? ""}
        />
      </CardContent>
    </Card>
  );
}
