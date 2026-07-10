import { useI18n } from "@voya/i18n/use-i18n";

import { NETWORK_OPTIONS } from "./profile-constants";
import {
  Panel,
  SelectField,
  TextField,
  type ProfileFormControl,
  type Register,
} from "./profile-form-fields";
import { optionalNumber } from "./profile-form-utils";

type TransportPanelProps = {
  control: ProfileFormControl;
  register: Register;
};

export function TransportPanel({ control, register }: TransportPanelProps) {
  const { t } = useI18n();

  return (
    <Panel title={t("panes.profiles.panels.transport")}>
      <div className="grid gap-3 lg:grid-cols-4">
        <SelectField control={control} label={t("panes.profiles.fields.network")} name="Network" options={NETWORK_OPTIONS} />
        <TextField label={t("panes.profiles.fields.host")} {...register("TransportExtra.Host")} />
        <TextField label={t("panes.profiles.fields.path")} {...register("TransportExtra.Path")} />
        <TextField label={t("panes.profiles.fields.rawHeader")} placeholder="none" {...register("TransportExtra.RawHeaderType")} />
        <TextField label={t("panes.profiles.fields.xhttpMode")} {...register("TransportExtra.XhttpMode")} />
        <TextField label={t("panes.profiles.fields.xhttpExtra")} {...register("TransportExtra.XhttpExtra")} />
        <TextField label={t("panes.profiles.fields.grpcAuthority")} {...register("TransportExtra.GrpcAuthority")} />
        <TextField label={t("panes.profiles.fields.grpcService")} {...register("TransportExtra.GrpcServiceName")} />
        <TextField label={t("panes.profiles.fields.grpcMode")} {...register("TransportExtra.GrpcMode")} />
        <TextField label={t("panes.profiles.fields.kcpHeader")} {...register("TransportExtra.KcpHeaderType")} />
        <TextField label={t("panes.profiles.fields.kcpSeed")} {...register("TransportExtra.KcpSeed")} />
        <TextField
          inputMode="numeric"
          label={t("panes.profiles.fields.kcpMtu")}
          type="number"
          {...register("TransportExtra.KcpMtu", { setValueAs: optionalNumber })}
        />
      </div>
    </Panel>
  );
}
