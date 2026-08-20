import { describe, expect, it } from "vitest";

import {
  routingProfileSchema,
  routingRuleSchema,
  zodIssuesToErrorMap,
} from "./routing-form-schema";

describe("strict routing schemas", () => {
  it("accepts canonical HTTPS sources and rule expressions", () => {
    expect(routingProfileSchema.parse({
      domainStrategy: "AsIs",
      enabled: true,
      remarks: " Voya routing ",
      rules: [{ ...baseRule(), network: "tcp,udp", port: "53, 80-443" }],
      singboxDomainStrategy: "",
      singboxRulesetPath: " rules/default.srs ",
      sourceUrl: "https://routing.example.test/bundle.json",
    })).toMatchObject({
      id: "",
      locked: false,
      remarks: "Voya routing",
      sort: 0,
    });
  });

  it.each([
    ["not a url", "URL must be valid"],
    ["http://routing.example.test/bundle.json", "URL must use https://"],
    ["https://user:secret@routing.example.test/bundle.json", "URL must not include credentials"],
  ])("rejects source %s", (sourceUrl, message) => {
    const result = routingProfileSchema.safeParse({
      domainStrategy: "AsIs",
      enabled: true,
      remarks: "routing",
      rules: [],
      singboxDomainStrategy: "",
      singboxRulesetPath: "",
      sourceUrl,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain(message);
  });

  it("allows an empty local source", () => {
    expect(routingProfileSchema.safeParse({
      domainStrategy: "IPIfNonMatch",
      enabled: false,
      remarks: "",
      rules: [],
      singboxDomainStrategy: "prefer_ipv4",
      singboxRulesetPath: "",
      sourceUrl: "",
    }).success).toBe(true);
  });

  it.each([
    ["abc", "comma-separated"],
    ["70000", "between 0 and 65535"],
    ["100-10", "ranges must ascend"],
  ])("rejects invalid port expression %s", (port, message) => {
    const result = routingRuleSchema.safeParse({ ...baseRule(), port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.find((issue) => issue.path[0] === "port")?.message).toContain(message);
  });

  it.each(["icmp", "tcp,icmp", ","])("rejects invalid network expression %s", (network) => {
    expect(routingRuleSchema.safeParse({ ...baseRule(), network }).success).toBe(false);
  });

  it.each([null, "", "tcp", "udp", "TCP, udp"])("accepts network expression %s", (network) => {
    expect(routingRuleSchema.safeParse({ ...baseRule(), network }).success).toBe(true);
  });

  it("maps nested Zod issues to stable form field names", () => {
    const result = routingProfileSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodIssuesToErrorMap(result.error)).toMatchObject({
        domainStrategy: expect.any(String),
        enabled: expect.any(String),
        rules: expect.any(String),
        sourceUrl: expect.any(String),
      });
    }
  });
});

function baseRule() {
  return {
    domain: null,
    inboundTags: null,
    ip: null,
    kind: null,
    network: null,
    outbound: null,
    port: null,
    process: null,
    protocol: null,
    remarks: null,
    scope: null,
  };
}
