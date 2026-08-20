use std::{
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use thiserror::Error;
use tokio::{
    runtime::Handle,
    sync::watch,
    task::JoinHandle,
    time::{self, MissedTickBehavior},
};
pub use voya_contracts::{
    ProxyConnectionItem, ProxyConnectionsSnapshot, ProxyDelayTestResult, ProxyGroup,
    ProxyGroupsSnapshot, ProxyMonitorState, ProxyMonitorStatus, ProxyNode, ProxyTrafficEvent,
};
use voya_core::{AppConfig, TrafficMode};
use voya_net::clash::{
    ClashApiEndpoint, ClashConnection as NetClashConnection,
    ClashConnectionMetadata as NetClashConnectionMetadata, ClashConnections as NetClashConnections,
    ClashDelayResponse, ClashError, ClashHttpTransport, ClashProvidersResponse,
    ClashProxiesResponse, ClashProxy, ClashRestClient, ClashTraffic as NetClashTraffic,
    ClashWebSocketClient, ClashWebSocketEvent, ClashWebSocketResource, ReqwestClashHttpTransport,
};

use crate::statistics::singbox_state_port2;

const DELAY_TIMEOUT_MS: u32 = 10_000;
const PROXY_WS_RECONNECT_INITIAL_DELAY: Duration = Duration::from_secs(1);
const PROXY_WS_RECONNECT_MAX_DELAY: Duration = Duration::from_secs(30);
const PROXY_WS_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const WS_RECONNECT_JITTER_DIVISOR: u32 = 4;
const ALLOW_SELECT_TYPES: &[&str] = &["selector", "urltest", "loadbalance", "fallback"];
const NOT_ALLOW_TEST_TYPES: &[&str] = &[
    "selector",
    "urltest",
    "direct",
    "reject",
    "compatible",
    "pass",
    "loadbalance",
    "fallback",
];
const PROVIDER_PROXY_VEHICLE_TYPES: &[&str] = &["file", "http"];

pub type Result<T> = std::result::Result<T, ProxyRuntimeError>;

#[derive(Debug, Error)]
pub enum ProxyRuntimeError {
    #[error(transparent)]
    Api(#[from] ClashError),
    #[error("proxy group {0} was not found")]
    GroupNotFound(String),
    #[error("proxy node {0} was not found")]
    NodeNotFound(String),
    #[error("proxy group {0} is not a selector")]
    GroupNotSelector(String),
    #[error("invalid traffic mode {0:?}")]
    InvalidTrafficMode(TrafficMode),
    #[error("proxy monitor lock is poisoned")]
    MonitorLockPoisoned,
    #[error("proxy monitor requires a Tokio runtime")]
    MonitorRuntimeUnavailable,
    #[error("proxy runtime API state port is unavailable")]
    InvalidStatePort,
}

pub trait ProxyRuntimeEventSink: Send + Sync {
    fn emit_traffic(&self, event: ProxyTrafficEvent);
    fn emit_connections(&self, event: ProxyConnectionsSnapshot);
}

#[cfg(test)]
#[derive(Clone)]
pub struct NoopProxyRuntimeEventSink;

#[cfg(test)]
impl ProxyRuntimeEventSink for NoopProxyRuntimeEventSink {
    fn emit_traffic(&self, _event: ProxyTrafficEvent) {}
    fn emit_connections(&self, _event: ProxyConnectionsSnapshot) {}
}

#[derive(Debug, Clone)]
pub struct ProxyRuntimeManager<T = ReqwestClashHttpTransport> {
    transport: T,
}

impl Default for ProxyRuntimeManager<ReqwestClashHttpTransport> {
    fn default() -> Self {
        Self::new()
    }
}

impl ProxyRuntimeManager<ReqwestClashHttpTransport> {
    #[must_use]
    pub fn new() -> Self {
        Self {
            transport: ReqwestClashHttpTransport::new(),
        }
    }
}

impl<T> ProxyRuntimeManager<T>
where
    T: ClashHttpTransport,
{
    #[must_use]
    pub fn with_transport(transport: T) -> Self {
        Self { transport }
    }

    pub async fn groups(&self, config: &AppConfig) -> Result<ProxyGroupsSnapshot> {
        let client = self.client(config)?;
        let proxies = client.get_proxies().await?;
        let providers = client.get_proxy_providers().await.unwrap_or_default();

        Ok(build_proxy_groups_snapshot(
            &proxies,
            &providers,
            config.proxy_ui_item.node_sorting,
            config.proxy_ui_item.traffic_mode,
        ))
    }

    pub async fn connections(&self, config: &AppConfig) -> Result<ProxyConnectionsSnapshot> {
        self.client(config)?
            .get_connections()
            .await
            .map(connections_snapshot)
            .map_err(Into::into)
    }

    pub async fn select_node(
        &self,
        config: &AppConfig,
        group_name: &str,
        node_name: &str,
    ) -> Result<ProxyGroupsSnapshot> {
        let client = self.client(config)?;
        let proxies = client.get_proxies().await?;
        let group = proxies
            .proxies
            .get(group_name)
            .ok_or_else(|| ProxyRuntimeError::GroupNotFound(group_name.to_string()))?;
        if !group.proxy_type.eq_ignore_ascii_case("selector") {
            return Err(ProxyRuntimeError::GroupNotSelector(group_name.to_string()));
        }
        if !group.all.iter().any(|name| name == node_name) {
            return Err(ProxyRuntimeError::NodeNotFound(node_name.to_string()));
        }

        client.select_proxy(group_name, node_name).await?;
        self.groups(config).await
    }

    pub async fn test_delay(
        &self,
        config: &AppConfig,
        node_names: Vec<String>,
    ) -> Result<Vec<ProxyDelayTestResult>> {
        let client = self.client(config)?;
        let names = if node_names.is_empty() {
            client
                .get_proxies()
                .await?
                .proxies
                .into_iter()
                .filter_map(|(name, proxy)| is_testable_type(&proxy.proxy_type).then_some(name))
                .collect::<Vec<_>>()
        } else {
            node_names
        };

        let mut results = Vec::with_capacity(names.len());
        for name in names {
            let response = client
                .delay_proxy(
                    &name,
                    DELAY_TIMEOUT_MS,
                    &config.speed_test_item.speed_ping_test_url,
                )
                .await
                .unwrap_or_else(|error| ClashDelayResponse {
                    delay: None,
                    message: Some(error.to_string()),
                });
            results.push(ProxyDelayTestResult {
                name,
                delay: response.delay,
                message: response.message,
            });
        }

        Ok(results)
    }

    pub async fn set_traffic_mode(&self, config: &AppConfig, mode: TrafficMode) -> Result<()> {
        let Some(mode) = traffic_mode_api_value(mode) else {
            return Err(ProxyRuntimeError::InvalidTrafficMode(mode));
        };

        self.client(config)?
            .set_rule_mode(mode)
            .await
            .map_err(Into::into)
    }

    pub async fn reload_config(&self, config: &AppConfig, path: Option<&str>) -> Result<()> {
        let client = self.client(config)?;
        let _ = client.close_connection(None).await;
        client.reload_config(path).await.map_err(Into::into)
    }

    pub async fn close_connection(
        &self,
        config: &AppConfig,
        connection_id: Option<&str>,
    ) -> Result<ProxyConnectionsSnapshot> {
        let client = self.client(config)?;
        client.close_connection(connection_id).await?;
        client
            .get_connections()
            .await
            .map(connections_snapshot)
            .map_err(Into::into)
    }

    fn client(&self, config: &AppConfig) -> Result<ClashRestClient<T>> {
        let endpoint = proxy_runtime_endpoint(config).ok_or(ProxyRuntimeError::InvalidStatePort)?;
        Ok(ClashRestClient::with_transport(
            endpoint,
            self.transport.clone(),
        ))
    }
}

#[derive(Clone, Default)]
pub struct ProxyMonitorController {
    handle: Arc<Mutex<Option<ProxyMonitorHandle>>>,
}

impl ProxyMonitorController {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start(
        &self,
        config: &AppConfig,
        sink: Arc<dyn ProxyRuntimeEventSink>,
    ) -> Result<ProxyMonitorStatus> {
        let mut guard = self
            .handle
            .lock()
            .map_err(|_| ProxyRuntimeError::MonitorLockPoisoned)?;
        let Some(endpoint) = proxy_runtime_endpoint(config) else {
            if let Some(handle) = guard.take() {
                handle.stop();
            }
            tracing::debug!("skipping proxy monitor because state port is unavailable");
            return Ok(ProxyMonitorStatus::stopped());
        };
        if guard
            .as_ref()
            .is_some_and(|handle| handle.endpoint == endpoint)
        {
            return Ok(ProxyMonitorStatus::running());
        }
        let runtime =
            Handle::try_current().map_err(|_| ProxyRuntimeError::MonitorRuntimeUnavailable)?;
        if let Some(handle) = guard.take() {
            handle.stop();
        }

        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let traffic_task = runtime.spawn(run_proxy_ws_monitor(
            endpoint.clone(),
            ClashWebSocketResource::Traffic,
            Arc::clone(&sink),
            shutdown_rx.clone(),
        ));
        let connections_task = runtime.spawn(run_proxy_ws_monitor(
            endpoint.clone(),
            ClashWebSocketResource::Connections,
            sink,
            shutdown_rx,
        ));
        *guard = Some(ProxyMonitorHandle {
            endpoint,
            shutdown: shutdown_tx,
            tasks: vec![traffic_task, connections_task],
        });

        Ok(ProxyMonitorStatus::running())
    }

    pub fn stop(&self) -> Result<ProxyMonitorStatus> {
        let mut guard = self
            .handle
            .lock()
            .map_err(|_| ProxyRuntimeError::MonitorLockPoisoned)?;
        if let Some(handle) = guard.take() {
            handle.stop();
        }

        Ok(ProxyMonitorStatus::stopped())
    }
}

struct ProxyMonitorHandle {
    endpoint: ClashApiEndpoint,
    shutdown: watch::Sender<bool>,
    tasks: Vec<JoinHandle<()>>,
}

impl ProxyMonitorHandle {
    fn stop(self) {
        let _ = self.shutdown.send(true);
        for task in self.tasks {
            task.abort();
        }
    }
}

async fn run_proxy_ws_monitor(
    endpoint: ClashApiEndpoint,
    resource: ClashWebSocketResource,
    sink: Arc<dyn ProxyRuntimeEventSink>,
    mut shutdown: watch::Receiver<bool>,
) {
    let mut reconnect_backoff = WebSocketReconnectBackoff::new(
        PROXY_WS_RECONNECT_INITIAL_DELAY,
        PROXY_WS_RECONNECT_MAX_DELAY,
    );

    loop {
        if *shutdown.borrow() {
            break;
        }

        let client = ClashWebSocketClient::new(endpoint.clone());
        match time::timeout(PROXY_WS_CONNECT_TIMEOUT, client.connect(resource)).await {
            Ok(Ok(mut session)) => loop {
                tokio::select! {
                    changed = shutdown.changed() => {
                        if changed.is_err() || *shutdown.borrow() {
                            return;
                        }
                    }
                    event = session.next_event() => match event {
                        Ok(event) => {
                            reconnect_backoff.reset();
                            route_proxy_ws_event(sink.as_ref(), event);
                        }
                        Err(error) => {
                            tracing::debug!(?error, ?resource, "proxy websocket monitor read failed");
                            break;
                        }
                    }
                }
            },
            Ok(Err(error)) => {
                tracing::debug!(
                    ?error,
                    ?resource,
                    "failed to connect proxy websocket monitor"
                );
            }
            Err(error) => {
                tracing::debug!(
                    ?error,
                    ?resource,
                    "timed out connecting proxy websocket monitor"
                );
            }
        }

        if sleep_or_shutdown(reconnect_backoff.next_delay(), &mut shutdown).await {
            break;
        }
    }
}

async fn sleep_or_shutdown(duration: Duration, shutdown: &mut watch::Receiver<bool>) -> bool {
    let mut sleep = time::interval(duration);
    sleep.set_missed_tick_behavior(MissedTickBehavior::Delay);
    sleep.tick().await;

    tokio::select! {
        changed = shutdown.changed() => changed.is_err() || *shutdown.borrow(),
        _ = sleep.tick() => false,
    }
}

#[derive(Debug, Clone)]
struct WebSocketReconnectBackoff {
    attempt: u32,
    initial: Duration,
    max: Duration,
}

impl WebSocketReconnectBackoff {
    const fn new(initial: Duration, max: Duration) -> Self {
        Self {
            attempt: 0,
            initial,
            max,
        }
    }

    fn reset(&mut self) {
        self.attempt = 0;
    }

    fn next_delay(&mut self) -> Duration {
        let delay = websocket_reconnect_delay(
            self.attempt,
            self.initial,
            self.max,
            reconnect_jitter_seed(),
        );
        self.attempt = self.attempt.saturating_add(1);
        delay
    }
}

fn websocket_reconnect_delay(
    attempt: u32,
    initial: Duration,
    max: Duration,
    jitter_seed: u64,
) -> Duration {
    let multiplier = 1_u32.checked_shl(attempt.min(16)).unwrap_or(u32::MAX);
    let scaled = initial.saturating_mul(multiplier);
    let base = if scaled > max { max } else { scaled };

    base.saturating_add(reconnect_jitter(base, jitter_seed))
}

fn reconnect_jitter(base: Duration, jitter_seed: u64) -> Duration {
    let jitter_limit_nanos =
        (base.as_nanos() / u128::from(WS_RECONNECT_JITTER_DIVISOR)).min(u128::from(u64::MAX));
    if jitter_limit_nanos == 0 {
        return Duration::ZERO;
    }

    let jitter_nanos = u128::from(jitter_seed) % (jitter_limit_nanos + 1);
    Duration::from_nanos(u64::try_from(jitter_nanos).unwrap_or(u64::MAX))
}

fn reconnect_jitter_seed() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_nanos()).unwrap_or(u64::MAX) ^ u64::from(std::process::id())
        })
}

