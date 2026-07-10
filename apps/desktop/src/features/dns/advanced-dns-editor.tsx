import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { Braces, RotateCcw } from "lucide-react";

import { Button } from "@voya/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@voya/ui/components/card";
import { ScrollArea } from "@voya/ui/components/scroll-area";
import type { DnsItem_Serialize } from "@/ipc/bindings";
import { cn } from "@voya/ui/lib/utils";

import { CheckboxField, TextField } from "./dns-form-fields";
import type { DnsFieldErrors } from "./dns-form-schema";

const editorExtensions = [json()];

export function AdvancedDnsEditor({
  defaults,
  errors,
  fieldPrefix,
  item,
  onChange,
  showSystemHosts = false,
  title,
}: {
  defaults: { normal: string; tun: string };
  errors: DnsFieldErrors;
  fieldPrefix: string;
  item: DnsItem_Serialize;
  onChange: (patch: Partial<DnsItem_Serialize>) => void;
  showSystemHosts?: boolean;
  title: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <CheckboxField
          checked={item.Enabled}
          className="ms-auto"
          label="Enabled"
          onChange={(value) => onChange({ Enabled: value })}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 bg-surface-sunken">
        <div className="grid gap-4 p-4 xl:grid-cols-2">
          <JsonEditorField
            error={errors[`${fieldPrefix}.normalDNS`]}
            label="Normal DNS"
            onChange={(value) => onChange({ NormalDNS: value })}
            onReset={() => onChange({ NormalDNS: defaults.normal })}
            value={item.NormalDNS ?? ""}
          />
          <JsonEditorField
            error={errors[`${fieldPrefix}.tunDNS`]}
            label="TUN DNS"
            onChange={(value) => onChange({ TunDNS: value })}
            onReset={() => onChange({ TunDNS: defaults.tun })}
            value={item.TunDNS ?? ""}
          />
          <TextField
            label="Direct strategy"
            onChange={(value) => onChange({ DomainStrategy4Freedom: value || null })}
            value={item.DomainStrategy4Freedom ?? ""}
          />
          <TextField
            label="Domain DNS address"
            onChange={(value) => onChange({ DomainDNSAddress: value || null })}
            value={item.DomainDNSAddress ?? ""}
          />
          {showSystemHosts ? (
            <CheckboxField
              checked={item.UseSystemHosts}
              label="System hosts"
              onChange={(value) => onChange({ UseSystemHosts: value })}
            />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function JsonEditorField({
  error,
  label,
  onChange,
  onReset,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  onReset: () => void;
  value: string;
}) {
  return (
    <Card className="min-h-[22rem] gap-3 rounded-xl bg-surface-raised p-3 shadow-raised">
      <CardHeader className="p-0">
        <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Braces className="size-4 text-muted-foreground" aria-hidden="true" />
          {label}
          <Button className="ms-auto h-7 px-2 normal-case" onClick={onReset} type="button" variant="outline">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Default
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 p-0">
        <div
          aria-invalid={error ? true : undefined}
          className={cn(
            "overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow] focus-within:border-accent-blue focus-within:ring-[3px] focus-within:ring-accent-blue/40 dark:bg-input/30",
            error ? "border-destructive ring-destructive/20 dark:ring-destructive/40" : "",
          )}
        >
          <CodeMirror
            basicSetup={{
              foldGutter: true,
              highlightActiveLine: true,
              lineNumbers: true,
            }}
            extensions={editorExtensions}
            height="20rem"
            onChange={onChange}
            value={value}
          />
        </div>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </CardContent>
    </Card>
  );
}
