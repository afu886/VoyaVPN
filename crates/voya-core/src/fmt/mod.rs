//! Share-link parsers and exporters.
//!
//! The behavior is ported from `ServiceLib/Handler/Fmt` while keeping this
//! crate pure: helpers that recognize full custom configs return the content
//! and suggested extension instead of writing temp files.

use std::{collections::BTreeMap, net::IpAddr};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use percent_encoding::percent_decode_str;
use serde_json::{Map, Value};
use url::Url;

use crate::{ConfigType, MultipleLoad, ProfileItem, ProtocolExtraItem, TransportExtraItem};

const DEFAULT_SECURITY: &str = "auto";
const DEFAULT_NETWORK: &str = "raw";
const RAW_NETWORK_ALIAS: &str = "tcp";
const RAW_HEADER_HTTP: &str = "http";
const NONE: &str = "none";
const STREAM_SECURITY_TLS: &str = "tls";
const ALLOW_INSECURE_TRUE: &str = "true";
const ALLOW_INSECURE_FALSE: &str = "false";
const GRPC_GUN_MODE: &str = "gun";
const GRPC_MULTI_MODE: &str = "multi";
const HYSTERIA2_DEFAULT_SCHEME: &str = "hysteria2://";
const HYSTERIA2_ALT_SCHEME: &str = "hy2://";
const NAIVE_HTTPS_SCHEME: &str = "naive+https://";
const NAIVE_QUIC_SCHEME: &str = "naive+quic://";
const INNER_URI_PROTOCOL: &str = "v2rayn://";
const MAX_BASE64_DECODE_INPUT: usize = 1024 * 1024;

const NETWORKS: &[&str] = &["raw", "xhttp", "kcp", "grpc", "ws", "httpupgrade"];
const XHTTP_MODES: &[&str] = &["auto", "packet-up", "stream-up", "stream-one"];

mod anytls;
mod api;
mod common;
mod entry;
mod hysteria2;
mod naive;
mod shadowsocks;
mod socks;
mod trojan;
mod tuic;
mod uri;
mod vless;
mod vmess;
mod wireguard;

#[cfg(test)]
mod tests;

use common::*;
use uri::*;

pub use anytls::AnytlsFmt;
pub use api::{CustomConfigImport, CustomConfigKind, ShareError, ShareFmt};
pub use entry::{
    export_inner_share_links, export_share_link, parse_full_custom_config, parse_inner_share_links,
    parse_share_lines, parse_share_link,
};
pub use hysteria2::Hysteria2Fmt;
pub use naive::NaiveFmt;
pub use shadowsocks::{parse_ss_sip008, ShadowsocksFmt};
pub use socks::SocksFmt;
pub use trojan::TrojanFmt;
pub use tuic::TuicFmt;
pub use vless::VlessFmt;
pub use vmess::VmessFmt;
pub use wireguard::{parse_wireguard_config, WireguardFmt};
