import { useEffect, useMemo, useRef, type MutableRefObject } from "react";

import { AppSidebar, SHELL_PANEL_ID } from "@/components/app-shell/app-sidebar";
import { ModalHost } from "@/components/app-shell/modal-host";
import { StatusBar } from "@/components/app-shell/status-bar";
import { TitleBar } from "@/components/app-shell/title-bar";
import { Toaster } from "@/components/app-shell/toaster";
import { useAcrylicWindow } from "@/components/app-shell/use-acrylic-window";
import { useWindowChrome } from "@/components/app-shell/use-window-chrome";
import { applyDocumentLocale } from "@voya/i18n";
import { useI18n } from "@voya/i18n/use-i18n";
import { HomeScreen } from "@/features/home";
import { ProfilesScreen } from "@/features/profiles";
import { RoutingScreen } from "@/features/routing";
import { DnsScreen } from "@/features/dns";
import { ClashConnectionsScreen, ClashProxiesScreen } from "@/features/clash";
import { LogsScreen } from "@/features/logs";
import {
  clashStartMonitor,
  clashStopMonitor,
  loadAppConfig,
  saveAppConfig,
  useRuntimeEventStore,
} from "@/ipc";
import type { AppConfig_Deserialize, ClashMonitorStatus } from "@/ipc/bindings";
import { useMountedRef } from "@voya/utils/use-mounted-ref";
import {
  resolveThemeMode,
  themeModeToConfig,
  type ThemeMode,
  uiItemWithoutLegacyColor,
  usePreferencesStore,
} from "@/stores/preferences-store";
import { type ShellTab, useShellStore } from "@/stores/shell-store";
import { useToastStore } from "@/stores/toast-store";

// Render only the active screen. Replaces the Radix `Tabs`/`TabsContent` fan-out
// (which already unmounted inactive panels) so the grid shell can drop the tab
// primitive while keeping the exact "one mounted screen at a time" behaviour the
// clash-monitor lifecycle and query work rely on.
function renderActiveScreen(tab: ShellTab) {
  switch (tab) {
    case "home":
      return <HomeScreen />;
    case "profiles":
      return <ProfilesScreen />;
    case "routing":
      return <RoutingScreen />;
    case "dns":
      return <DnsScreen />;
    case "clash-proxies":
      return <ClashProxiesScreen />;
    case "clash-connections":
      return <ClashConnectionsScreen />;
    case "logs":
      return <LogsScreen />;
    default:
      return null;
  }
}

export function AppShell() {
  const { direction, language } = useI18n();
  const activeTab = useShellStore((state) => state.activeTab);
  const themeMode = usePreferencesStore((state) => state.themeMode);
  const { titleBarLayout } = useWindowChrome();

  usePersistedPreferences(language);
  useThemeEffects(themeMode);
  useClashMonitorLifecycle(activeTab);
  // Windows borderless chrome is the only Acrylic target; the hook no-ops elsewhere.
  useAcrylicWindow(titleBarLayout === "windows");

  useEffect(() => {
    applyDocumentLocale(language);
  }, [language]);

  return (
    <main className="bg-background text-foreground" dir={direction}>
      <div className="grid h-screen min-h-[34rem] grid-cols-[auto_1fr] grid-rows-[auto_1fr_auto] overflow-hidden">
        {/* Titlebar row: the Windows build draws its own borderless title bar
            (it spans both columns); every other platform keeps its native frame
            and leaves this structural row empty (collapsing to zero height). */}
        {titleBarLayout === "windows" ? (
          <TitleBar />
        ) : (
          <div className="col-span-2" data-slot="titlebar-placeholder" />
        )}

        <AppSidebar />

        <div
          aria-labelledby={`shell-tab-${activeTab}`}
          className="min-h-0 min-w-0 overflow-hidden bg-background outline-none"
          id={SHELL_PANEL_ID}
          role="tabpanel"
          tabIndex={0}
        >
          {renderActiveScreen(activeTab)}
        </div>

        <div className="col-span-2 min-w-0">
          <StatusBar />
        </div>
      </div>

      <ModalHost />
      <Toaster />
    </main>
  );
}

