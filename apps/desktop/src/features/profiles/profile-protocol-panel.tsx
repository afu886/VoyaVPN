import type { UseFormGetValues, UseFormSetValue } from "react-hook-form";

import { useI18n } from "@voya/i18n/use-i18n";
import { GroupBuilder } from "@/features/groups";

import { CONFIG_TYPES, type ProfileProtocol } from "./profile-constants";
import {
  CheckboxField,
  Panel,
  TextField,
  type ProfileFormControl,
  type Register,
} from "./profile-form-fields";
import { passwordLabel, requiresUsername, optionalNumber } from "./profile-form-utils";
import type { ProfileFormValues } from "./profile-form-schema";

type ProtocolPanelProps = {
  configType: ProfileProtocol;
  control: ProfileFormControl;
  getValues: UseFormGetValues<ProfileFormValues>;
  register: Register;
  setValue: UseFormSetValue<ProfileFormValues>;
};

export function ProtocolPanel({
  configType,
  control,
  getValues,
  register,
  setValue,
}: ProtocolPanelProps) {
  const { t } = useI18n();

  if (configType === CONFIG_TYPES.PolicyGroup || configType === CONFIG_TYPES.ProxyChain) {
    return (
      <Panel
        title={
          configType === CONFIG_TYPES.PolicyGroup
            ? t("panes.profiles.panels.policyGroup")
            : t("panes.profiles.panels.proxyChain")
        }
      >
        <GroupBuilder
          configType={configType}
          control={control}
          getValues={getValues}
          register={register}
          setValue={setValue}
        />
      </Panel>
    );
  }

  if (configType === CONFIG_TYPES.Custom) {
    return (
      <Panel title={t("panes.profiles.panels.custom")}>
        <div className="grid gap-3 lg:grid-cols-2">
          <TextField label={t("panes.profiles.fields.configSource")} {...register("Address")} />
          <TextField label={t("panes.profiles.fields.filter")} {...register("ProtocolExtra.Filter")} />
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={t("panes.profiles.panels.protocol")}>
      <div className="grid gap-3 lg:grid-cols-3">
        {requiresUsername(configType) ? (
          <TextField label={t("panes.profiles.fields.username")} {...register("Username")} />
        ) : null}
        <TextField label={passwordLabel(configType, t)} {...register("Password")} />
        {configType === CONFIG_TYPES.VMess ? (
          <>
            <TextField label={t("panes.profiles.fields.alterId")} {...register("ProtocolExtra.AlterId")} />
            <TextField label={t("panes.profiles.fields.vmessSecurity")} placeholder="auto" {...register("ProtocolExtra.VmessSecurity")} />
          </>
        ) : null}
        {configType === CONFIG_TYPES.VLESS ? (
          <>
            <TextField label={t("panes.profiles.fields.flow")} placeholder="xtls-rprx-vision" {...register("ProtocolExtra.Flow")} />
            <TextField label={t("panes.profiles.fields.encryption")} placeholder="none" {...register("ProtocolExtra.VlessEncryption")} />
          </>
        ) : null}
        {configType === CONFIG_TYPES.Shadowsocks ? (
          <>
            <TextField label={t("panes.profiles.fields.method")} placeholder="2022-blake3-aes-128-gcm" {...register("ProtocolExtra.SsMethod")} />
            <CheckboxField control={control} label={t("panes.profiles.fields.udpOverTcp")} name="ProtocolExtra.Uot" />
          </>
        ) : null}
        {configType === CONFIG_TYPES.Hysteria2 ? (
          <>
            <TextField label={t("panes.profiles.fields.ports")} {...register("ProtocolExtra.Ports")} />
            <TextField label={t("panes.profiles.fields.salamanderPassword")} {...register("ProtocolExtra.SalamanderPass")} />
          </>
        ) : null}
        {configType === CONFIG_TYPES.TUIC ? (
          <>
            <TextField label={t("panes.profiles.fields.congestionControl")} placeholder="bbr" {...register("ProtocolExtra.CongestionControl")} />
            <TextField
              inputMode="numeric"
              label={t("panes.profiles.fields.insecureConcurrency")}
              type="number"
              {...register("ProtocolExtra.InsecureConcurrency", { setValueAs: optionalNumber })}
            />
          </>
        ) : null}
        {configType === CONFIG_TYPES.WireGuard ? (
          <>
            <TextField label={t("panes.profiles.fields.peerPublicKey")} {...register("ProtocolExtra.WgPublicKey")} />
            <TextField label={t("panes.profiles.fields.presharedKey")} {...register("ProtocolExtra.WgPresharedKey")} />
            <TextField label={t("panes.profiles.fields.interfaceAddress")} {...register("ProtocolExtra.WgInterfaceAddress")} />
            <TextField label={t("panes.profiles.fields.allowedIps")} {...register("ProtocolExtra.WgAllowedIps")} />
            <TextField label={t("panes.profiles.fields.reservedBytes")} {...register("ProtocolExtra.WgReserved")} />
            <TextField
              inputMode="numeric"
              label={t("panes.profiles.fields.mtu")}
              type="number"
              {...register("ProtocolExtra.WgMtu", { setValueAs: optionalNumber })}
            />
          </>
        ) : null}
        {configType === CONFIG_TYPES.Naive ? (
          <CheckboxField control={control} label={t("panes.profiles.fields.quic")} name="ProtocolExtra.NaiveQuic" />
        ) : null}
      </div>
    </Panel>
  );
}
