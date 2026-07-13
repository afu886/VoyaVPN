import { useState } from "react";
import { Cpu, Gauge, Globe2, Keyboard, Network, RefreshCw, Settings2, type LucideIcon } from "lucide-react";

import { Tabs, TabsContent } from "@voya/ui/components/tabs";
import { useI18n } from "@voya/i18n/use-i18n";
import { UpdatesPanel } from "@/features/updates";

import { CoreTab } from "./core-tab";
import { GeneralTab } from "./general-tab";
import { HotkeysTab } from "./hotkeys-tab";
import { NetworkTab } from "./network-tab";
import { SettingsTabBar, SettingsTabTrigger } from "./settings-tabs";
import { SourcesTab } from "./sources-tab";
import { TestsTab } from "./tests-tab";
import { useRuntimeConfig } from "./use-runtime-config";

export type SettingsTab = "core" | "general" | "hotkeys" | "network" | "sources" | "tests" | "updates";

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

export function SettingsSurface({ initialTab = "general" }: { initialTab?: SettingsTab }) {
  const { direction, t } = useI18n();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  // Panes mount lazily on first visit and then stay mounted (hidden) so tab
  // switches never drop in-flight work or unsaved sources/hotkeys drafts, while
  // per-tab IPC still only fires on explicit intent.
  const [visited, setVisited] = useState<ReadonlySet<SettingsTab>>(() => new Set([initialTab]));
  const runtime = useRuntimeConfig();

  function handleTabChange(value: string) {
    if (!tabValues.has(value as SettingsTab)) {
      return;
    }
    const next = value as SettingsTab;
    setTab(next);
    setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
  }

  return (
    <section
      aria-describedby="settings-window-description"
      aria-labelledby="settings-window-title"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <h1 className="sr-only" id="settings-window-title">
        {t("modal.settings")}
      </h1>
      <p className="sr-only" id="settings-window-description">
        {t("modal.settingsDescription")}
      </p>
      <Tabs className="flex min-h-0 flex-1 flex-col gap-0" dir={direction} onValueChange={handleTabChange} value={tab}>
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
    </section>
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
