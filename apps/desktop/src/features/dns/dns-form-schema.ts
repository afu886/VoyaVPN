import { z } from "zod";

import type { DnsSettings_Deserialize } from "@/ipc/bindings";

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

export const dnsSettingsSchema: z.ZodType<DnsSettings_Deserialize> = z.object({
  simpleDnsItem: simpleDnsItemSchema,
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


export function zodIssuesToErrorMap(error: z.ZodError): DnsFieldErrors {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "form", issue.message]),
  );
}
