import { useEffect, useState } from "react";
import { Save, Settings2 } from "lucide-react";

import { Button } from "@voya/ui/components/button";
import { Input } from "@voya/ui/components/input";
import { Label } from "@voya/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voya/ui/components/select";
import { Switch } from "@voya/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voya/ui/components/tabs";
import { useI18n } from "@voya/i18n/use-i18n";
import { loadAppConfig, saveAppConfig } from "@/ipc";
import type { AppConfig_Serialize, SysProxyType } from "@/ipc/bindings";
import { getErrorMessage } from "@voya/utils/error";

type ObjectSectionKey =
  | "CheckUpdateItem"
  | "ConstItem"
  | "CoreBasicItem"
  | "Fragment4RayItem"
  | "HysteriaItem"
  | "Mux4RayItem"
  | "Mux4SboxItem"
  | "SpeedTestItem"
  | "SystemProxyItem"
  | "TunModeItem";

type PatchSection = <K extends ObjectSectionKey>(key: K, patch: Partial<AppConfig_Serialize[K]>) => void;

const sysProxyOptions: Array<{ label: string; value: SysProxyType }> = [
  { label: "Clear", value: 0 },
  { label: "Set", value: 1 },
  { label: "Unchanged", value: 2 },
  { label: "PAC", value: 3 },
];

