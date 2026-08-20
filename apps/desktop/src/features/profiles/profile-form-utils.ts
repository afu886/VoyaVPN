import { CONFIG_TYPES, type ProfileProtocol } from "./profile-constants";
import type { TranslationFunction } from "@voya/i18n";

export function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

export function addressLabel(configType: ProfileProtocol, t: TranslationFunction) {
  if (configType === CONFIG_TYPES.Custom) {
    return t("panes.profiles.fields.addressConfig");
  }
  if (configType === CONFIG_TYPES.PolicyGroup) {
    return t("panes.profiles.fields.addressGroupTag");
  }
  if (configType === CONFIG_TYPES.ProxyChain) {
    return t("panes.profiles.fields.addressChainTag");
  }

  return t("panes.profiles.fields.address");
}

export function passwordLabel(configType: ProfileProtocol, t: TranslationFunction) {
  if (
    configType === CONFIG_TYPES.VMess ||
    configType === CONFIG_TYPES.VLESS ||
    configType === CONFIG_TYPES.TUIC
  ) {
    return t("panes.profiles.fields.uuid");
  }
  if (configType === CONFIG_TYPES.WireGuard) {
    return t("panes.profiles.fields.privateKey");
  }

  return t("panes.profiles.fields.password");
}

export function requiresUsername(configType: ProfileProtocol) {
  return configType === CONFIG_TYPES.SOCKS || configType === CONFIG_TYPES.HTTP || configType === CONFIG_TYPES.Naive;
}
