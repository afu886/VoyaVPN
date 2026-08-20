import { useCallback, useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@voya/ui/components/alert-dialog";
import { ModalHost } from "@/components/app-shell/modal-host";
import { TitleBar } from "@/components/app-shell/title-bar";
import { Toaster } from "@/components/app-shell/toaster";
import { useAcrylicWindow } from "@/components/app-shell/use-acrylic-window";
import { useWindowChrome } from "@/components/app-shell/use-window-chrome";
import {
  closeWindow,
  onWindowCloseRequested,
  setWindowTitle,
} from "@/ipc/window";
import { useModalStore } from "@/stores/modal-store";
import { useI18n } from "@voya/i18n/use-i18n";

import { SettingsSurface } from "./settings-dialog";
import { useAppSettings } from "./use-app-settings";

export function SettingsWindow() {
  const { direction, t } = useI18n();
  const { titleBarLayout } = useWindowChrome();
  const controller = useAppSettings();
  const [confirmClose, setConfirmClose] = useState(false);
  const title = t("modal.settings");

  useAcrylicWindow(titleBarLayout === "windows");

  useEffect(() => {
    void setWindowTitle(title).catch(() => undefined);
  }, [title]);

  const requestClose = useCallback(() => {
    if (controller.dirty) {
      setConfirmClose(true);
      return;
    }
    void closeWindow().catch(() => undefined);
  }, [controller.dirty]);

  useCloseSettingsWindowOnEscape(requestClose);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void onWindowCloseRequested((event) => {
      if (controller.dirty) {
        event.preventDefault();
        setConfirmClose(true);
      }
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [controller.dirty]);

  return (
    <main className="bg-background text-foreground" dir={direction}>
      <div className="flex h-screen min-h-[34rem] flex-col overflow-hidden">
        {titleBarLayout === "windows" ? <TitleBar onClose={requestClose} title={title} /> : null}
        <SettingsSurface controller={controller} />
      </div>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.closeUnsavedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.closeUnsavedDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void controller.discard().then(() => closeWindow());
              }}
            >
              {t("settings.discardChanges")}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void controller.save().then((saved) => {
                  if (saved) void closeWindow();
                });
              }}
            >
              {t("settings.saveAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ModalHost />
      <Toaster />
    </main>
  );
}

function useCloseSettingsWindowOnEscape(requestClose: () => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.target instanceof HTMLElement && event.target.closest("[data-hotkey-capture]")) return;
      if (
        useModalStore.getState().stack.length > 0 ||
        document.querySelector(
          [
            '[data-slot="dialog-content"][data-state="open"]',
            '[data-slot="alert-dialog-content"][data-state="open"]',
            '[data-slot="select-content"][data-state="open"]',
          ].join(","),
        )
      ) return;

      event.preventDefault();
      requestClose();
    }
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [requestClose]);
}
