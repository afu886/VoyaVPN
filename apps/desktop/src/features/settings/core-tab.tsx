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

      <SettingsRow>
        <RuntimeSaveRow controller={controller} />
      </SettingsRow>
    </div>
  );
}
