import { Separator } from "@voya/ui/components/separator";
import { useI18n } from "@voya/i18n/use-i18n";

import { CheckboxField, NumberField, SelectField, TextField } from "./runtime-fields";
import { SettingsCheckboxGroup, SettingsGroup, SettingsRow } from "./settings-form";
import type { SettingsBundleController } from "./use-settings-bundle";

export function CoreTab({ controller }: { controller: SettingsBundleController }) {
  const { t } = useI18n();
  const { bundle, error, update, working } = controller;

  if (!bundle) {
    return <p className="text-xs text-muted-foreground">{working ? t("options.loading") : error}</p>;
  }

  const patchCore = (patch: Partial<typeof bundle.coreBasicItem>) =>
    update((current) => ({
      ...current,
      coreBasicItem: { ...current.coreBasicItem, ...patch },
    }));
  const patchMux = (patch: Partial<typeof bundle.mux4SboxItem>) =>
    update((current) => ({
      ...current,
      mux4SboxItem: { ...current.mux4SboxItem, ...patch },
    }));
  const patchHysteria = (patch: Partial<typeof bundle.hysteriaItem>) =>
    update((current) => ({
      ...current,
      hysteriaItem: { ...current.hysteriaItem, ...patch },
    }));

  return (
    <div className="grid gap-4">
      <SettingsGroup>
        <SettingsCheckboxGroup id="rt-core-basics" label={t("resx.TbSettingsCore")}>
          <CheckboxField checked={bundle.coreBasicItem.LogEnabled} label={t("resx.TbSettingsLogEnabled")} onChange={(LogEnabled) => patchCore({ LogEnabled })} />
          <CheckboxField checked={bundle.coreBasicItem.DefAllowInsecure} label={t("resx.TbSettingsDefAllowInsecure")} onChange={(DefAllowInsecure) => patchCore({ DefAllowInsecure })} />
          <CheckboxField checked={bundle.coreBasicItem.MuxEnabled} label={t("resx.TbSettingsMuxEnabled")} onChange={(MuxEnabled) => patchCore({ MuxEnabled })} />
          <CheckboxField checked={bundle.coreBasicItem.EnableFragment} label={t("resx.TbSettingsEnableFragment")} onChange={(EnableFragment) => patchCore({ EnableFragment })} />
          <CheckboxField checked={bundle.coreBasicItem.EnableCacheFile4Sbox} label={t("resx.TbSettingsEnableCacheFile4Sbox")} onChange={(EnableCacheFile4Sbox) => patchCore({ EnableCacheFile4Sbox })} />
        </SettingsCheckboxGroup>
        <SelectField id="rt-loglevel" label={t("resx.TbSettingsLogLevel")} onChange={(Loglevel) => patchCore({ Loglevel })} options={["none", "trace", "debug", "info", "warn", "warning", "error"]} value={bundle.coreBasicItem.Loglevel} />
        <TextField id="rt-fingerprint" label={t("resx.TbSettingsDefFingerprint")} onChange={(DefFingerprint) => patchCore({ DefFingerprint })} value={bundle.coreBasicItem.DefFingerprint} />
        <TextField id="rt-user-agent" label={t("resx.TbSettingsDefUserAgent")} onChange={(DefUserAgent) => patchCore({ DefUserAgent })} value={bundle.coreBasicItem.DefUserAgent} />
        <TextField id="rt-send-through" label={t("resx.TbSettingsSendThrough")} onChange={(SendThrough) => patchCore({ SendThrough: nullableText(SendThrough) })} value={bundle.coreBasicItem.SendThrough ?? ""} />
        <TextField id="rt-bind-interface" label={t("resx.TbSettingsBindInterface")} onChange={(BindInterface) => patchCore({ BindInterface: nullableText(BindInterface) })} value={bundle.coreBasicItem.BindInterface ?? ""} />
      </SettingsGroup>

      <Separator />

      <SettingsGroup>
        <TextField id="rt-mux-sbox-protocol" label={t("resx.TbSettingsMux4SboxProtocol")} onChange={(Protocol) => patchMux({ Protocol })} value={bundle.mux4SboxItem.Protocol} />
        <NumberField id="rt-mux-sbox-max-connections" label={t("settings.fields.muxMaxConnections")} onChange={(MaxConnections) => patchMux({ MaxConnections: MaxConnections ?? 0 })} value={bundle.mux4SboxItem.MaxConnections} />
        <SettingsRow>
          <CheckboxField checked={bundle.mux4SboxItem.Padding ?? false} label={t("settings.fields.muxPadding")} onChange={(Padding) => patchMux({ Padding })} />
        </SettingsRow>
      </SettingsGroup>

      <Separator />

      <SettingsGroup>
        <SettingsRow>
          <p className="text-xs font-medium text-muted-foreground">{t("resx.TbSettingsHysteriaBandwidth")}</p>
        </SettingsRow>
        <NumberField id="rt-hysteria-up" label={t("settings.fields.hysteriaUpMbps")} onChange={(UpMbps) => patchHysteria({ UpMbps: UpMbps ?? 0 })} value={bundle.hysteriaItem.UpMbps ?? null} />
        <NumberField id="rt-hysteria-down" label={t("settings.fields.hysteriaDownMbps")} onChange={(DownMbps) => patchHysteria({ DownMbps: DownMbps ?? 0 })} value={bundle.hysteriaItem.DownMbps ?? null} />
        <NumberField id="rt-hysteria-hop-interval" label={t("resx.TbHopInt7")} onChange={(HopInterval) => patchHysteria({ HopInterval: HopInterval ?? 5 })} value={bundle.hysteriaItem.HopInterval ?? null} />
      </SettingsGroup>
    </div>
  );
}

function nullableText(value: string): string | null {
  return value.trim() ? value : null;
}