function usePersistedPreferences(language: string) {
  const appConfigLoaded = usePreferencesStore((state) => state.appConfigLoaded);
  const hydrateFromConfig = usePreferencesStore((state) => state.hydrateFromConfig);
  const themeMode = usePreferencesStore((state) => state.themeMode);
  const lastPersistedKeyRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const mountedRef = useMountedRef();
  const persistQueueRef = useRef<Promise<void> | null>(null);
  const persistSequenceRef = useRef(0);
  const preferenceSnapshot = useMemo<PreferenceConfigSnapshot>(
    () => ({ language, themeMode }),
    [language, themeMode],
  );

  useEffect(() => {
    if (appConfigLoaded) {
      return undefined;
    }

    const generation = ++loadGenerationRef.current;

    void loadAppConfig()
      .then((config) => {
        if (!mountedRef.current || generation !== loadGenerationRef.current) {
          return;
        }

        hydrateFromConfig(config.UIItem);
        lastPersistedKeyRef.current = preferenceConfigKey({
          language,
          themeMode: usePreferencesStore.getState().themeMode,
        });
      })
      .catch(() => undefined);

    return () => {
      loadGenerationRef.current += 1;
    };
  }, [appConfigLoaded, hydrateFromConfig, language, mountedRef]);

  useEffect(() => {
    if (!appConfigLoaded || lastPersistedKeyRef.current === null) {
      return undefined;
    }

    const persistKey = preferenceConfigKey(preferenceSnapshot);
    if (lastPersistedKeyRef.current === persistKey) {
      return undefined;
    }

    const sequence = ++persistSequenceRef.current;
    const timeout = window.setTimeout(() => {
      const queuedPersistence = persistQueueRef.current ?? Promise.resolve();
      persistQueueRef.current = queuedPersistence
        .catch(() => undefined)
        .then(() => persistPreferenceConfig(preferenceSnapshot))
        .then(() => {
          if (persistSequenceRef.current === sequence) {
            lastPersistedKeyRef.current = persistKey;
          }
        })
        .catch(() => undefined);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [appConfigLoaded, preferenceSnapshot]);
}

function useClashMonitorLifecycle(activeTab: ShellTab) {
  const pushToast = useToastStore((state) => state.pushToast);
  const startTimerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const wantsMonitorRef = useRef(false);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    wantsMonitorRef.current = isClashTab(activeTab);
    clearTimer(startTimerRef);
    clearTimer(stopTimerRef);

    if (wantsMonitorRef.current) {
      if (!runningRef.current && !startingRef.current && !stoppingRef.current) {
        scheduleClashMonitorStart({
          pushToast,
          runningRef,
          startingRef,
          startTimerRef,
          stoppingRef,
          stopTimerRef,
          wantsMonitorRef,
        });
      }

      return undefined;
    }

    if (runningRef.current || startingRef.current || stoppingRef.current) {
      scheduleClashMonitorStop({
        pushToast,
        runningRef,
        startingRef,
        startTimerRef,
        stoppingRef,
        stopTimerRef,
        wantsMonitorRef,
      });
    }

    return undefined;
  }, [activeTab, pushToast]);

  useEffect(
    () => () => {
      clearTimer(startTimerRef);
      clearTimer(stopTimerRef);
      wantsMonitorRef.current = false;
      if (runningRef.current) {
        void clashStopMonitor().catch(() => undefined);
      }
    },
    [],
  );
}

type PushToast = ReturnType<typeof useToastStore.getState>["pushToast"];

type ClashMonitorLifecycleRefs = {
  runningRef: MutableRefObject<boolean>;
  startingRef: MutableRefObject<boolean>;
  startTimerRef: MutableRefObject<number | null>;
  stoppingRef: MutableRefObject<boolean>;
  stopTimerRef: MutableRefObject<number | null>;
  wantsMonitorRef: MutableRefObject<boolean>;
};

function scheduleClashMonitorStart({
  pushToast,
  runningRef,
  startingRef,
  startTimerRef,
  stoppingRef,
  stopTimerRef,
  wantsMonitorRef,
}: ClashMonitorLifecycleRefs & { pushToast: PushToast }) {
  clearTimer(startTimerRef);
  startTimerRef.current = window.setTimeout(() => {
    startTimerRef.current = null;
    if (!wantsMonitorRef.current || runningRef.current || startingRef.current || stoppingRef.current) {
      return;
    }

    startingRef.current = true;
    useRuntimeEventStore.getState().setClashMonitorStarting();
    void clashStartMonitor()
      .then((status) => {
        applyClashMonitorStatus(status, runningRef);
        if (!wantsMonitorRef.current && status.running) {
          scheduleClashMonitorStop({
            pushToast,
            runningRef,
            startingRef,
            startTimerRef,
            stoppingRef,
            stopTimerRef,
            wantsMonitorRef,
          });
        }
      })
      .catch((error) => {
        const message = clashMonitorErrorMessage(error, "Unable to start Clash monitor.");

        runningRef.current = false;
        useRuntimeEventStore.getState().setClashMonitorFailed(message);
        pushToast({ description: message, title: "Clash" });
      })
      .finally(() => {
        startingRef.current = false;
      });
  }, 100);
}

function scheduleClashMonitorStop({
  pushToast,
  runningRef,
  startingRef,
  startTimerRef,
  stoppingRef,
  stopTimerRef,
  wantsMonitorRef,
}: ClashMonitorLifecycleRefs & { pushToast: PushToast }) {
  clearTimer(stopTimerRef);
  stopTimerRef.current = window.setTimeout(() => {
    stopTimerRef.current = null;
    if (!runningRef.current && !startingRef.current && !stoppingRef.current) {
      return;
    }

    stoppingRef.current = true;
    void clashStopMonitor()
      .then((status) => {
        applyClashMonitorStatus(status, runningRef);
      })
      .catch((error) => {
        const message = clashMonitorErrorMessage(error, "Unable to stop Clash monitor.");

        runningRef.current = false;
        useRuntimeEventStore.getState().setClashMonitorFailed(message);
        pushToast({ description: message, title: "Clash" });
      })
      .finally(() => {
        stoppingRef.current = false;
        if (wantsMonitorRef.current && !runningRef.current && !startingRef.current) {
          scheduleClashMonitorStart({
            pushToast,
            runningRef,
            startingRef,
            startTimerRef,
            stoppingRef,
            stopTimerRef,
            wantsMonitorRef,
          });
        }
      });
  }, 2_000);
}

function applyClashMonitorStatus(status: ClashMonitorStatus, runningRef: MutableRefObject<boolean>) {
  runningRef.current = status.running;
  useRuntimeEventStore.getState().setClashMonitorStatus(status);
}

function clashMonitorErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return fallback;
}

function clearTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function isClashTab(tab: ShellTab) {
  return tab === "clash-proxies" || tab === "clash-connections";
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type PreferenceConfigSnapshot = {
  language: string;
  themeMode: ThemeMode;
};

function preferenceConfigKey({ language, themeMode }: PreferenceConfigSnapshot) {
  return JSON.stringify({
    language,
    themeMode,
  });
}

async function persistPreferenceConfig({
  language,
  themeMode,
}: PreferenceConfigSnapshot) {
  const config = await loadAppConfig();
  const nextConfig = {
    ...config,
    UIItem: {
      ...uiItemWithoutLegacyColor(config.UIItem),
      CurrentLanguage: language,
      CurrentTheme: themeModeToConfig(themeMode),
    },
  } satisfies AppConfig_Deserialize;

  await saveAppConfig(nextConfig);
}

function useThemeEffects(themeMode: ThemeMode) {
  useEffect(() => {
    const root = document.documentElement;
    const media =
      typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : undefined;

    const applyTheme = () => {
      const resolvedTheme = resolveThemeMode(themeMode);

      root.classList.toggle("dark", resolvedTheme === "dark");
      root.style.colorScheme = resolvedTheme;
    };

    applyTheme();

    if (themeMode !== "system" || !media) {
      return undefined;
    }

    media.addEventListener("change", applyTheme);

    return () => media.removeEventListener("change", applyTheme);
  }, [themeMode]);
}