export function RuntimeConfigSettings() {
  const { t } = useI18n();
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
        const normalized = withRuntimeDefaults(loaded);
        setConfig(normalized);
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

  function patchSection<K extends ObjectSectionKey>(key: K, patch: Partial<AppConfig_Serialize[K]>) {
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
  }

  async function save() {
    if (!config) {
      return;
    }

    setWorking(true);
    setError(null);
    setSaved(false);
    try {
      const latestConfig = await loadAppConfig();
      const savedConfig = await saveAppConfig({
        ...config,
        ConstItem: {
          ...config.ConstItem,
          GeoSourceUrl: latestConfig.ConstItem.GeoSourceUrl,
          RouteRulesTemplateSourceUrl: latestConfig.ConstItem.RouteRulesTemplateSourceUrl,
          SrsSourceUrl: latestConfig.ConstItem.SrsSourceUrl,
        },
      });
      setConfig(withRuntimeDefaults(savedConfig));
      setSaved(true);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  if (!config) {
    return (
      <section className="grid gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="size-4" aria-hidden="true" />
          {t("options.runtimeConfig")}
        </h3>
        <p className="text-xs text-muted-foreground">{working ? t("options.loading") : error}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="size-4" aria-hidden="true" />
          {t("options.runtimeConfig")}
        </h3>
        <Button disabled={working} onClick={() => void save()} type="button" variant="outline">
          <Save className="size-4" aria-hidden="true" />
          {t("actions.save")}
        </Button>
      </div>

      <Tabs defaultValue="core">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="core">{t("options.runtimeCore")}</TabsTrigger>
          <TabsTrigger value="network">{t("options.runtimeNetwork")}</TabsTrigger>
          <TabsTrigger value="tests">{t("options.runtimeTests")}</TabsTrigger>
        </TabsList>

        <TabsContent value="core">
          <CoreSettingsTab config={config} onPatch={patchSection} />
        </TabsContent>

        <TabsContent value="network">
          <NetworkSettingsTab config={config} onPatch={patchSection} />
        </TabsContent>

        <TabsContent value="tests">
          <TestSettingsTab config={config} onPatch={patchSection} />
        </TabsContent>

      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        {saved ? <span className="text-xs text-muted-foreground">{t("options.saved")}</span> : null}
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </section>
  );
}

function CoreSettingsTab({ config, onPatch }: { config: AppConfig_Serialize; onPatch: PatchSection }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <BooleanField
        checked={config.CoreBasicItem.LogEnabled}
        label="CoreBasic.LogEnabled"
        onChange={(LogEnabled) => onPatch("CoreBasicItem", { LogEnabled })}
      />
      <SelectField
        label="CoreBasic.Loglevel"
        onChange={(Loglevel) => onPatch("CoreBasicItem", { Loglevel })}
        options={["none", "trace", "debug", "info", "warn", "warning", "error"]}
        value={config.CoreBasicItem.Loglevel}
      />
      <BooleanField
        checked={config.CoreBasicItem.DefAllowInsecure}
        label="CoreBasic.DefAllowInsecure"
        onChange={(DefAllowInsecure) => onPatch("CoreBasicItem", { DefAllowInsecure })}
      />
      <BooleanField
        checked={config.CoreBasicItem.MuxEnabled}
        label="CoreBasic.MuxEnabled"
        onChange={(MuxEnabled) => onPatch("CoreBasicItem", { MuxEnabled })}
      />
      <BooleanField
        checked={config.CoreBasicItem.EnableFragment}
        label="CoreBasic.EnableFragment"
        onChange={(EnableFragment) => onPatch("CoreBasicItem", { EnableFragment })}
      />
      <BooleanField
        checked={config.CoreBasicItem.EnableCacheFile4Sbox}
        label="CoreBasic.EnableCacheFile4Sbox"
        onChange={(EnableCacheFile4Sbox) => onPatch("CoreBasicItem", { EnableCacheFile4Sbox })}
      />
      <TextField
        label="CoreBasic.DefFingerprint"
        onChange={(DefFingerprint) => onPatch("CoreBasicItem", { DefFingerprint })}
        value={config.CoreBasicItem.DefFingerprint}
      />
      <TextField
        label="CoreBasic.DefUserAgent"
        onChange={(DefUserAgent) => onPatch("CoreBasicItem", { DefUserAgent })}
        value={config.CoreBasicItem.DefUserAgent}
      />
      <TextField
        label="CoreBasic.SendThrough"
        onChange={(SendThrough) => onPatch("CoreBasicItem", { SendThrough: nullableText(SendThrough) })}
        value={config.CoreBasicItem.SendThrough ?? ""}
      />
      <TextField
        label="CoreBasic.BindInterface"
        onChange={(BindInterface) => onPatch("CoreBasicItem", { BindInterface: nullableText(BindInterface) })}
        value={config.CoreBasicItem.BindInterface ?? ""}
      />
      <NumberField
        label="Mux4Ray.Concurrency"
        onChange={(Concurrency) => onPatch("Mux4RayItem", { Concurrency })}
        value={config.Mux4RayItem.Concurrency ?? null}
      />
      <NumberField
        label="Mux4Ray.XudpConcurrency"
        onChange={(XudpConcurrency) => onPatch("Mux4RayItem", { XudpConcurrency })}
        value={config.Mux4RayItem.XudpConcurrency ?? null}
      />
      <TextField
        label="Mux4Ray.XudpProxyUDP443"
        onChange={(XudpProxyUDP443) => onPatch("Mux4RayItem", { XudpProxyUDP443: nullableText(XudpProxyUDP443) })}
        value={config.Mux4RayItem.XudpProxyUDP443 ?? ""}
      />
      <TextField
        label="Mux4Sbox.Protocol"
        onChange={(Protocol) => onPatch("Mux4SboxItem", { Protocol })}
        value={config.Mux4SboxItem.Protocol}
      />
      <NumberField
        label="Mux4Sbox.MaxConnections"
        onChange={(MaxConnections) => onPatch("Mux4SboxItem", { MaxConnections: MaxConnections ?? 0 })}
        value={config.Mux4SboxItem.MaxConnections}
      />
      <BooleanField
        checked={config.Mux4SboxItem.Padding ?? false}
        label="Mux4Sbox.Padding"
        onChange={(Padding) => onPatch("Mux4SboxItem", { Padding })}
      />
      <TextField
        label="Fragment4Ray.Packets"
        onChange={(Packets) => onPatch("Fragment4RayItem", { Packets: nullableText(Packets) })}
        value={config.Fragment4RayItem.Packets ?? ""}
      />
      <TextField
        label="Fragment4Ray.Length"
        onChange={(Length) => onPatch("Fragment4RayItem", { Length: nullableText(Length) })}
        value={config.Fragment4RayItem.Length ?? ""}
      />
      <TextField
        label="Fragment4Ray.Interval"
        onChange={(Interval) => onPatch("Fragment4RayItem", { Interval: nullableText(Interval) })}
        value={config.Fragment4RayItem.Interval ?? ""}
      />
    </div>
  );
}

function NetworkSettingsTab({ config, onPatch }: { config: AppConfig_Serialize; onPatch: PatchSection }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <BooleanField
        checked={config.TunModeItem.EnableTun ?? false}
        label="Tun.EnableTun"
        onChange={(EnableTun) => onPatch("TunModeItem", { EnableTun })}
      />
      <BooleanField
        checked={config.TunModeItem.AutoRoute ?? false}
        label="Tun.AutoRoute"
        onChange={(AutoRoute) => onPatch("TunModeItem", { AutoRoute })}
      />
      <BooleanField
        checked={config.TunModeItem.StrictRoute ?? false}
        label="Tun.StrictRoute"
        onChange={(StrictRoute) => onPatch("TunModeItem", { StrictRoute })}
      />
      <BooleanField
        checked={config.TunModeItem.EnableIPv6Address ?? false}
        label="Tun.EnableIPv6Address"
        onChange={(EnableIPv6Address) => onPatch("TunModeItem", { EnableIPv6Address })}
      />
      <BooleanField
        checked={config.TunModeItem.EnableLegacyProtect ?? false}
        label="Tun.EnableLegacyProtect"
        onChange={(EnableLegacyProtect) => onPatch("TunModeItem", { EnableLegacyProtect })}
      />
      <TextField
        label="Tun.Stack"
        onChange={(Stack) => onPatch("TunModeItem", { Stack })}
        value={config.TunModeItem.Stack ?? ""}
      />
      <NumberField
        label="Tun.Mtu"
        onChange={(Mtu) => onPatch("TunModeItem", { Mtu: Mtu ?? 0 })}
        value={config.TunModeItem.Mtu ?? null}
      />
      <TextField
        label="Tun.IcmpRouting"
        onChange={(IcmpRouting) => onPatch("TunModeItem", { IcmpRouting })}
        value={config.TunModeItem.IcmpRouting ?? ""}
      />
      <SelectField
        label="SystemProxy.SysProxyType"
        onChange={(value) => onPatch("SystemProxyItem", { SysProxyType: Number(value) })}
        options={sysProxyOptions.map((option) => String(option.value))}
        optionLabel={(value) => sysProxyOptions.find((option) => option.value === Number(value))?.label ?? value}
        value={String(config.SystemProxyItem.SysProxyType)}
      />
      <BooleanField
        checked={config.SystemProxyItem.NotProxyLocalAddress}
        label="SystemProxy.NotProxyLocalAddress"
        onChange={(NotProxyLocalAddress) => onPatch("SystemProxyItem", { NotProxyLocalAddress })}
      />
      <TextField
        label="SystemProxy.Exceptions"
        onChange={(SystemProxyExceptions) => onPatch("SystemProxyItem", { SystemProxyExceptions })}
        value={config.SystemProxyItem.SystemProxyExceptions}
      />
      <TextField
        label="SystemProxy.AdvancedProtocol"
        onChange={(SystemProxyAdvancedProtocol) => onPatch("SystemProxyItem", { SystemProxyAdvancedProtocol })}
        value={config.SystemProxyItem.SystemProxyAdvancedProtocol}
      />
      <TextField
        label="SystemProxy.CustomPacPath"
        onChange={(CustomSystemProxyPacPath) =>
          onPatch("SystemProxyItem", { CustomSystemProxyPacPath: nullableText(CustomSystemProxyPacPath) })
        }
        value={config.SystemProxyItem.CustomSystemProxyPacPath ?? ""}
      />
      <TextField
        label="SystemProxy.CustomScriptPath"
        onChange={(CustomSystemProxyScriptPath) =>
          onPatch("SystemProxyItem", { CustomSystemProxyScriptPath: nullableText(CustomSystemProxyScriptPath) })
        }
        value={config.SystemProxyItem.CustomSystemProxyScriptPath ?? ""}
      />
    </div>
  );
}

function TestSettingsTab({ config, onPatch }: { config: AppConfig_Serialize; onPatch: PatchSection }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <NumberField
        label="SpeedTest.Timeout"
        onChange={(SpeedTestTimeout) => onPatch("SpeedTestItem", { SpeedTestTimeout: SpeedTestTimeout ?? 0 })}
        value={config.SpeedTestItem.SpeedTestTimeout}
      />
      <NumberField
        label="SpeedTest.MixedConcurrency"
        onChange={(MixedConcurrencyCount) => onPatch("SpeedTestItem", { MixedConcurrencyCount: MixedConcurrencyCount ?? 0 })}
        value={config.SpeedTestItem.MixedConcurrencyCount}
      />
      <TextField
        label="SpeedTest.Url"
        onChange={(SpeedTestUrl) => onPatch("SpeedTestItem", { SpeedTestUrl })}
        value={config.SpeedTestItem.SpeedTestUrl}
      />
      <TextField
        label="SpeedTest.PingUrl"
        onChange={(SpeedPingTestUrl) => onPatch("SpeedTestItem", { SpeedPingTestUrl })}
        value={config.SpeedTestItem.SpeedPingTestUrl}
      />
      <TextField
        label="SpeedTest.IPAPIUrl"
        onChange={(IPAPIUrl) => onPatch("SpeedTestItem", { IPAPIUrl })}
        value={config.SpeedTestItem.IPAPIUrl}
      />
      <TextField
        label="SpeedTest.UdpTarget"
        onChange={(UdpTestTarget) => onPatch("SpeedTestItem", { UdpTestTarget })}
        value={config.SpeedTestItem.UdpTestTarget}
      />
      <NumberField
        label="SpeedTest.PageSize"
        onChange={(SpeedTestPageSize) => onPatch("SpeedTestItem", { SpeedTestPageSize })}
        value={config.SpeedTestItem.SpeedTestPageSize ?? null}
      />
      <NumberField
        label="SpeedTest.DelayInterval"
        onChange={(SpeedTestDelayInterval) => onPatch("SpeedTestItem", { SpeedTestDelayInterval })}
        value={config.SpeedTestItem.SpeedTestDelayInterval ?? null}
      />
      <NumberField
        label="Hysteria.UpMbps"
        onChange={(UpMbps) => onPatch("HysteriaItem", { UpMbps: UpMbps ?? undefined })}
        value={config.HysteriaItem.UpMbps ?? null}
      />
      <NumberField
        label="Hysteria.DownMbps"
        onChange={(DownMbps) => onPatch("HysteriaItem", { DownMbps: DownMbps ?? undefined })}
        value={config.HysteriaItem.DownMbps ?? null}
      />
      <NumberField
        label="Hysteria.HopInterval"
        onChange={(HopInterval) => onPatch("HysteriaItem", { HopInterval: HopInterval ?? undefined })}
        value={config.HysteriaItem.HopInterval ?? null}
      />
      <BooleanField
        checked={config.CheckUpdateItem.CheckPreReleaseUpdate}
        label="Update.CheckPreRelease"
        onChange={(CheckPreReleaseUpdate) => onPatch("CheckUpdateItem", { CheckPreReleaseUpdate })}
      />
      <TextField
        label="Update.SelectedTargets"
        onChange={(value) => onPatch("CheckUpdateItem", { SelectedCoreTypes: parseSelectedCoreTypes(value) })}
        value={config.CheckUpdateItem.SelectedCoreTypes?.join(", ") ?? ""}
      />
      <TextField
        label="Const.CdnBaseUrl"
        onChange={(CdnBaseUrl) => onPatch("ConstItem", { CdnBaseUrl: nullableText(CdnBaseUrl) })}
        value={config.ConstItem.CdnBaseUrl ?? ""}
      />
      <TextField
        label="Const.CdnReleaseIndexUrl"
        onChange={(CdnReleaseIndexUrl) => onPatch("ConstItem", { CdnReleaseIndexUrl: nullableText(CdnReleaseIndexUrl) })}
        value={config.ConstItem.CdnReleaseIndexUrl ?? ""}
      />
      <TextField
        label="Const.CdnCoreManifestUrl"
        onChange={(CdnCoreManifestUrl) => onPatch("ConstItem", { CdnCoreManifestUrl: nullableText(CdnCoreManifestUrl) })}
        value={config.ConstItem.CdnCoreManifestUrl ?? ""}
      />
      <TextField
        label="Const.SubConvertUrl"
        onChange={(SubConvertUrl) => onPatch("ConstItem", { SubConvertUrl: nullableText(SubConvertUrl) })}
        value={config.ConstItem.SubConvertUrl ?? ""}
      />
    </div>
  );
}

