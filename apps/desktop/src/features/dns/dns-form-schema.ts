import { z } from "zod";

import type { DnsSettings_Deserialize } from "@/ipc/bindings";
import { getErrorMessage } from "@voya/utils/error";

import { DNS_STRATEGIES } from "./dns-constants";

export type DnsFieldErrors = Record<string, string>;

const optionalNullableText = z.string().nullable().optional();

const simpleDnsItemSchema = z.object({
  UseSystemHosts: z.boolean().nullable().optional(),
  AddCommonHosts: z.boolean().nullable().optional(),
  FakeIP: z.boolean().nullable().optional(),
  GlobalFakeIp: z.boolean().nullable().optional(),
  BlockBindingQuery: z.boolean().nullable().optional(),
  DirectDNS: optionalNullableText,
  RemoteDNS: optionalNullableText,
  BootstrapDNS: optionalNullableText,
  Strategy4Freedom: z.enum(DNS_STRATEGIES).nullable().optional(),
  Strategy4Proxy: z.enum(DNS_STRATEGIES).nullable().optional(),
  ServeStale: z.boolean().nullable().optional(),
  ParallelQuery: z.boolean().nullable().optional(),
  Hosts: optionalNullableText.superRefine(validateHosts),
  DirectExpectedIPs: optionalNullableText.superRefine(validateExpectedIps),
});

const dnsItemSchema = z.object({
  Id: z.string().optional(),
  Remarks: z.string().optional(),
  Enabled: z.boolean().optional(),
  UseSystemHosts: z.boolean().optional(),
  NormalDNS: optionalNullableText,
  TunDNS: optionalNullableText,
  DomainStrategy4Freedom: optionalNullableText,
  DomainDNSAddress: optionalNullableText,
});

export const dnsSettingsSchema: z.ZodType<DnsSettings_Deserialize> = z.object({
  simpleDnsItem: simpleDnsItemSchema,
  singboxDnsItem: dnsItemSchema.extend({
    NormalDNS: optionalNullableText.superRefine((value, context) => validateSingboxDnsJson(value, context)),
    TunDNS: optionalNullableText.superRefine((value, context) => validateSingboxDnsJson(value, context)),
  }),
  defaults: z.object({
    singboxNormalDns: z.string(),
    singboxTunDns: z.string(),
  }),
});

function validateHosts(value: string | null | undefined, context: z.RefinementCtx) {
  if (!value) {
    return;
  }

  value.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    if (trimmed.split(/\s+/).length < 2) {
      context.addIssue({
        code: "custom",
        message: `Host line ${index + 1} must contain a domain and at least one answer`,
      });
    }
  });
}

function validateExpectedIps(value: string | null | undefined, context: z.RefinementCtx) {
  if (!value) {
    return;
  }

  if (
    value
      .split(",")
      .map((part) => part.trim())
      .some((part) => part !== "" && /\s/.test(part))
  ) {
    context.addIssue({
      code: "custom",
      message: "Expected IPs must be comma-separated without embedded whitespace",
    });
  }
}

function validateSingboxDnsJson(value: string | null | undefined, context: z.RefinementCtx) {
  const parsed = parseJsonObject(value, "Invalid sing-box DNS JSON", context);
  if (!parsed) {
    return;
  }

  const servers = parsed.servers;
  if (!Array.isArray(servers) || servers.length === 0) {
    context.addIssue({
      code: "custom",
      message: "sing-box DNS JSON must contain at least one server",
    });
    return;
  }

  if (
    servers.some(
      (server) =>
        !server ||
        typeof server !== "object" ||
        typeof (server as Record<string, unknown>).type !== "string" ||
        (server as Record<string, unknown>).type === "",
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "Every sing-box DNS server must include a non-empty type",
    });
  }
}

function parseJsonObject(
  value: string | null | undefined,
  label: string,
  context: z.RefinementCtx,
) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      context.addIssue({ code: "custom", message: `${label}: expected a JSON object` });
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: `${label}: ${getErrorMessage(error)}`,
    });
    return null;
  }
}

export function zodIssuesToErrorMap(error: z.ZodError): DnsFieldErrors {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "form", issue.message]),
  );
}
