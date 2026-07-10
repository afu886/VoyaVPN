import { Database, RefreshCw, Save, ServerCog, TriangleAlert } from "lucide-react";

import { PageHeader, PageHeaderHeading, PageSection } from "@/components/app-shell/page-section";
import { Alert, AlertDescription } from "@voya/ui/components/alert";
import { Badge } from "@voya/ui/components/badge";
import { Button } from "@voya/ui/components/button";
import { ScrollArea } from "@voya/ui/components/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voya/ui/components/tabs";
import { cn } from "@voya/ui/lib/utils";

import { AdvancedDnsEditor } from "./advanced-dns-editor";
import { SimpleDnsForm } from "./simple-dns-form";
import { useDnsSettings } from "./use-dns-settings";

export function DnsScreen() {
  const {
    dnsQuery,
    fieldErrors,
    form,
    handleReload,
    handleSave,
    isDirty,
    issueCount,
    operationError,
    updateCore,
    updateSimple,
  } = useDnsSettings();

  return (
    <PageSection aria-label="DNS">
      <PageHeader>
        <PageHeaderHeading icon={Database} title="DNS">
          <Badge variant="outline">
            {form?.simpleDnsItem.FakeIP ? "FakeIP" : "Standard"}
          </Badge>
          {issueCount ? (
            <Badge variant="destructive">
              <TriangleAlert className="size-3.5" aria-hidden="true" />
              {issueCount} errors
            </Badge>
          ) : null}
        </PageHeaderHeading>

        <div className="ms-auto flex items-center gap-2">
          <Button disabled={dnsQuery.isFetching} onClick={() => void handleReload()} size="sm" type="button" variant="outline">
            <RefreshCw className={cn("size-4", dnsQuery.isFetching ? "animate-spin" : "")} aria-hidden="true" />
            Reload
          </Button>
          <Button disabled={!form || !isDirty} onClick={() => void handleSave()} size="sm" type="button">
            <Save className="size-4" aria-hidden="true" />
            Save
          </Button>
        </div>
      </PageHeader>

      {operationError ? (
        <div className="border-b px-4 py-2">
          <Alert className="py-2" variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{operationError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[22rem_1fr]">
        <aside className="min-h-0 border-b bg-surface-sunken lg:border-b-0 lg:border-e">
          <ScrollArea className="h-[32rem] lg:h-full">
            <div className="p-4">
              {form ? (
                <SimpleDnsForm errors={fieldErrors} settings={form} updateSimple={updateSimple} />
              ) : (
                <div className="text-sm text-muted-foreground">Loading DNS settings</div>
              )}
            </div>
          </ScrollArea>
        </aside>

        <div className="min-h-0 overflow-hidden">
          {form ? (
            <Tabs className="flex h-full min-h-0 flex-col" defaultValue="singbox">
              <div className="shrink-0 border-b px-4 py-2">
                <TabsList>
                  <TabsTrigger value="singbox">
                    <ServerCog className="size-4" aria-hidden="true" />
                    sing-box
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent className="m-0 min-h-0 flex-1" value="singbox">
                <AdvancedDnsEditor
                  defaults={{
                    normal: form.defaults.singboxNormalDns,
                    tun: form.defaults.singboxTunDns,
                  }}
                  errors={fieldErrors}
                  fieldPrefix="singboxDnsItem"
                  item={form.singboxDnsItem}
                  onChange={(patch) => updateCore("singboxDnsItem", patch)}
                  title="sing-box raw DNS"
                />
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </div>
    </PageSection>
  );
}
