import { Pencil, Play, Plus, Route, Trash2 } from "lucide-react";

import { PageHeader, PageHeaderHeading } from "@/components/app-shell/page-section";
import { Badge } from "@voya/ui/components/badge";
import { Button } from "@voya/ui/components/button";

import type { RoutingScreenController } from "./use-routing-screen";

export function RoutingToolbar({ controller }: { controller: RoutingScreenController }) {
  const {
    activateSelectedRouting,
    deleteSelectedRouting,
    routings,
    selectedRouting,
    setRoutingDialog,
  } = controller;

  return (
    <PageHeader>
      <PageHeaderHeading icon={Route} title="Routing">
        <Badge variant="outline">{routings.length.toLocaleString()} profiles</Badge>
      </PageHeaderHeading>

      <Button className="ms-auto" onClick={() => setRoutingDialog({ mode: "create" })} size="sm" type="button">
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
