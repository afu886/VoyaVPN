import { Separator } from "@voya/ui/components/separator";
import { useI18n } from "@voya/i18n/use-i18n";

import { NumberField, TextField } from "./runtime-fields";
import { RuntimeSaveRow } from "./runtime-save-row";
import { SettingsGroup, SettingsRow } from "./settings-form";
import { nullableText, type RuntimeConfigController } from "./use-runtime-config";

export function TestsTab({ controller }: { controller: RuntimeConfigController }) {
  const { t } = useI18n();
  const { config, error, patchSection, working } = controller;

  if (!config) {
    return <p className="text-xs text-muted-foreground">{working ? t("options.loading") : error}</p>;
  }

  return (
    <div className="grid gap-4">
      <SettingsGroup>
        <NumberField
          id="rt-speedtest-timeout"
          label={t("resx.TbSettingsSpeedTestTimeout")}
          onChange={(SpeedTestTimeout) =>
            patchSection("SpeedTestItem", { SpeedTestTimeout: SpeedTestTimeout ?? 0 })
          }
          value={config.SpeedTestItem.SpeedTestTimeout}
        />
        <NumberField
          id="rt-speedtest-concurrency"
          label={t("resx.TbSettingsMixedConcurrencyCount")}
          onChange={(MixedConcurrencyCount) =>
            patchSection("SpeedTestItem", { MixedConcurrencyCount: MixedConcurrencyCount ?? 0 })
          }
          value={config.SpeedTestItem.MixedConcurrencyCount}
        />
        <TextField
          id="rt-speedtest-url"
          label={t("resx.TbSettingsSpeedTestUrl")}
          onChange={(SpeedTestUrl) => patchSection("SpeedTestItem", { SpeedTestUrl })}
          value={config.SpeedTestItem.SpeedTestUrl}
        />
        <TextField
          id="rt-speedtest-ping-url"
          label={t("resx.TbSettingsSpeedPingTestUrl")}
          onChange={(SpeedPingTestUrl) => patchSection("SpeedTestItem", { SpeedPingTestUrl })}
          value={config.SpeedTestItem.SpeedPingTestUrl}
        />
        <TextField
          id="rt-speedtest-ipapi-url"
          label={t("resx.TbSettingsIPAPIUrl")}
          onChange={(IPAPIUrl) => patchSection("SpeedTestItem", { IPAPIUrl })}
          value={config.SpeedTestItem.IPAPIUrl}
        />
        <TextField
          id="rt-speedtest-udp-target"
          label={t("resx.TbSettingsUdpTestUrl")}
          onChange={(UdpTestTarget) => patchSection("SpeedTestItem", { UdpTestTarget })}
          value={config.SpeedTestItem.UdpTestTarget}
        />
        <NumberField
          id="rt-speedtest-page-size"
          label={t("settings.fields.speedTestPageSize")}
          onChange={(SpeedTestPageSize) => patchSection("SpeedTestItem", { SpeedTestPageSize })}
          value={config.SpeedTestItem.SpeedTestPageSize ?? null}
        />
        <NumberField
          id="rt-speedtest-delay-interval"
          label={t("settings.fields.speedTestDelayInterval")}
          onChange={(SpeedTestDelayInterval) => patchSection("SpeedTestItem", { SpeedTestDelayInterval })}
          value={config.SpeedTestItem.SpeedTestDelayInterval ?? null}
        />
      </SettingsGroup>

      <Separator />

      <SettingsGroup>
        <NumberField
          id="rt-hysteria-up"
          label={t("settings.fields.hysteriaUpMbps")}
          onChange={(UpMbps) => patchSection("HysteriaItem", { UpMbps: UpMbps ?? undefined })}
          value={config.HysteriaItem.UpMbps ?? null}
        />
        <NumberField
          id="rt-hysteria-down"
          label={t("settings.fields.hysteriaDownMbps")}
          onChange={(DownMbps) => patchSection("HysteriaItem", { DownMbps: DownMbps ?? undefined })}
          value={config.HysteriaItem.DownMbps ?? null}
        />
        <NumberField
          id="rt-hysteria-hop-interval"
          label={t("resx.TbHopInt7")}
          onChange={(HopInterval) => patchSection("HysteriaItem", { HopInterval: HopInterval ?? undefined })}
          value={config.HysteriaItem.HopInterval ?? null}
        />
      </SettingsGroup>

      <Separator />

      <SettingsGroup>
        <TextField
          id="rt-cdn-base-url"
          label={t("settings.fields.cdnBaseUrl")}
          onChange={(CdnBaseUrl) => patchSection("ConstItem", { CdnBaseUrl: nullableText(CdnBaseUrl) })}
          value={config.ConstItem.CdnBaseUrl ?? ""}
        />
        <TextField
          id="rt-cdn-release-index-url"
          label={t("settings.fields.cdnReleaseIndexUrl")}
          onChange={(CdnReleaseIndexUrl) =>
            patchSection("ConstItem", { CdnReleaseIndexUrl: nullableText(CdnReleaseIndexUrl) })
          }
          value={config.ConstItem.CdnReleaseIndexUrl ?? ""}
        />
        <TextField
          id="rt-cdn-core-manifest-url"
          label={t("settings.fields.cdnCoreManifestUrl")}
          onChange={(CdnCoreManifestUrl) =>
            patchSection("ConstItem", { CdnCoreManifestUrl: nullableText(CdnCoreManifestUrl) })
          }
          value={config.ConstItem.CdnCoreManifestUrl ?? ""}
        />
        <TextField
          id="rt-sub-convert-url"
          label={t("resx.TbSettingsSubConvert")}
          onChange={(SubConvertUrl) => patchSection("ConstItem", { SubConvertUrl: nullableText(SubConvertUrl) })}
          value={config.ConstItem.SubConvertUrl ?? ""}
        />
      </SettingsGroup>

      <Separator />

      <SettingsRow>
        <RuntimeSaveRow controller={controller} />
      </SettingsRow>
    </div>
  );
}
