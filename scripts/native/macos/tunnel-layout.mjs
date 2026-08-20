import { resolve } from "node:path";

export const appBundleIdentifier = "app.voyavpn.desktop";
export const packetTunnelBundleIdentifier = "app.voyavpn.desktop.PacketTunnel";

export function normalizeDistribution(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "auto") {
    return "auto";
  }
  if (["developer-id", "developerid", "notarized", "dmg"].includes(normalized)) {
    return "developer-id";
  }
  if (["app-store", "appstore", "testflight", "mas", "development", "debug"].includes(normalized)) {
    return "app-store";
  }
  throw new Error("VOYAVPN_MACOS_DISTRIBUTION must be auto, developer-id, or app-store.");
}

export function distributionFromIdentityName(identityName, explicitValue) {
  const explicit = normalizeDistribution(explicitValue);
  if (explicit !== "auto") {
    return explicit;
  }

  const name = String(identityName ?? "");
  if (name.includes("3rd Party Mac Developer") || name.includes("Apple Distribution")) {
    return "app-store";
  }
  if (name.includes("Developer ID Application")) {
    return "developer-id";
  }

  return "app-store";
}

export function packagingModeForDistribution(distribution) {
  return distribution === "developer-id" ? "system-extension" : "app-extension";
}

export function requiredNetworkExtensionValue(distribution) {
  return distribution === "developer-id" ? "packet-tunnel-provider-systemextension" : "packet-tunnel-provider";
}

export function packetTunnelLayout(appContents, distribution) {
  const mode = packagingModeForDistribution(distribution);
  const base =
    mode === "system-extension"
      ? resolve(appContents, "Library", "SystemExtensions", `${packetTunnelBundleIdentifier}.systemextension`)
      : resolve(appContents, "PlugIns", `${packetTunnelBundleIdentifier}.appex`);
  const contents = resolve(base, "Contents");
  const label = mode === "system-extension" ? "PacketTunnel system extension" : "PacketTunnel appex";

  return {
    binary: resolve(contents, "MacOS", "VoyaPacketTunnel"),
    bundle: base,
    contents,
    embeddedLibboxFramework: resolve(contents, "Frameworks", "Libbox.framework"),
    frameworks: resolve(contents, "Frameworks"),
    infoPackageType: mode === "system-extension" ? "SYSX" : "XPC!",
    label,
    mode,
    provisioningProfile: resolve(contents, "embedded.provisionprofile"),
  };
}

export function incompatiblePacketTunnelBundle(appContents, distribution) {
  const oppositeDistribution = distribution === "developer-id" ? "app-store" : "developer-id";
  return packetTunnelLayout(appContents, oppositeDistribution).bundle;
}