pub fn route_proxy_ws_event(sink: &dyn ProxyRuntimeEventSink, event: ClashWebSocketEvent) {
    match event {
        ClashWebSocketEvent::Traffic(event) => sink.emit_traffic(proxy_traffic_event(event)),
        ClashWebSocketEvent::Connections(event) => {
            sink.emit_connections(connections_snapshot(event))
        }
    }
}

#[must_use]
pub fn proxy_runtime_endpoint(config: &AppConfig) -> Option<ClashApiEndpoint> {
    available_proxy_state_port(config).map(ClashApiEndpoint::loopback)
}

fn available_proxy_state_port(config: &AppConfig) -> Option<u16> {
    let port = singbox_state_port2(config);
    (port != 0).then_some(port)
}

#[must_use]
pub fn traffic_mode_api_value(mode: TrafficMode) -> Option<&'static str> {
    match mode {
        TrafficMode::Rule => Some("rule"),
        TrafficMode::Global => Some("global"),
        TrafficMode::Direct => Some("direct"),
        TrafficMode::Unchanged => None,
    }
}

fn build_proxy_groups_snapshot(
    proxies: &ClashProxiesResponse,
    providers: &ClashProvidersResponse,
    sorting: i32,
    traffic_mode: TrafficMode,
) -> ProxyGroupsSnapshot {
    let mut groups = proxies
        .proxies
        .iter()
        .filter(|(_, proxy)| is_selectable_type(&proxy.proxy_type))
        .map(|(name, proxy)| {
            let mut nodes = proxy
                .all
                .iter()
                .filter_map(|node_name| {
                    find_proxy(node_name, proxies, providers).map(|node| {
                        proxy_node(node_name, node, proxy.now.as_deref() == Some(node_name))
                    })
                })
                .collect::<Vec<_>>();
            sort_nodes(&mut nodes, sorting);

            ProxyGroup {
                name: proxy.name.clone().unwrap_or_else(|| name.clone()),
                proxy_type: proxy.proxy_type.clone(),
                now: proxy.now.clone(),
                nodes,
            }
        })
        .collect::<Vec<_>>();
    groups.sort_by(|left, right| left.name.cmp(&right.name));

    ProxyGroupsSnapshot {
        groups,
        traffic_mode: contract_traffic_mode(traffic_mode),
    }
}

