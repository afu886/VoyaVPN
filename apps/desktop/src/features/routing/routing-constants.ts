export const RULE_TYPES = {
  All: 0,
  Routing: 1,
  Dns: 2,
} as const;

export const DOMAIN_STRATEGIES = ["AsIs", "IPIfNonMatch", "IPOnDemand"] as const;

export const SINGBOX_DOMAIN_STRATEGIES = ["", "prefer_ipv4", "prefer_ipv6", "ipv4_only", "ipv6_only"] as const;
