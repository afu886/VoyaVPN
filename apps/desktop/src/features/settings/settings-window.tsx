import { useEffect } from "react";

import { ModalHost } from "@/components/app-shell/modal-host";
import { TitleBar } from "@/components/app-shell/title-bar";
import { Toaster } from "@/components/app-shell/toaster";
import { useAcrylicWindow } from "@/components/app-shell/use-acrylic-window";
import { useWindowChrome } from "@/components/app-shell/use-window-chrome";
import { closeWindow, setWindowTitle } from "@/ipc/window";
import { useModalStore } from "@/stores/modal-store";
import { useI18n } from "@voya/i18n/use-i18n";

import { SettingsSurface } from "./settings-dialog";

export function SettingsWindow() {
  const { direction, t } = useI18n();
  const { titleBarLayout } = useWindowChrome();
  const title = t("modal.settings");

  useAcrylicWindow(titleBarLayout === "windows");
  useCloseSettingsWindowOnEscape();

  useEffect(() => {
    void setWindowTitle(title).catch(() => undefined);
  }, [title]);

  return (
    <main className="bg-background text-foreground" dir={direction}>
      <div className="flex h-screen min-h-[34rem] flex-col overflow-hidden">
        {titleBarLayout === "windows" ? <TitleBar title={title} /> : null}
        <SettingsSurface />
      </div>

      <ModalHost />
      <Toaster />
    </main>
  );
}

function useCloseSettingsWindowOnEscape() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (event.target instanceof HTMLElement && event.target.closest("[data-hotkey-capture]")) {
        return;
      }

      // Radix dialogs portal outside the settings surface. Let the topmost
      // child overlay consume Escape instead of closing its owning window.
      if (
        useModalStore.getState().stack.length > 0 ||
        document.querySelector(
          [
            '[data-slot="dialog-content"][data-state="open"]',
            '[data-slot="alert-dialog-content"][data-state="open"]',
            '[data-slot="select-content"][data-state="open"]',
          ].join(","),
        )
      ) {
        return;
      }

      event.preventDefault();
      void closeWindow().catch(() => undefined);
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);
}
