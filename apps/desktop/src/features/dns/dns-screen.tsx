import { Database, RefreshCw, Save, TriangleAlert } from "lucide-react";

import { PageHeader, PageHeaderHeading, PageSection } from "@/components/app-shell/page-section";
import { Alert, AlertDescription } from "@voya/ui/components/alert";
import { Badge } from "@voya/ui/components/badge";
import { Button } from "@voya/ui/components/button";
import { ScrollArea } from "@voya/ui/components/scroll-area";
import { cn } from "@voya/ui/lib/utils";
import { useI18n } from "@voya/i18n/use-i18n";

import { SimpleDnsForm } from "./simple-dns-form";
import { useDnsSettings } from "./use-dns-settings";

export function DnsScreen() {
  const { t } = useI18n();
  const {
    dnsQuery,
    fieldErrors,
    form,
    handleReload,
    handleSave,
    isDirty,
    issueCount,
    operationError,
    updateSimple,
  } = useDnsSettings();

  return (
    <PageSection aria-label={t("panes.dns.title")}>
      <PageHeader>
        <PageHeaderHeading icon={Database} title={t("panes.dns.title")}>
          <Badge variant="outline">{form?.fakeIp ? t("panes.dns.fakeIp") : t("panes.dns.standard")}</Badge>
          {issueCount ? (
            <Badge variant="destructive">
              <TriangleAlert className="size-3.5" aria-hidden="true" />
              {t("panes.dns.errorCount", { count: issueCount })}
            </Badge>
          ) : null}
        </PageHeaderHeading>
        <div className="ms-auto flex items-center gap-2">
          <Button disabled={dnsQuery.isFetching} onClick={() => void handleReload()} size="sm" type="button" variant="outline">
            <RefreshCw className={cn("size-4", dnsQuery.isFetching && "animate-spin")} aria-hidden="true" />
            {t("actions.reload")}
          </Button>
          <Button disabled={!form || !isDirty} onClick={() => void handleSave()} size="sm" type="button">
            <Save className="size-4" aria-hidden="true" />
            {t("actions.save")}
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

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-3xl p-6">
          {form ? (
            <SimpleDnsForm errors={fieldErrors} settings={form} updateSimple={updateSimple} />
          ) : (
            <div className="text-sm text-muted-foreground">{t("panes.dns.loading")}</div>
          )}
        </div>
      </ScrollArea>
    </PageSection>
  );
}
