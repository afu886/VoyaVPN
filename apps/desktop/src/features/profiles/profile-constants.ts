import type { MoveAction, ProfileKind, SpeedTestKind } from "@/ipc/bindings";

export const CONFIG_TYPES = {
  VMess: "vmess",
  Custom: "custom",
  Shadowsocks: "shadowsocks",
  SOCKS: "socks",
  VLESS: "vless",
  Trojan: "trojan",
  Hysteria2: "hysteria2",
  TUIC: "tuic",
  WireGuard: "wireGuard",
  HTTP: "http",
  Anytls: "anytls",
  Naive: "naive",
  PolicyGroup: "policyGroup",
  ProxyChain: "proxyChain",
} as const satisfies Record<string, ProfileKind>;

export const MOVE_ACTIONS = {
  Top: "top",
  Up: "up",
  Down: "down",
  Bottom: "bottom",
  Position: "position",
} as const satisfies Record<string, MoveAction>;

export const SPEED_ACTIONS = {
  Download: "download",
  Latency: "latency",
  Mixed: "mixed",
  TcpConnect: "tcpConnect",
  Udp: "udp",
} as const satisfies Record<string, SpeedTestKind>;

export type ProfileProtocol = (typeof CONFIG_TYPES)[keyof typeof CONFIG_TYPES];

export type ProfileProtocolOption = {
  description: string;
  label: string;
  value: ProfileProtocol;
};

export const PROFILE_PROTOCOLS: ProfileProtocolOption[] = [
  { description: "VMess outbound", label: "VMess", value: CONFIG_TYPES.VMess },
  { description: "Custom core JSON or file", label: "Custom", value: CONFIG_TYPES.Custom },
  { description: "Shadowsocks outbound", label: "Shadowsocks", value: CONFIG_TYPES.Shadowsocks },
  { description: "SOCKS outbound", label: "SOCKS", value: CONFIG_TYPES.SOCKS },
  { description: "VLESS outbound", label: "VLESS", value: CONFIG_TYPES.VLESS },
  { description: "Trojan outbound", label: "Trojan", value: CONFIG_TYPES.Trojan },
  { description: "Hysteria2 outbound", label: "Hysteria2", value: CONFIG_TYPES.Hysteria2 },
  { description: "TUIC outbound", label: "TUIC", value: CONFIG_TYPES.TUIC },
  { description: "WireGuard outbound", label: "WireGuard", value: CONFIG_TYPES.WireGuard },
  { description: "HTTP outbound", label: "HTTP", value: CONFIG_TYPES.HTTP },
  { description: "AnyTLS outbound", label: "AnyTLS", value: CONFIG_TYPES.Anytls },
  { description: "NaiveProxy outbound", label: "Naive", value: CONFIG_TYPES.Naive },
  { description: "Policy group selector", label: "Policy Group", value: CONFIG_TYPES.PolicyGroup },
  { description: "Ordered proxy chain", label: "Proxy Chain", value: CONFIG_TYPES.ProxyChain },
];

const PROFILE_PROTOCOL_LABELS = PROFILE_PROTOCOLS.reduce<Partial<Record<ProfileKind, string>>>(
  (labels, protocol) => {
    labels[protocol.value] = protocol.label;
    return labels;
  },
  {},
);

export const NETWORK_OPTIONS = [
  { label: "TCP / Raw", value: "tcp" },
  { label: "KCP", value: "kcp" },
  { label: "WebSocket", value: "ws" },
  { label: "HTTP Upgrade", value: "httpupgrade" },
  { label: "XHTTP", value: "xhttp" },
  { label: "HTTP/2", value: "h2" },
  { label: "gRPC", value: "grpc" },
  { label: "QUIC", value: "quic" },
];

export const SECURITY_OPTIONS = [
  { label: "None", value: "" },
  { label: "TLS", value: "tls" },
  { label: "REALITY", value: "reality" },
];

export function getProtocolLabel(configType: ProfileKind | null | undefined) {
  return configType == null
    ? ""
    : (PROFILE_PROTOCOL_LABELS[configType] ?? `Type ${configType}`);
}
