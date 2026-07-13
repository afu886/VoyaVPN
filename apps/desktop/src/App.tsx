import { AppShell } from "@/components/app-shell/app-shell";
import { PreferencesBridge } from "@/components/preferences-bridge";
import { SettingsWindow } from "@/features/settings";
import { EventBridge } from "@/ipc";

type AppSurface = "main" | "settings";

export function App() {
  const surface = resolveAppSurface();

  return (
    <>
      <PreferencesBridge />
      <EventBridge surface={surface} />
      {surface === "settings" ? <SettingsWindow /> : <AppShell />}
    </>
  );
}

function resolveAppSurface(search = typeof window === "undefined" ? "" : window.location.search): AppSurface {
  return new URLSearchParams(search).get("window") === "settings" ? "settings" : "main";
}
