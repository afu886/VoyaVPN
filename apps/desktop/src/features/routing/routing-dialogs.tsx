import { RoutingProfileDialog } from "./routing-profile-dialog";
import { RoutingRuleDialog } from "./routing-rule-dialog";
import type { RoutingScreenController } from "./use-routing-screen";

export function RoutingDialogs({ controller }: { controller: RoutingScreenController }) {
  const {
    handleSaveRouting,
    handleSaveRule,
    routingDialog,
    ruleDialog,
    setRoutingDialog,
    setRuleDialog,
  } = controller;

  return (
    <>
      <RoutingProfileDialog
        key={routingDialog?.mode === "edit" ? `routing-${routingDialog.routing.Id}` : `routing-${routingDialog?.mode ?? "closed"}`}
        mode={routingDialog?.mode ?? "create"}
        onOpenChange={(open) => !open && setRoutingDialog(null)}
        onSubmit={handleSaveRouting}
        open={Boolean(routingDialog)}
        routing={routingDialog?.mode === "edit" ? routingDialog.routing : null}
      />
      <RoutingRuleDialog
        key={ruleDialog?.mode === "edit" ? `rule-${ruleDialog.rule.Id}` : `rule-${ruleDialog?.mode ?? "closed"}`}
        mode={ruleDialog?.mode ?? "create"}
        onOpenChange={(open) => !open && setRuleDialog(null)}
        onSubmit={handleSaveRule}
        open={Boolean(ruleDialog)}
        rule={ruleDialog?.mode === "edit" ? ruleDialog.rule : null}
      />
    </>
  );
}
