import { z } from "zod";

import type { DnsSettings_Deserialize } from "@/ipc/bindings";

import { DNS_STRATEGIES } from "./dns-constants";

export type DnsFieldErrors = Record<string, string>;

const nullableText = z.string().nullable();

const simpleDnsItemSchema = z.object({
  UseSystemHosts: z.boolean().nullable(),
  AddCommonHosts: z.boolean().nullable(),
  FakeIP: z.boolean().nullable(),
  GlobalFakeIp: z.boolean().nullable(),
  BlockBindingQuery: z.boolean().nullable(),
  DirectDNS: nullableText,
  RemoteDNS: nullableText,
  BootstrapDNS: nullableText,
  Strategy4Freedom: z.enum(DNS_STRATEGIES).nullable(),
  Strategy4Proxy: z.enum(DNS_STRATEGIES).nullable(),
  ServeStale: z.boolean().nullable(),
  ParallelQuery: z.boolean().nullable(),
  Hosts: nullableText.superRefine(validateHosts),
  DirectExpectedIPs: nullableText.superRefine(validateExpectedIps),
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
