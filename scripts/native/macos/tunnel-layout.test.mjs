import { describe, expect, it } from "vitest";

import {
  distributionFromIdentityName,
  incompatiblePacketTunnelBundle,
  packetTunnelLayout,
  packagingModeForDistribution,
  requiredNetworkExtensionValue,
} from "./tunnel-layout.mjs";

describe("macOS native tunnel layout", () => {
  const appContents = "/Applications/VoyaVPN.app/Contents";

  it("uses system extension packaging for Developer ID", () => {
    const layout = packetTunnelLayout(appContents, "developer-id");

    expect(packagingModeForDistribution("developer-id")).toBe("system-extension");
    expect(requiredNetworkExtensionValue("developer-id")).toBe("packet-tunnel-provider-systemextension");
    expect(layout.infoPackageType).toBe("SYSX");
    expect(layout.bundle).toBe(
      "/Applications/VoyaVPN.app/Contents/Library/SystemExtensions/app.voyavpn.desktop.PacketTunnel.systemextension",
    );
    expect(incompatiblePacketTunnelBundle(appContents, "developer-id")).toBe(
      "/Applications/VoyaVPN.app/Contents/PlugIns/app.voyavpn.desktop.PacketTunnel.appex",
    );
  });

  it("uses app extension packaging for App Store and development lanes", () => {
    const layout = packetTunnelLayout(appContents, "app-store");

    expect(packagingModeForDistribution("app-store")).toBe("app-extension");
    expect(requiredNetworkExtensionValue("app-store")).toBe("packet-tunnel-provider");
    expect(layout.infoPackageType).toBe("XPC!");
    expect(layout.bundle).toBe(
      "/Applications/VoyaVPN.app/Contents/PlugIns/app.voyavpn.desktop.PacketTunnel.appex",
    );
  });

  it("infers distribution from signing identity names", () => {
    expect(
      distributionFromIdentityName("Developer ID Application: Beijing Wangcai Technology Co., Ltd. (4LUKJ56532)", "auto"),
    ).toBe("developer-id");
    expect(distributionFromIdentityName("Apple Distribution: Example Team", "auto")).toBe("app-store");
    expect(distributionFromIdentityName("", "auto")).toBe("app-store");
  });
});
