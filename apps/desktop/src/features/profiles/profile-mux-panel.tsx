import { useI18n } from "@voya/i18n/use-i18n";

import {
  CheckboxField,
  Panel,
  ToggleButton,
  type ProfileFormControl,
} from "./profile-form-fields";

type MuxPanelProps = {
  allowInsecure: boolean;
  control: ProfileFormControl;
  muxEnabled: boolean;
  setAllowInsecure: (enabled: boolean) => void;
  setMuxEnabled: (enabled: boolean) => void;
};

export function MuxPanel({
  allowInsecure,
  control,
  muxEnabled,
  setAllowInsecure,
  setMuxEnabled,
}: MuxPanelProps) {
  const { t } = useI18n();

  return (
    <Panel title={t("panes.profiles.panels.mux")}>
      <div className="grid gap-3 lg:grid-cols-4">
        <ToggleButton
          checked={muxEnabled}
          description={t("panes.profiles.fields.muxEnabledHint")}
          label={t("panes.profiles.fields.muxEnabled")}
          onCheckedChange={setMuxEnabled}
        />
        <ToggleButton
          checked={allowInsecure}
          description={t("panes.profiles.fields.allowInsecureTlsHint")}
          label={t("panes.profiles.fields.allowInsecureTls")}
          onCheckedChange={setAllowInsecure}
        />
        <CheckboxField control={control} label={t("panes.profiles.fields.displayLog")} name="DisplayLog" />
      </div>
    </Panel>
  );
}
