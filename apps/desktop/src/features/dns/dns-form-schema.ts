import { z } from "zod";

import type { DnsSettings } from "@/ipc/bindings";

import { DNS_STRATEGIES } from "./dns-constants";

export type DnsFieldErrors = Record<string, string>;

const nullableText = z.string().nullable();

export const dnsSettingsSchema: z.ZodType<DnsSettings> = z.object({
  useSystemHosts: z.boolean().nullable(),
  addCommonHosts: z.boolean().nullable(),
  fakeIp: z.boolean().nullable(),
  globalFakeIp: z.boolean().nullable(),
  blockBindingQuery: z.boolean().nullable(),
  direct: nullableText,
  remote: nullableText,
  bootstrap: nullableText,
  directStrategy: z.enum(DNS_STRATEGIES).nullable(),
  proxyStrategy: z.enum(DNS_STRATEGIES).nullable(),
  serveStale: z.boolean().nullable(),
  parallelQuery: z.boolean().nullable(),
  hosts: nullableText.superRefine(validateHosts),
  directExpectedIps: nullableText.superRefine(validateExpectedIps),
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
