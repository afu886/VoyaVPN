import { useState } from "react";
import { Cpu, Gauge, Globe2, Keyboard, Network, RefreshCw, Settings2, type LucideIcon } from "lucide-react";

import { DialogDescription, DialogTitle, ScrollableDialogContent } from "@voya/ui/components/dialog";
import { Tabs, TabsContent } from "@voya/ui/components/tabs";
import { useI18n } from "@voya/i18n/use-i18n";
import { UpdatesPanel } from "@/features/updates";
import { type SettingsTab, useModalStore } from "@/stores/modal-store";

import { CoreTab } from "./core-tab";
import { GeneralTab } from "./general-tab";
import { HotkeysTab } from "./hotkeys-tab";
import { NetworkTab } from "./network-tab";
import { SettingsTabBar, SettingsTabTrigger } from "./settings-tabs";
import { SourcesTab } from "./sources-tab";
import { TestsTab } from "./tests-tab";
import { useRuntimeConfig } from "./use-runtime-config";

const tabDefs: Array<{ icon: LucideIcon; labelKey: string; value: SettingsTab }> = [
  { icon: Settings2, labelKey: "settings.tabGeneral", value: "general" },
  { icon: Globe2, labelKey: "options.sources", value: "sources" },
  { icon: Cpu, labelKey: "options.runtimeCore", value: "core" },
  { icon: Network, labelKey: "options.runtimeNetwork", value: "network" },
  { icon: Gauge, labelKey: "settings.tabTests", value: "tests" },
  { icon: Keyboard, labelKey: "settings.tabHotkeys", value: "hotkeys" },
  { icon: RefreshCw, labelKey: "settings.tabUpdates", value: "updates" },
];

const tabValues = new Set<SettingsTab>(tabDefs.map((def) => def.value));

export function SettingsDialog({ entryId, initialTab }: { entryId?: string; initialTab?: SettingsTab }) {
  const { direction, t } = useI18n();
  const setModalSettingsTab = useModalStore((state) => state.setModalSettingsTab);
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? "general");
  // Panes mount lazily on first visit and then stay mounted (hidden) so tab
  // switches never drop in-flight work: the updates controller's coalesced
  // preference saves and unsaved sources/hotkeys drafts all live in pane
  // state, while per-tab IPC still only fires on explicit intent.
  const [visited, setVisited] = useState<ReadonlySet<SettingsTab>>(() => new Set([initialTab ?? "general"]));
  const runtime = useRuntimeConfig();

  function handleTabChange(value: string) {
    if (!tabValues.has(value as SettingsTab)) {
      return;
    }
    const next = value as SettingsTab;
    setTab(next);
    setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
    if (entryId) {
      // Persist onto the modal entry: the templates dialog stacks above
      // Settings and unmounts it, so the active tab must outlive this
      // component to be restored on return.
      setModalSettingsTab(entryId, next);
    }
  }

  return (
    <ScrollableDialogContent
      className="h-[min(92vh,40rem)] grid-rows-[minmax(0,1fr)]"
      onEscapeKeyDown={(event) => {
        // While a hotkey is being recorded, Escape is input, not dismissal.
        if (event.target instanceof HTMLElement && event.target.closest("[data-hotkey-capture]")) {
          event.preventDefault();
        }
      }}
      width="54rem"
    >
      <DialogTitle className="sr-only">{t("modal.settings")}</DialogTitle>
      <DialogDescription className="sr-only">{t("modal.settingsDescription")}</DialogDescription>
      <Tabs className="min-h-0 gap-0" dir={direction} onValueChange={handleTabChange} value={tab}>
        <SettingsTabBar>
          {tabDefs.map((def) => (
            <SettingsTabTrigger key={def.value} icon={def.icon} label={t(def.labelKey)} value={def.value} />
          ))}
        </SettingsTabBar>
        <div className="min-h-0 flex-1">
          {tabDefs.map((def) => (
            <TabsContent
              key={def.value}
              className="h-full overflow-y-auto px-8 py-6 data-[state=inactive]:hidden"
              forceMount
              value={def.value}
            >
              {visited.has(def.value) ? <SettingsPane runtime={runtime} tab={def.value} /> : null}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </ScrollableDialogContent>
  );
}

function SettingsPane({ runtime, tab }: { runtime: ReturnType<typeof useRuntimeConfig>; tab: SettingsTab }) {
  switch (tab) {
    case "general":
      return <GeneralTab />;
    case "sources":
      return <SourcesTab />;
    case "core":
      return <CoreTab controller={runtime} />;
    case "network":
      return <NetworkTab controller={runtime} />;
    case "tests":
      return <TestsTab controller={runtime} />;
    case "hotkeys":
      return <HotkeysTab />;
    case "updates":
      return <UpdatesPanel />;
  }
}