const fn contract_traffic_mode(mode: TrafficMode) -> voya_contracts::TrafficMode {
    match mode {
        TrafficMode::Rule => voya_contracts::TrafficMode::Rule,
        TrafficMode::Global => voya_contracts::TrafficMode::Global,
        TrafficMode::Direct => voya_contracts::TrafficMode::Direct,
        TrafficMode::Unchanged => voya_contracts::TrafficMode::Unchanged,
    }
}

fn find_proxy<'proxies>(
    name: &str,
    proxies: &'proxies ClashProxiesResponse,
    providers: &'proxies ClashProvidersResponse,
) -> Option<&'proxies ClashProxy> {
    proxies.proxies.get(name).or_else(|| {
        providers
            .providers
            .values()
            .filter(|provider| {
                provider
                    .vehicle_type
                    .as_deref()
                    .is_some_and(is_provider_proxy_vehicle_type)
            })
            .flat_map(|provider| provider.proxies.iter())
            .find(|proxy| proxy.name.as_deref() == Some(name))
    })
}

fn proxy_node(name: &str, proxy: &ClashProxy, active: bool) -> ProxyNode {
    let delay = proxy
        .history
        .last()
        .map(|item| item.delay)
        .filter(|delay| *delay > 0)
        .or_else(|| (proxy.delay > 0).then_some(proxy.delay));
    ProxyNode {
        name: name.to_string(),
        proxy_type: proxy.proxy_type.clone(),
        delay,
        delay_label: delay.map_or_else(String::new, |value| format!("{value}ms")),
        udp: proxy.udp,
        active,
        testable: is_testable_type(&proxy.proxy_type),
    }
}

