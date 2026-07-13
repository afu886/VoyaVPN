import { Separator } from "@voya/ui/components/separator";
import { useI18n } from "@voya/i18n/use-i18n";
import type { SysProxyType } from "@/ipc/bindings";

import { CheckboxField, NumberField, SelectField, TextField } from "./runtime-fields";
import { RuntimeSaveRow } from "./runtime-save-row";
import { SettingsCheckboxGroup, SettingsGroup, SettingsRow } from "./settings-form";
import { nullableText, type RuntimeConfigController } from "./use-runtime-config";

const sysProxyOptions: Array<{ labelKey: string; value: SysProxyType }> = [
  { labelKey: "resx.menuSystemProxyClear", value: 0 },
  { labelKey: "resx.menuSystemProxySet", value: 1 },
  { labelKey: "resx.menuSystemProxyNothing", value: 2 },
  { labelKey: "resx.menuSystemProxyPac", value: 3 },
];

export function NetworkTab({ controller }: { controller: RuntimeConfigController }) {
  const { t } = useI18n();
  const { config, error, patchSection, working } = controller;

  if (!config) {
    return <p className="text-xs text-muted-foreground">{working ? t("options.loading") : error}</p>;
  }

  return (
    <div className="grid gap-4">
      <SettingsGroup>
        <SettingsCheckboxGroup id="rt-tun-group" label={t("resx.TbSettingsTunMode")}>
          <CheckboxField
            checked={config.TunModeItem.EnableTun ?? false}
            label={t("resx.TbEnableTunAs")}
            onChange={(EnableTun) => patchSection("TunModeItem", { EnableTun })}
          />
          <CheckboxField
            checked={config.TunModeItem.AutoRoute ?? false}
            label={t("resx.TbSettingsTunAutoRoute")}
            onChange={(AutoRoute) => patchSection("TunModeItem", { AutoRoute })}
          />
          <CheckboxField
            checked={config.TunModeItem.StrictRoute ?? false}
            label={t("resx.TbSettingsTunStrictRoute")}
            onChange={(StrictRoute) => patchSection("TunModeItem", { StrictRoute })}
          />
          <CheckboxField
            checked={config.TunModeItem.EnableIPv6Address ?? false}
            label={t("resx.TbSettingsEnableIPv6Address")}
            onChange={(EnableIPv6Address) => patchSection("TunModeItem", { EnableIPv6Address })}
          />
          <CheckboxField
            checked={config.TunModeItem.EnableLegacyProtect ?? false}
            label={t("resx.TbLegacyProtect")}
            onChange={(EnableLegacyProtect) => patchSection("TunModeItem", { EnableLegacyProtect })}
          />
        </SettingsCheckboxGroup>
        <TextField
          id="rt-tun-stack"
          label={t("resx.TbSettingsTunStack")}
          onChange={(Stack) => patchSection("TunModeItem", { Stack })}
          value={config.TunModeItem.Stack ?? ""}
        />
        <NumberField
          id="rt-tun-mtu"
          label={t("resx.TbMtu")}
          onChange={(Mtu) => patchSection("TunModeItem", { Mtu: Mtu ?? 0 })}
          value={config.TunModeItem.Mtu ?? null}
        />
        <TextField
          id="rt-tun-icmp-routing"
          label={t("resx.TbIcmpRoutingPolicy")}
          onChange={(IcmpRouting) => patchSection("TunModeItem", { IcmpRouting })}
          value={config.TunModeItem.IcmpRouting ?? ""}
        />
      </SettingsGroup>

      <Separator />

      <SettingsGroup>
        <SelectField
          id="rt-sysproxy-type"
          label={t("resx.menuSystemproxy")}
          onChange={(value) => patchSection("SystemProxyItem", { SysProxyType: Number(value) })}
          optionLabel={(value) =>
            t(sysProxyOptions.find((option) => option.value === Number(value))?.labelKey ?? value)
          }
          options={sysProxyOptions.map((option) => String(option.value))}
          value={String(config.SystemProxyItem.SysProxyType)}
        />
        <SettingsRow>
          <CheckboxField
            checked={config.SystemProxyItem.NotProxyLocalAddress}
            label={t("resx.TbSettingsNotProxyLocalAddress")}
            onChange={(NotProxyLocalAddress) => patchSection("SystemProxyItem", { NotProxyLocalAddress })}
          />
        </SettingsRow>
        <TextField
          id="rt-sysproxy-exceptions"
          label={t("resx.TbSettingsException")}
          onChange={(SystemProxyExceptions) => patchSection("SystemProxyItem", { SystemProxyExceptions })}
          value={config.SystemProxyItem.SystemProxyExceptions}
        />
        <TextField
          id="rt-sysproxy-advanced-protocol"
          label={t("resx.TbSettingsAdvancedProtocol")}
          onChange={(SystemProxyAdvancedProtocol) =>
            patchSection("SystemProxyItem", { SystemProxyAdvancedProtocol })
          }
          value={config.SystemProxyItem.SystemProxyAdvancedProtocol}
        />
        <TextField
          id="rt-sysproxy-pac-path"
          label={t("resx.TbSettingsCustomSystemProxyPacPath")}
          onChange={(CustomSystemProxyPacPath) =>
            patchSection("SystemProxyItem", { CustomSystemProxyPacPath: nullableText(CustomSystemProxyPacPath) })
          }
          value={config.SystemProxyItem.CustomSystemProxyPacPath ?? ""}
        />
        <TextField
          id="rt-sysproxy-script-path"
          label={t("resx.TbSettingsCustomSystemProxyScriptPath")}
          onChange={(CustomSystemProxyScriptPath) =>
            patchSection("SystemProxyItem", {
              CustomSystemProxyScriptPath: nullableText(CustomSystemProxyScriptPath),
            })
          }
          value={config.SystemProxyItem.CustomSystemProxyScriptPath ?? ""}
        />
      </SettingsGroup>

      <Separator />

      <SettingsRow>
        <RuntimeSaveRow controller={controller} />
      </SettingsRow>
    </div>
  );
}
