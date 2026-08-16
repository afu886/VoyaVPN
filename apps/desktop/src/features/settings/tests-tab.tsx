import { useI18n } from "@voya/i18n/use-i18n";

import { NumberField, TextField } from "./runtime-fields";
import { SettingsGroup } from "./settings-form";
import type { SettingsBundleController } from "./use-settings-bundle";

export function TestsTab({ controller }: { controller: SettingsBundleController }) {
  const { t } = useI18n();
  const { bundle, error, update, working } = controller;

  if (!bundle) {
    return <p className="text-xs text-muted-foreground">{working ? t("options.loading") : error}</p>;
  }

  const patchTests = (patch: Partial<typeof bundle.speedTestItem>) =>
    update((current) => ({
      ...current,
      speedTestItem: { ...current.speedTestItem, ...patch },
    }));

  return (
    <div className="grid gap-4">
      <SettingsGroup>
        <NumberField id="rt-speedtest-timeout" label={t("resx.TbSettingsSpeedTestTimeout")} onChange={(SpeedTestTimeout) => patchTests({ SpeedTestTimeout: SpeedTestTimeout ?? 0 })} value={bundle.speedTestItem.SpeedTestTimeout} />
        <NumberField id="rt-speedtest-concurrency" label={t("resx.TbSettingsMixedConcurrencyCount")} onChange={(MixedConcurrencyCount) => patchTests({ MixedConcurrencyCount: MixedConcurrencyCount ?? 0 })} value={bundle.speedTestItem.MixedConcurrencyCount} />
        <TextField id="rt-speedtest-url" label={t("resx.TbSettingsSpeedTestUrl")} onChange={(SpeedTestUrl) => patchTests({ SpeedTestUrl })} value={bundle.speedTestItem.SpeedTestUrl} />
        <TextField id="rt-speedtest-ping-url" label={t("resx.TbSettingsSpeedPingTestUrl")} onChange={(SpeedPingTestUrl) => patchTests({ SpeedPingTestUrl })} value={bundle.speedTestItem.SpeedPingTestUrl} />
        <TextField id="rt-speedtest-ipapi-url" label={t("resx.TbSettingsIPAPIUrl")} onChange={(IPAPIUrl) => patchTests({ IPAPIUrl })} value={bundle.speedTestItem.IPAPIUrl} />
        <TextField id="rt-speedtest-udp-target" label={t("resx.TbSettingsUdpTestUrl")} onChange={(UdpTestTarget) => patchTests({ UdpTestTarget })} value={bundle.speedTestItem.UdpTestTarget} />
        <NumberField id="rt-speedtest-page-size" label={t("settings.fields.speedTestPageSize")} onChange={(SpeedTestPageSize) => patchTests({ SpeedTestPageSize })} value={bundle.speedTestItem.SpeedTestPageSize ?? null} />
        <NumberField id="rt-speedtest-delay-interval" label={t("settings.fields.speedTestDelayInterval")} onChange={(SpeedTestDelayInterval) => patchTests({ SpeedTestDelayInterval })} value={bundle.speedTestItem.SpeedTestDelayInterval ?? null} />
      </SettingsGroup>
    </div>
  );
}