fn sort_nodes(nodes: &mut [ProxyNode], sorting: i32) {
    match sorting {
        0 => nodes.sort_by_key(|node| node.delay.unwrap_or(i32::MAX)),
        1 => nodes.sort_by(|left, right| left.name.cmp(&right.name)),
        _ => {}
    }
}

fn connections_snapshot(connections: NetClashConnections) -> ProxyConnectionsSnapshot {
    ProxyConnectionsSnapshot {
        download_total: connections.download_total,
        upload_total: connections.upload_total,
        connections: connections
            .connections
            .into_iter()
            .map(connection_item)
            .collect(),
    }
}

fn connection_item(connection: NetClashConnection) -> ProxyConnectionItem {
    let metadata = connection.metadata;
    let host = connection_host(&metadata);
    let source = endpoint_label(
        metadata.source_ip.as_deref(),
        metadata.source_port.as_deref(),
    );
    let destination = endpoint_label(
        metadata.destination_ip.as_deref(),
        metadata.destination_port.as_deref(),
    );

    ProxyConnectionItem {
        id: connection.id,
        network: metadata.network,
        connection_type: metadata.metadata_type,
        host,
        source,
        destination,
        upload: connection.upload,
        download: connection.download,
        start: connection.start,
        chains: connection.chains,
        rule: connection.rule,
        rule_payload: connection.rule_payload,
        process: metadata.process,
        process_path: metadata.process_path,
    }
}