function BooleanField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Label className="flex h-9 cursor-pointer items-center justify-between gap-3 rounded-md border bg-card px-3 text-sm">
      <span className="truncate">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </Label>
  );
}

function TextField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input className="bg-card" onChange={(event) => onChange(event.currentTarget.value)} value={value} />
    </div>
  );
}

function NumberField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number | null) => void;
  value: number | null;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        className="bg-card"
        onChange={(event) => {
          const text = event.currentTarget.value.trim();
          onChange(text ? Number(text) : null);
        }}
        type="number"
        value={value ?? ""}
      />
    </div>
  );
}

function SelectField({
  label,
  onChange,
  optionLabel = (value) => value,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  optionLabel?: (value: string) => string;
  options: string[];
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {optionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function parseSelectedCoreTypes(value: string) {
  const selectedCoreTypes: string[] = [];

  for (const item of value.split(",")) {
    const selectedCoreType = item.trim();
    if (selectedCoreType) {
      selectedCoreTypes.push(selectedCoreType);
    }
  }

  return selectedCoreTypes;
}

function nullableText(value: string): string | null {
  return value.trim() ? value : null;
}

function withRuntimeDefaults(config: AppConfig_Serialize): AppConfig_Serialize {
  const loose = config as AppConfig_Serialize & Record<string, unknown>;

  return {
    ...config,
    CheckUpdateItem: {
      CheckPreReleaseUpdate: false,
      ...(loose.CheckUpdateItem as Record<string, unknown> | undefined),
    },
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
    Fragment4RayItem: {
      ...(loose.Fragment4RayItem as Record<string, unknown> | undefined),
    },
    HysteriaItem: {
      ...(loose.HysteriaItem as Record<string, unknown> | undefined),
    },
    Mux4RayItem: {
      ...(loose.Mux4RayItem as Record<string, unknown> | undefined),
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
