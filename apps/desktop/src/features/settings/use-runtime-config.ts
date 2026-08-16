import { useEffect, useState } from "react";

import { loadAppConfig, saveAppConfig } from "@/ipc";
import type { AppConfig_Serialize } from "@/ipc/bindings";
import { getErrorMessage } from "@voya/utils/error";

export type ObjectSectionKey =
  | "ConstItem"
  | "CoreBasicItem"
  | "HysteriaItem"
  | "Mux4SboxItem"
  | "SpeedTestItem"
  | "SystemProxyItem"
  | "TunModeItem";

export type PatchSection = <K extends ObjectSectionKey>(
  key: K,
  patch: Partial<AppConfig_Serialize[K]>,
) => void;

export type RuntimeConfigController = {
  config: AppConfig_Serialize | null;
  error: string | null;
  patchSection: PatchSection;
  save: () => Promise<void>;
  saved: boolean;
  working: boolean;
};

export function useRuntimeConfig(): RuntimeConfigController {
  const [config, setConfig] = useState<AppConfig_Serialize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [working, setWorking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void loadAppConfig()
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setConfig(withRuntimeDefaults(loaded));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWorking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const patchSection: PatchSection = (key, patch) => {
    setSaved(false);
    setConfig((current) =>
      current
        ? ({
            ...current,
            [key]: {
              ...(current[key] as Record<string, unknown>),
              ...(patch as Record<string, unknown>),
            },
          } as AppConfig_Serialize)
        : current,
    );
  };

  async function save() {
    if (!config) {
      return;
    }

    setWorking(true);
    setError(null);
    setSaved(false);
    try {
      // save_app_config replaces the whole config, and other surfaces keep
      // persisting into it while this dialog is open (theme/language → UIItem,
      // hotkeys → GlobalHotkeys, autostart → GUIItem, and sources → ConstItem
      // URLs). Merge
      // the draft ONTO a fresh read, overlaying only the sections these
      // runtime tabs actually edit.
      const latestConfig = await loadAppConfig();
      const savedConfig = await saveAppConfig({
        ...latestConfig,
        ConstItem: {
          ...latestConfig.ConstItem,
          SubConvertUrl: config.ConstItem.SubConvertUrl,
        },
        CoreBasicItem: config.CoreBasicItem,
        HysteriaItem: config.HysteriaItem,
        Mux4SboxItem: config.Mux4SboxItem,
        SpeedTestItem: config.SpeedTestItem,
        SystemProxyItem: config.SystemProxyItem,
        TunModeItem: config.TunModeItem,
      });
      setConfig(withRuntimeDefaults(savedConfig));
      setSaved(true);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  return { config, error, patchSection, save, saved, working };
}

export function nullableText(value: string): string | null {
  return value.trim() ? value : null;
}

function withRuntimeDefaults(config: AppConfig_Serialize): AppConfig_Serialize {
  const loose = config as AppConfig_Serialize & Record<string, unknown>;

  return {
    ...config,
    ConstItem: {
      ...(loose.ConstItem as Record<string, unknown> | undefined),
    },
    CoreBasicItem: {
      BindInterface: null,
      DefAllowInsecure: false,
      DefFingerprint: "",
      DefUserAgent: "",
      EnableCacheFile4Sbox: false,
      EnableFragment: false,
      LogEnabled: false,
      Loglevel: "warning",
      MuxEnabled: false,
      SendThrough: null,
      ...(loose.CoreBasicItem as Record<string, unknown> | undefined),
    },
    HysteriaItem: {
      ...(loose.HysteriaItem as Record<string, unknown> | undefined),
    },
    Mux4SboxItem: {
      MaxConnections: 0,
      Protocol: "",
      ...(loose.Mux4SboxItem as Record<string, unknown> | undefined),
    },
    SpeedTestItem: {
      IPAPIUrl: "",
      MixedConcurrencyCount: 0,
      SpeedPingTestUrl: "",
      SpeedTestTimeout: 0,
      SpeedTestUrl: "",
      UdpTestTarget: "",
      ...(loose.SpeedTestItem as Record<string, unknown> | undefined),
    },
    SystemProxyItem: {
      NotProxyLocalAddress: false,
      SysProxyType: 0,
      SystemProxyAdvancedProtocol: "",
      SystemProxyExceptions: "",
      ...(loose.SystemProxyItem as Record<string, unknown> | undefined),
    },
    TunModeItem: {
      ...(loose.TunModeItem as Record<string, unknown> | undefined),
    },
  } as AppConfig_Serialize;
}
