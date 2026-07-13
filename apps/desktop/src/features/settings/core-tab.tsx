import { Separator } from "@voya/ui/components/separator";
import { useI18n } from "@voya/i18n/use-i18n";

import { CheckboxField, NumberField, SelectField, TextField } from "./runtime-fields";
import { RuntimeSaveRow } from "./runtime-save-row";
import { SettingsCheckboxGroup, SettingsGroup, SettingsRow } from "./settings-form";
import { nullableText, type RuntimeConfigController } from "./use-runtime-config";

export function CoreTab({ controller }: { controller: RuntimeConfigController }) {
  const { t } = useI18n();
  const { config, error, patchSection, working } = controller;

  if (!config) {
    return <p className="text-xs text-muted-foreground">{working ? t("options.loading") : error}</p>;
  }

  return (
    <div className="grid gap-4">
      <SettingsGroup>
        <SettingsCheckboxGroup id="rt-core-basics" label={t("resx.TbSettingsCore")}>
          <CheckboxField
            checked={config.CoreBasicItem.LogEnabled}
            label={t("resx.TbSettingsLogEnabled")}
            onChange={(LogEnabled) => patchSection("CoreBasicItem", { LogEnabled })}
          />
          <CheckboxField
            checked={config.CoreBasicItem.DefAllowInsecure}
            label={t("resx.TbSettingsDefAllowInsecure")}
            onChange={(DefAllowInsecure) => patchSection("CoreBasicItem", { DefAllowInsecure })}
          />
          <CheckboxField
            checked={config.CoreBasicItem.MuxEnabled}
            label={t("resx.TbSettingsMuxEnabled")}
            onChange={(MuxEnabled) => patchSection("CoreBasicItem", { MuxEnabled })}
          />
          <CheckboxField
            checked={config.CoreBasicItem.EnableFragment}
            label={t("resx.TbSettingsEnableFragment")}
            onChange={(EnableFragment) => patchSection("CoreBasicItem", { EnableFragment })}
          />
          <CheckboxField
            checked={config.CoreBasicItem.EnableCacheFile4Sbox}
            label={t("resx.TbSettingsEnableCacheFile4Sbox")}
            onChange={(EnableCacheFile4Sbox) => patchSection("CoreBasicItem", { EnableCacheFile4Sbox })}
          />
        </SettingsCheckboxGroup>
        <SelectField
          id="rt-loglevel"
          label={t("resx.TbSettingsLogLevel")}
          onChange={(Loglevel) => patchSection("CoreBasicItem", { Loglevel })}
          options={["none", "trace", "debug", "info", "warn", "warning", "error"]}
          value={config.CoreBasicItem.Loglevel}
        />
        <TextField
          id="rt-fingerprint"
          label={t("resx.TbSettingsDefFingerprint")}
          onChange={(DefFingerprint) => patchSection("CoreBasicItem", { DefFingerprint })}
          value={config.CoreBasicItem.DefFingerprint}
        />
        <TextField
          id="rt-user-agent"
          label={t("resx.TbSettingsDefUserAgent")}
          onChange={(DefUserAgent) => patchSection("CoreBasicItem", { DefUserAgent })}
          value={config.CoreBasicItem.DefUserAgent}
        />
        <TextField
          id="rt-send-through"
          label={t("resx.TbSettingsSendThrough")}
          onChange={(SendThrough) => patchSection("CoreBasicItem", { SendThrough: nullableText(SendThrough) })}
          value={config.CoreBasicItem.SendThrough ?? ""}
        />
        <TextField
          id="rt-bind-interface"
          label={t("resx.TbSettingsBindInterface")}
          onChange={(BindInterface) =>
            patchSection("CoreBasicItem", { BindInterface: nullableText(BindInterface) })
          }
          value={config.CoreBasicItem.BindInterface ?? ""}
        />
      </SettingsGroup>

      <Separator />

      <SettingsGroup>
        <NumberField
          id="rt-mux-concurrency"
          label={t("settings.fields.muxConcurrency")}
          onChange={(Concurrency) => patchSection("Mux4RayItem", { Concurrency })}
          value={config.Mux4RayItem.Concurrency ?? null}
        />
        <NumberField
          id="rt-mux-xudp-concurrency"
          label={t("settings.fields.muxXudpConcurrency")}
          onChange={(XudpConcurrency) => patchSection("Mux4RayItem", { XudpConcurrency })}
          value={config.Mux4RayItem.XudpConcurrency ?? null}
        />
        <TextField
          id="rt-mux-xudp-proxy"
          label={t("settings.fields.muxXudpProxyUdp443")}
          onChange={(XudpProxyUDP443) =>
            patchSection("Mux4RayItem", { XudpProxyUDP443: nullableText(XudpProxyUDP443) })
          }
          value={config.Mux4RayItem.XudpProxyUDP443 ?? ""}
        />
        <TextField
          id="rt-mux-sbox-protocol"
          label={t("resx.TbSettingsMux4SboxProtocol")}
          onChange={(Protocol) => patchSection("Mux4SboxItem", { Protocol })}
          value={config.Mux4SboxItem.Protocol}
        />
        <NumberField
          id="rt-mux-sbox-max-connections"
          label={t("settings.fields.muxMaxConnections")}
          onChange={(MaxConnections) => patchSection("Mux4SboxItem", { MaxConnections: MaxConnections ?? 0 })}
          value={config.Mux4SboxItem.MaxConnections}
        />
        <SettingsRow>
          <CheckboxField
            checked={config.Mux4SboxItem.Padding ?? false}
            label={t("settings.fields.muxPadding")}
            onChange={(Padding) => patchSection("Mux4SboxItem", { Padding })}
          />
        </SettingsRow>
      </SettingsGroup>

      <Separator />

      <SettingsGroup>
        <TextField
          id="rt-fragment-packets"
          label={t("settings.fields.fragmentPackets")}
          onChange={(Packets) => patchSection("Fragment4RayItem", { Packets: nullableText(Packets) })}
          value={config.Fragment4RayItem.Packets ?? ""}
        />
        <TextField
          id="rt-fragment-length"
          label={t("settings.fields.fragmentLength")}
          onChange={(Length) => patchSection("Fragment4RayItem", { Length: nullableText(Length) })}
          value={config.Fragment4RayItem.Length ?? ""}
        />
        <TextField
          id="rt-fragment-interval"
          label={t("settings.fields.fragmentInterval")}
          onChange={(Interval) => patchSection("Fragment4RayItem", { Interval: nullableText(Interval) })}
          value={config.Fragment4RayItem.Interval ?? ""}
        />
      </SettingsGroup>

      <Separator />

      <SettingsRow>
        <RuntimeSaveRow controller={controller} />
      </SettingsRow>
    </div>
  );
}
