import { z } from "zod";

import { getErrorMessage } from "@voya/utils/error";

import { DOMAIN_STRATEGIES, RULE_TYPES, SINGBOX_DOMAIN_STRATEGIES } from "./routing-constants";

const nullableText = z.string().trim().nullable();
const nullableStringList = z.array(z.string().trim().min(1, "List items cannot be empty")).nullable();

export const routingRuleSchema = z.object({
  id: z.string().trim().default(""),
  kind: nullableText,
  port: nullableText.superRefine(validatePortExpression),
  network: nullableText.superRefine(validateNetworkExpression),
  inboundTags: nullableStringList,
  outbound: nullableText,
  ip: nullableStringList,
  domain: nullableStringList,
  protocol: nullableStringList,
  process: nullableStringList,
  enabled: z.boolean().default(true),
  remarks: nullableText,
  scope: z.union([z.literal(RULE_TYPES.All), z.literal(RULE_TYPES.Routing), z.literal(RULE_TYPES.Dns)]).nullable(),
});

const optionalHttpsUrl = z.string().trim().superRefine(validateHttpsUrl);

export const routingProfileSchema = z.object({
  id: z.string().trim().default(""),
  icon: z.string().default(""),
  singboxRulesetPath: z.string().trim(),
  domainStrategy: z.enum(DOMAIN_STRATEGIES),
  singboxDomainStrategy: z.enum(SINGBOX_DOMAIN_STRATEGIES),
  enabled: z.boolean(),
  locked: z.boolean().default(false),
  remarks: z.string().trim().max(256, "remarks must be 256 characters or fewer"),
  rules: z.array(routingRuleSchema),
  sort: z.number().int().default(0),
  sourceUrl: optionalHttpsUrl,
});

export type ErrorMap = Record<string, string>;
export type RoutingFormPayload = z.output<typeof routingProfileSchema>;
export type RoutingRulePayload = z.output<typeof routingRuleSchema>;

export function zodIssuesToErrorMap(error: z.ZodError): ErrorMap {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "form", issue.message]),
  );
}

function validateHttpsUrl(value: string, context: z.RefinementCtx) {
  if (value === "") {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: `URL must be valid: ${getErrorMessage(error)}`,
    });
    return;
  }

  if (parsed.protocol !== "https:") {
    context.addIssue({ code: "custom", message: "URL must use https://" });
  }
  if (!parsed.hostname) {
    context.addIssue({ code: "custom", message: "URL host is required" });
  }
  if (parsed.username || parsed.password) {
    context.addIssue({ code: "custom", message: "URL must not include credentials" });
  }
}

function validatePortExpression(value: string | null | undefined, context: z.RefinementCtx) {
  if (!value) {
    return;
  }

  for (const token of value.split(",")) {
    const part = token.trim();
    const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part);
    if (!match) {
      context.addIssue({
        code: "custom",
        message: "port must be a comma-separated list of ports or ranges",
      });
      return;
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start > 65535 || end > 65535 || start > end) {
      context.addIssue({
        code: "custom",
        message: "port values must be between 0 and 65535 and ranges must ascend",
      });
      return;
    }
  }
}

function validateNetworkExpression(value: string | null | undefined, context: z.RefinementCtx) {
  if (!value) {
    return;
  }

  const allowed = new Set(["tcp", "udp"]);
  const values = value.split(",").flatMap((item) => {
    const normalized = item.trim().toLowerCase();

    return normalized ? [normalized] : [];
  });
  if (values.length === 0 || values.some((item) => !allowed.has(item))) {
    context.addIssue({ code: "custom", message: "network must be tcp, udp, or tcp,udp" });
  }
}