fn proxy_traffic_event(event: NetClashTraffic) -> ProxyTrafficEvent {
    ProxyTrafficEvent {
        up: event.up,
        down: event.down,
    }
}

fn connection_host(metadata: &NetClashConnectionMetadata) -> String {
    let host = metadata
        .host
        .as_deref()
        .filter(|host| !host.trim().is_empty())
        .or(metadata.destination_ip.as_deref())
        .unwrap_or_default();
    endpoint_label(Some(host), metadata.destination_port.as_deref())
}

fn endpoint_label(address: Option<&str>, port: Option<&str>) -> String {
    match (
        address.map(str::trim).filter(|value| !value.is_empty()),
        port.map(str::trim).filter(|value| !value.is_empty()),
    ) {
        (Some(address), Some(port)) => format!("{address}:{port}"),
        (Some(address), None) => address.to_string(),
        (None, Some(port)) => format!(":{port}"),
        (None, None) => String::new(),
    }
}

fn is_selectable_type(proxy_type: &str) -> bool {
    let proxy_type = proxy_type.to_ascii_lowercase();
    ALLOW_SELECT_TYPES.contains(&proxy_type.as_str())
}

fn is_testable_type(proxy_type: &str) -> bool {
    let proxy_type = proxy_type.to_ascii_lowercase();
    !NOT_ALLOW_TEST_TYPES.contains(&proxy_type.as_str())
}

fn is_provider_proxy_vehicle_type(vehicle_type: &str) -> bool {
    let vehicle_type = vehicle_type.to_ascii_lowercase();
    PROVIDER_PROXY_VEHICLE_TYPES.contains(&vehicle_type.as_str())
}

#[cfg(test)]
mod tests {
    use std::{
        collections::BTreeMap,
        future::Future,
        pin::Pin,
        sync::{Arc, Mutex},
    };

    use serde_json::{json, Value};
    use voya_core::{SpeedTestItem, DEFAULT_LOCAL_PORT};
    use voya_net::clash::{ClashHttpMethod, ClashHttpRequest};

    use super::*;

    #[derive(Clone, Default)]
    struct MockTransport {
        requests: Arc<Mutex<Vec<ClashHttpRequest>>>,
        responses: Arc<Mutex<BTreeMap<String, Value>>>,
    }

    impl MockTransport {
        fn respond(&self, path: &str, value: Value) {
            self.responses.lock().expect("responses lock").insert(
                format!("http://127.0.0.1:{}{path}", DEFAULT_LOCAL_PORT + 5),
                value,
            );
        }

        fn requests(&self) -> Vec<ClashHttpRequest> {
            self.requests.lock().expect("requests lock").clone()
        }
    }

