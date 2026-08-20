import { describe, expect, it } from "vitest";

import type { Profile, ProfileProtocol, ProfileTransport } from "@/ipc/bindings";

import { profileAddress, profilePort, profileTransportName } from "./profile-display";

describe("profile display projections", () => {
  it("projects server, custom, and group addresses", () => {
    expect(profileAddress(profile({ kind: "trojan", password: "secret", server: { address: "node.example", port: 443 } }))).toBe("node.example");
    expect(profileAddress(profile({ filter: null, kind: "custom", source: "custom.json" }))).toBe("custom.json");
    expect(profileAddress(profile({ childProfileIds: [], kind: "proxyChain" }))).toBe("");
    expect(profilePort(profile({ kind: "trojan", password: "secret", server: { address: "node.example", port: 8443 } }))).toBe(8443);
    expect(profilePort(profile({ childProfileIds: [], kind: "proxyChain" }))).toBe(0);
  });

  it.each([
    [null, "tcp"],
    [{ header: null, host: null, kind: "tcp", path: null }, "tcp"],
    [{ host: null, kind: "websocket", path: null }, "ws"],
    [{ host: null, kind: "httpUpgrade", path: null }, "httpupgrade"],
    [{ host: null, kind: "http2", path: null }, "h2"],
    [{ authority: null, kind: "grpc", mode: null, serviceName: null }, "grpc"],
  ] as Array<[ProfileTransport | null, string]>)("maps %j to %s", (transport, expected) => {
    expect(profileTransportName(transport)).toBe(expected);
  });
});

function profile(protocol: ProfileProtocol): Profile {
  return { displayLog: true, id: "p", protocol, remarks: "node", subscriptionId: null, tls: null, transport: null };
}
