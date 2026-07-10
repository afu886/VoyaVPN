import { FilePlus2, Globe2, Pencil, Play, Plus, Route, Trash2 } from "lucide-react";

import { PageHeader, PageHeaderHeading } from "@/components/app-shell/page-section";
import { Badge } from "@voya/ui/components/badge";
import { Button } from "@voya/ui/components/button";
import { Input } from "@voya/ui/components/input";
import { Label } from "@voya/ui/components/label";

import type { RoutingScreenController } from "./use-routing-screen";

export function RoutingToolbar({ controller }: { controller: RoutingScreenController }) {
  const {
    activateSelectedRouting,
    deleteSelectedRouting,
    handleImportTemplates,
    handleTemplateUrlChange,
    routings,
    selectedRouting,
    setRoutingDialog,
    templateUrl,
    templateUrlError,
  } = controller;

  return (
    <PageHeader>
      <PageHeaderHeading icon={Route} title="Routing">
        <Badge variant="outline">{routings.length.toLocaleString()} profiles</Badge>
      </PageHeaderHeading>

      <div className="ms-auto min-w-[18rem] max-w-xl flex-1 md:flex-none">
        <Label className="sr-only" htmlFor="routing-template-url">
          Template URL
        </Label>
        <div className="relative">
          <Globe2
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-describedby={templateUrlError ? "routing-template-url-error" : undefined}
            aria-invalid={templateUrlError ? true : undefined}
            className="ps-9"
            id="routing-template-url"
            onChange={(event) => handleTemplateUrlChange(event.target.value)}
            placeholder="RouteRulesTemplateSourceUrl"
            value={templateUrl}
          />
        </div>
        {templateUrlError ? (
          <span className="text-xs text-destructive" id="routing-template-url-error">
            {templateUrlError}
          </span>
        ) : null}
      </div>
      <Button onClick={() => void handleImportTemplates()} size="sm" type="button" variant="outline">
        <FilePlus2 className="size-4" aria-hidden="true" />
        Import templates
      </Button>
      <Button onClick={() => setRoutingDialog({ mode: "create" })} size="sm" type="button">
        <Plus className="size-4" aria-hidden="true" />
        Profile
      </Button>
      <Button
        disabled={!selectedRouting}
        onClick={() => selectedRouting && setRoutingDialog({ mode: "edit", routing: selectedRouting })}
        size="sm"
        type="button"
        variant="outline"
      >
        <Pencil className="size-4" aria-hidden="true" />
        Edit
      </Button>
      <Button
        disabled={!selectedRouting || selectedRouting.IsActive}
        onClick={activateSelectedRouting}
        size="sm"
        type="button"
        variant="outline"
      >
        <Play className="size-4" aria-hidden="true" />
        Activate
      </Button>
      <Button
        disabled={!selectedRouting}
        onClick={deleteSelectedRouting}
        size="sm"
        type="button"
        variant="outline"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Delete
      </Button>
    </PageHeader>
  );
}