    impl ClashHttpTransport for MockTransport {
        fn send_json<'transport>(
            &'transport self,
            request: ClashHttpRequest,
        ) -> Pin<Box<dyn Future<Output = voya_net::clash::Result<Value>> + Send + 'transport>>
        {
            Box::pin(async move {
                self.requests
                    .lock()
                    .expect("requests lock")
                    .push(request.clone());
                self.responses
                    .lock()
                    .expect("responses lock")
                    .get(&request.url)
                    .cloned()
                    .ok_or_else(|| ClashError::Request(format!("no response for {}", request.url)))
            })
        }
    }

    #[derive(Default)]
    struct CaptureSink {
        traffic: Mutex<Vec<ProxyTrafficEvent>>,
        connections: Mutex<Vec<ProxyConnectionsSnapshot>>,
    }

    impl ProxyRuntimeEventSink for CaptureSink {
        fn emit_traffic(&self, event: ProxyTrafficEvent) {
            self.traffic.lock().expect("traffic lock").push(event);
        }

        fn emit_connections(&self, event: ProxyConnectionsSnapshot) {
            self.connections
                .lock()
                .expect("connections lock")
                .push(event);
        }
    }

    fn config() -> AppConfig {
        AppConfig {
            speed_test_item: SpeedTestItem {
                speed_ping_test_url: "https://example.com/generate_204".to_string(),
                ..SpeedTestItem::default()
            },
            ..AppConfig::default()
        }
    }

    fn config_with_local_port(local_port: i32) -> AppConfig {
        let mut config = config();
        config
            .inbound
            .first_mut()
            .expect("default config has an inbound")
            .local_port = local_port;
        config
    }

    fn monitor_handle_snapshot(
        controller: &ProxyMonitorController,
    ) -> (ClashApiEndpoint, watch::Sender<bool>) {
        let guard = controller.handle.lock().expect("monitor lock");
        let handle = guard.as_ref().expect("monitor handle");
        (handle.endpoint.clone(), handle.shutdown.clone())
    }

    fn monitor_handle_is_none(controller: &ProxyMonitorController) -> bool {
        controller.handle.lock().expect("monitor lock").is_none()
    }

    fn shutdown_requested(shutdown: &watch::Sender<bool>) -> bool {
        let receiver = shutdown.subscribe();
        let requested = *receiver.borrow();
        requested
    }

    #[tokio::test]
    async fn proxy_runtime_traffic_mode_uses_patch_configs() {
        let transport = MockTransport::default();
        transport.respond("/configs", Value::Null);
        let manager = ProxyRuntimeManager::with_transport(transport.clone());

        manager
            .set_traffic_mode(&config(), TrafficMode::Direct)
            .await
            .expect("set traffic mode");

        let requests = transport.requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].method, ClashHttpMethod::Patch);
        assert_eq!(
            requests[0].url,
            format!("http://127.0.0.1:{}/configs", DEFAULT_LOCAL_PORT + 5)
        );
        assert_eq!(requests[0].body, Some(json!({ "mode": "direct" })));
    }

    #[tokio::test]
    async fn proxy_runtime_reload_uses_force_configs() {
        let transport = MockTransport::default();
        transport.respond("/connections", Value::Null);
        transport.respond("/configs?force=true", Value::Null);
        let manager = ProxyRuntimeManager::with_transport(transport.clone());

        manager
            .reload_config(&config(), Some("/tmp/config.yaml"))
            .await
            .expect("reload");

        let requests = transport.requests();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].method, ClashHttpMethod::Delete);
        assert_eq!(requests[1].method, ClashHttpMethod::Put);
        assert_eq!(
            requests[1].url,
            format!(
                "http://127.0.0.1:{}/configs?force=true",
                DEFAULT_LOCAL_PORT + 5
            )
        );
    }

    #[tokio::test]
    async fn proxy_runtime_selects_active_node_with_put() {
        let transport = MockTransport::default();
        transport.respond(
            "/proxies",
            json!({
                "proxies": {
                    "Proxy": { "name": "Proxy", "type": "Selector", "now": "A", "all": ["A", "B"] },
                    "A": { "name": "A", "type": "ss", "history": [{ "delay": 12 }] },
                    "B": { "name": "B", "type": "ss", "history": [{ "delay": 8 }] }
                }
            }),
        );
        transport.respond("/proxies/Proxy", Value::Null);
        transport.respond("/providers/proxies", json!({ "providers": {} }));
        let manager = ProxyRuntimeManager::with_transport(transport.clone());

        let snapshot = manager
            .select_node(&config(), "Proxy", "B")
            .await
            .expect("select proxy");

        let requests = transport.requests();
        assert_eq!(requests[1].method, ClashHttpMethod::Put);
        assert_eq!(requests[1].body, Some(json!({ "name": "B" })));
        assert_eq!(snapshot.groups[0].nodes[0].name, "B");
    }

    #[tokio::test]
    async fn proxy_runtime_tests_delay_for_named_nodes() {
        let transport = MockTransport::default();
        transport.respond(
            "/proxies/A/delay?timeout=10000&url=https%3A%2F%2Fexample.com%2Fgenerate_204",
            json!({ "delay": 37 }),
        );
        let manager = ProxyRuntimeManager::with_transport(transport);

        let results = manager
            .test_delay(&config(), vec!["A".to_string()])
            .await
            .expect("delay");

        assert_eq!(
            results,
            vec![ProxyDelayTestResult {
                name: "A".to_string(),
                delay: Some(37),
                message: None,
            }]
        );
    }

    #[tokio::test]
    async fn proxy_runtime_rejects_zero_state_port_without_request() {
        let transport = MockTransport::default();
        let manager = ProxyRuntimeManager::with_transport(transport.clone());

        let error = manager
            .connections(&config_with_local_port(-5))
            .await
            .expect_err("zero proxy runtime state port should be rejected");

        assert!(matches!(error, ProxyRuntimeError::InvalidStatePort));
        assert!(transport.requests().is_empty());
        assert_eq!(proxy_runtime_endpoint(&config_with_local_port(-5)), None);
    }

    #[test]
    fn proxy_websocket_reconnect_delay_backs_off_with_cap_and_jitter() {
        let initial = Duration::from_secs(1);
        let max = Duration::from_secs(8);

        let first = websocket_reconnect_delay(0, initial, max, 0);
        let second = websocket_reconnect_delay(1, initial, max, 0);
        let capped = websocket_reconnect_delay(12, initial, max, u64::MAX);

        assert_eq!(first, Duration::from_secs(1));
        assert_eq!(second, Duration::from_secs(2));
        assert!(capped >= max);
        assert!(capped <= max + Duration::from_secs(2));
    }

    #[test]
    fn proxy_websocket_events_update_event_sink_payloads() {
        let sink = CaptureSink::default();

        route_proxy_ws_event(
            &sink,
            ClashWebSocketEvent::Traffic(NetClashTraffic { up: 10, down: 20 }),
        );
        route_proxy_ws_event(
            &sink,
            ClashWebSocketEvent::Connections(NetClashConnections {
                download_total: 5,
                upload_total: 3,
                connections: vec![NetClashConnection {
                    id: Some("id-1".to_string()),
                    metadata: NetClashConnectionMetadata {
                        host: Some("example.com".to_string()),
                        destination_port: Some("443".to_string()),
                        ..NetClashConnectionMetadata::default()
                    },
                    upload: 1,
                    download: 2,
                    start: "2026-06-01T00:00:00Z".to_string(),
                    chains: vec!["proxy".to_string()],
                    rule: Some("MATCH".to_string()),
                    rule_payload: None,
                }],
            }),
        );

        assert_eq!(
            sink.traffic.lock().expect("traffic lock").as_slice(),
            &[ProxyTrafficEvent { up: 10, down: 20 }]
        );
        let connections = sink.connections.lock().expect("connections lock");
        assert_eq!(connections[0].connections[0].host, "example.com:443");
    }

    #[test]
    fn proxy_monitor_start_without_tokio_runtime_returns_error() {
        let controller = ProxyMonitorController::new();

        let error = controller
            .start(&config(), Arc::new(NoopProxyRuntimeEventSink))
            .expect_err("monitor start should require a runtime");

        assert!(matches!(
            error,
            ProxyRuntimeError::MonitorRuntimeUnavailable
        ));
        assert!(monitor_handle_is_none(&controller));
    }

    #[test]
    fn proxy_monitor_status_contract_marks_stale_states() {
        assert_eq!(
            ProxyMonitorStatus::running(),
            ProxyMonitorStatus {
                state: ProxyMonitorState::Running,
                running: true,
                stale: false,
                message: None,
            }
        );
        assert_eq!(
            ProxyMonitorStatus::stopped(),
            ProxyMonitorStatus {
                state: ProxyMonitorState::Stopped,
                running: false,
                stale: true,
                message: None,
            }
        );
        assert_eq!(
            ProxyMonitorStatus::failed("start failed"),
            ProxyMonitorStatus {
                state: ProxyMonitorState::Failed,
                running: false,
                stale: true,
                message: Some("start failed".to_string()),
            }
        );
    }

    #[test]
    fn proxy_monitor_stop_is_idempotent_and_stale() {
        let controller = ProxyMonitorController::new();

        assert_eq!(
            controller.stop().expect("first monitor stop"),
            ProxyMonitorStatus::stopped()
        );
        assert_eq!(
            controller.stop().expect("second monitor stop"),
            ProxyMonitorStatus::stopped()
        );
    }

    #[tokio::test]
    async fn proxy_monitor_starts_inside_tokio_runtime() {
        let controller = ProxyMonitorController::new();

        let status = controller
            .start(&config(), Arc::new(NoopProxyRuntimeEventSink))
            .expect("monitor start");

        assert_eq!(status, ProxyMonitorStatus::running());
        assert_eq!(
            controller.stop().expect("monitor stop"),
            ProxyMonitorStatus::stopped()
        );
    }

    #[tokio::test]
    async fn proxy_monitor_zero_state_port_stops_without_endpoint() {
        let controller = ProxyMonitorController::new();

        controller
            .start(&config(), Arc::new(NoopProxyRuntimeEventSink))
            .expect("initial monitor start");
        let (_, first_shutdown) = monitor_handle_snapshot(&controller);

        assert_eq!(
            controller
                .start(
                    &config_with_local_port(-5),
                    Arc::new(NoopProxyRuntimeEventSink)
                )
                .expect("zero port monitor start"),
            ProxyMonitorStatus::stopped()
        );

        assert!(shutdown_requested(&first_shutdown));
        assert!(monitor_handle_is_none(&controller));
    }

    #[tokio::test]
    async fn proxy_monitor_start_is_idempotent_for_same_endpoint() {
        let controller = ProxyMonitorController::new();

        assert_eq!(
            controller
                .start(&config(), Arc::new(NoopProxyRuntimeEventSink))
                .expect("first monitor start"),
            ProxyMonitorStatus::running()
        );
        let (first_endpoint, first_shutdown) = monitor_handle_snapshot(&controller);

        assert_eq!(
            controller
                .start(&config(), Arc::new(NoopProxyRuntimeEventSink))
                .expect("second monitor start"),
            ProxyMonitorStatus::running()
        );
        let (second_endpoint, second_shutdown) = monitor_handle_snapshot(&controller);

        assert_eq!(first_endpoint, second_endpoint);
        assert!(first_shutdown.same_channel(&second_shutdown));
        assert!(!shutdown_requested(&first_shutdown));
        assert_eq!(
            controller.stop().expect("monitor stop"),
            ProxyMonitorStatus::stopped()
        );
    }

    #[tokio::test]
    async fn proxy_monitor_start_after_stop_creates_fresh_handle() {
        let controller = ProxyMonitorController::new();

        controller
            .start(&config(), Arc::new(NoopProxyRuntimeEventSink))
            .expect("first monitor start");
        let (first_endpoint, first_shutdown) = monitor_handle_snapshot(&controller);
        assert_eq!(
            controller.stop().expect("monitor stop"),
            ProxyMonitorStatus::stopped()
        );
        assert!(monitor_handle_is_none(&controller));
        assert!(shutdown_requested(&first_shutdown));

        assert_eq!(
            controller
                .start(&config(), Arc::new(NoopProxyRuntimeEventSink))
                .expect("restart after stop"),
            ProxyMonitorStatus::running()
        );
        let (restarted_endpoint, restarted_shutdown) = monitor_handle_snapshot(&controller);

        assert_eq!(first_endpoint, restarted_endpoint);
        assert!(!first_shutdown.same_channel(&restarted_shutdown));
        assert!(!shutdown_requested(&restarted_shutdown));
        assert_eq!(
            controller.stop().expect("monitor stop"),
            ProxyMonitorStatus::stopped()
        );
    }

    #[tokio::test]
    async fn proxy_monitor_different_endpoint_replaces_previous_handle() {
        let controller = ProxyMonitorController::new();
        let initial_config = config();
        let replacement_config = config_with_local_port(DEFAULT_LOCAL_PORT + 100);

        assert_eq!(
            controller
                .start(&initial_config, Arc::new(NoopProxyRuntimeEventSink))
                .expect("initial monitor start"),
            ProxyMonitorStatus::running()
        );
        let (initial_endpoint, initial_shutdown) = monitor_handle_snapshot(&controller);

        assert_eq!(
            controller
                .start(&replacement_config, Arc::new(NoopProxyRuntimeEventSink))
                .expect("replacement monitor start"),
            ProxyMonitorStatus::running()
        );
        let (replacement_endpoint, replacement_shutdown) = monitor_handle_snapshot(&controller);

        assert_eq!(
            proxy_runtime_endpoint(&initial_config).as_ref(),
            Some(&initial_endpoint)
        );
        assert_eq!(
            proxy_runtime_endpoint(&replacement_config).as_ref(),
            Some(&replacement_endpoint)
        );
        assert_ne!(initial_endpoint, replacement_endpoint);
        assert!(shutdown_requested(&initial_shutdown));
        assert!(!initial_shutdown.same_channel(&replacement_shutdown));
        assert!(!shutdown_requested(&replacement_shutdown));
        assert_eq!(
            controller.stop().expect("monitor stop"),
            ProxyMonitorStatus::stopped()
        );
    }

    #[tokio::test]
    async fn proxy_monitor_clones_share_handle_state() {
        let controller = ProxyMonitorController::new();
        let clone = controller.clone();

        clone
            .start(&config(), Arc::new(NoopProxyRuntimeEventSink))
            .expect("monitor start through clone");
        assert!(!monitor_handle_is_none(&controller));

        assert_eq!(
            controller.stop().expect("monitor stop through original"),
            ProxyMonitorStatus::stopped()
        );
        assert!(monitor_handle_is_none(&clone));
    }
}
