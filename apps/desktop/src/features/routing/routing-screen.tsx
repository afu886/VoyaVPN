import { TriangleAlert } from "lucide-react";

import { PageSection } from "@/components/app-shell/page-section";
import { Alert, AlertDescription } from "@voya/ui/components/alert";

import { RoutingDialogs } from "./routing-dialogs";
import { RoutingProfileList } from "./routing-profile-list";
import { RoutingRulesPanel } from "./routing-rules-panel";
import { RoutingToolbar } from "./routing-toolbar";
import { useRoutingScreen } from "./use-routing-screen";

export function RoutingScreen() {
  const controller = useRoutingScreen();

  return (
    <PageSection aria-label="Routing">
      <RoutingToolbar controller={controller} />

      {controller.operationError ? (
        <div className="border-b px-4 py-2">
          <Alert className="py-2" variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{controller.operationError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[21rem_1fr]">
        <RoutingProfileList controller={controller} />
        <RoutingRulesPanel controller={controller} />
      </div>

      <RoutingDialogs controller={controller} />
    </PageSection>
  );
}
