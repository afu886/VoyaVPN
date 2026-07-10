import { ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@voya/ui/components/card";
import type { DnsSettings_Serialize } from "@/ipc/bindings";

import { CheckboxField, SelectField, TextAreaField, TextField } from "./dns-form-fields";
import type { DnsFieldErrors } from "./dns-form-schema";

export function SimpleDnsForm({
  errors,
  settings,
  updateSimple,
}: {
  errors: DnsFieldErrors;
  settings: DnsSettings_Serialize;
  updateSimple: (patch: Partial<DnsSettings_Serialize["simpleDnsItem"]>) => void;
}) {
  const simple = settings.simpleDnsItem;

  return (
    <Card className="gap-3 rounded-xl bg-surface-raised p-3 shadow-raised">
      <CardHeader className="p-0">
        <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          Simple DNS
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-0">
        <div className="grid gap-2">
          <CheckboxField
            checked={Boolean(simple.UseSystemHosts)}
            label="System hosts"
            onChange={(value) => updateSimple({ UseSystemHosts: value })}
          />
          <CheckboxField
            checked={Boolean(simple.AddCommonHosts)}
            label="Common hosts"
            onChange={(value) => updateSimple({ AddCommonHosts: value })}
          />
          <CheckboxField
            checked={Boolean(simple.BlockBindingQuery)}
            label="Block HTTPS/SVCB"
            onChange={(value) => updateSimple({ BlockBindingQuery: value })}
          />
          <CheckboxField
            checked={Boolean(simple.ServeStale)}
            label="Serve stale"
            onChange={(value) => updateSimple({ ServeStale: value })}
          />
          <CheckboxField
            checked={Boolean(simple.ParallelQuery)}
            label="Parallel query"
            onChange={(value) => updateSimple({ ParallelQuery: value })}
          />
          <CheckboxField
            checked={Boolean(simple.FakeIP)}
            label="FakeIP"
            onChange={(value) => updateSimple({ FakeIP: value })}
          />
          <CheckboxField
            checked={Boolean(simple.GlobalFakeIp)}
            disabled={!simple.FakeIP}
            label="Global FakeIP"
            onChange={(value) => updateSimple({ GlobalFakeIp: value })}
          />
        </div>

        <TextField
          label="Direct DNS"
          onChange={(value) => updateSimple({ DirectDNS: value })}
          value={simple.DirectDNS ?? ""}
        />
        <TextField
          label="Remote DNS"
          onChange={(value) => updateSimple({ RemoteDNS: value })}
          value={simple.RemoteDNS ?? ""}
        />
        <TextField
          label="Bootstrap DNS"
          onChange={(value) => updateSimple({ BootstrapDNS: value })}
          value={simple.BootstrapDNS ?? ""}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <SelectField
            label="Direct strategy"
            onChange={(value) => updateSimple({ Strategy4Freedom: value || null })}
            value={simple.Strategy4Freedom ?? ""}
          />
          <SelectField
            label="Proxy strategy"
            onChange={(value) => updateSimple({ Strategy4Proxy: value || null })}
            value={simple.Strategy4Proxy ?? ""}
          />
        </div>

        <TextAreaField
          error={errors["simpleDnsItem.hosts"]}
          label="Hosts"
          onChange={(value) => updateSimple({ Hosts: value })}
          value={simple.Hosts ?? ""}
        />
        <TextAreaField
          error={errors["simpleDnsItem.directExpectedIPs"]}
          label="Expected IPs"
          onChange={(value) => updateSimple({ DirectExpectedIPs: value })}
          value={simple.DirectExpectedIPs ?? ""}
        />
      </CardContent>
    </Card>
  );
}
