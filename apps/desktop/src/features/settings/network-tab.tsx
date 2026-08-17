import { Separator } from "@voya/ui/components/separator";
import { useI18n } from "@voya/i18n/use-i18n";

import { CheckboxField, NumberField, TextField } from "./runtime-fields";
import { SettingsCheckboxGroup, SettingsGroup, SettingsRow } from "./settings-form";
import type { SettingsBundleController } from "./use-settings-bundle";

export function NetworkTab({ controller }: { controller: SettingsBundleController }) {
  const { t } = useI18n();
  const { bundle, error, update, working } = controller;

  if (!bundle) {
    return <p className="text-xs text-muted-foreground">{working ? t("options.loading") : error}</p>;
  }

  const patchTun = (patch: Partial<typeof bundle.network.tun>) =>
    update((current) => ({
      ...current,
      network: {
        ...current.network,
        tun: { ...current.network.tun, ...patch },
      },
    }));
  const patchSystemProxy = (patch: Partial<typeof bundle.network.systemProxy>) =>
    update((current) => ({
      ...current,
      network: {
        ...current.network,
        systemProxy: { ...current.network.systemProxy, ...patch },
      },
    }));

  return (
    <div className="grid gap-4">
      <SettingsGroup>
        <SettingsCheckboxGroup id="rt-tun-group" label={t("resx.TbSettingsTunMode")}>
          <CheckboxField checked={bundle.network.tun.autoRoute} label={t("resx.TbSettingsTunAutoRoute")} onChange={(autoRoute) => patchTun({ autoRoute })} />
          <CheckboxField checked={bundle.network.tun.strictRoute} label={t("resx.TbSettingsTunStrictRoute")} onChange={(strictRoute) => patchTun({ strictRoute })} />
          <CheckboxField checked={bundle.network.tun.enableIpv6Address} label={t("resx.TbSettingsEnableIPv6Address")} onChange={(enableIpv6Address) => patchTun({ enableIpv6Address })} />
        </SettingsCheckboxGroup>
        <TextField id="rt-tun-stack" label={t("resx.TbSettingsTunStack")} onChange={(stack) => patchTun({ stack })} value={bundle.network.tun.stack} />
        <NumberField id="rt-tun-mtu" label={t("resx.TbMtu")} onChange={(mtu) => patchTun({ mtu: mtu ?? 1500 })} value={bundle.network.tun.mtu} />
        <TextField id="rt-tun-icmp-routing" label={t("resx.TbIcmpRoutingPolicy")} onChange={(icmpRouting) => patchTun({ icmpRouting })} value={bundle.network.tun.icmpRouting} />
      </SettingsGroup>

      <Separator />

      <SettingsGroup>
        <SettingsRow>
          <CheckboxField checked={bundle.network.systemProxy.notProxyLocalAddress} label={t("resx.TbSettingsNotProxyLocalAddress")} onChange={(notProxyLocalAddress) => patchSystemProxy({ notProxyLocalAddress })} />
        </SettingsRow>
        <TextField id="rt-sysproxy-exceptions" label={t("resx.TbSettingsException")} onChange={(systemProxyExceptions) => patchSystemProxy({ systemProxyExceptions })} value={bundle.network.systemProxy.systemProxyExceptions} />
        <TextField id="rt-sysproxy-advanced-protocol" label={t("resx.TbSettingsAdvancedProtocol")} onChange={(systemProxyAdvancedProtocol) => patchSystemProxy({ systemProxyAdvancedProtocol })} value={bundle.network.systemProxy.systemProxyAdvancedProtocol} />
        <TextField id="rt-sysproxy-pac-path" label={t("resx.TbSettingsCustomSystemProxyPacPath")} onChange={(value) => patchSystemProxy({ customSystemProxyPacPath: nullableText(value) })} value={bundle.network.systemProxy.customSystemProxyPacPath ?? ""} />
        <TextField id="rt-sysproxy-script-path" label={t("resx.TbSettingsCustomSystemProxyScriptPath")} onChange={(value) => patchSystemProxy({ customSystemProxyScriptPath: nullableText(value) })} value={bundle.network.systemProxy.customSystemProxyScriptPath ?? ""} />
      </SettingsGroup>
    </div>
  );
}

function nullableText(value: string): string | null {
  return value.trim() ? value : null;
}
