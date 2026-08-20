use std::{
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use thiserror::Error;
use tokio::{
    net::{lookup_host, TcpStream},
    time,
};

const LOOPBACK_ADDR: &str = "127.0.0.1";

pub type CancellationFlag = Arc<AtomicBool>;
pub type Result<T> = std::result::Result<T, NetworkProbeError>;

#[derive(Debug, Error)]
pub enum NetworkProbeError {
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("network probe was cancelled")]
    Cancelled,
    #[error("network probe port {0} is outside the valid range")]
    InvalidPort(i32),
    #[error("network probe request timed out")]
    Timeout,
}

#[derive(Clone)]
pub struct SocksHttpProbe {
    client: reqwest::Client,
}

impl SocksHttpProbe {
    pub fn new(socks_port: u16) -> Result<Self> {
        let client = reqwest::Client::builder()
            .proxy(reqwest::Proxy::all(format!(
                "socks5h://{LOOPBACK_ADDR}:{socks_port}"
            ))?)
            .build()?;
        Ok(Self { client })
    }

    pub async fn best_latency(
        &self,
        url: &str,
        timeout: Duration,
        attempts: usize,
        cancel: &CancellationFlag,
    ) -> Result<i32> {
        let mut best_delay = None;
        let mut last_error = None;
        for attempt in 0..attempts.max(1) {
            check_cancelled(cancel)?;
            let started = Instant::now();
            match self.client.get(url).timeout(timeout).send().await {
                Ok(response) => match response.error_for_status() {
                    Ok(_) => {
                        let delay = millis_i32(started.elapsed());
                        best_delay =
                            Some(best_delay.map_or(delay, |current: i32| current.min(delay)));
                    }
                    Err(error) => last_error = Some(error),
                },
                Err(error) => last_error = Some(error),
            }
            if attempt + 1 < attempts.max(1) {
                time::sleep(Duration::from_millis(100)).await;
            }
        }
        check_cancelled(cancel)?;
        match best_delay {
            Some(delay) => Ok(delay),
            None => Err(last_error.map_or(NetworkProbeError::Cancelled, NetworkProbeError::Http)),
        }
    }

    pub async fn optional_text(&self, url: &str, timeout: Duration) -> Option<String> {
        self.client
            .get(url)
            .timeout(timeout)
            .send()
            .await
            .ok()?
            .error_for_status()
            .ok()?
            .text()
            .await
            .ok()
            .filter(|value| !value.trim().is_empty())
    }

    pub async fn download_speed(
        &self,
        url: &str,
        timeout: Duration,
        cancel: &CancellationFlag,
    ) -> Result<f64> {
        check_cancelled(cancel)?;
        let started = Instant::now();
        let mut response = time::timeout(timeout, self.client.get(url).send())
            .await
            .map_err(|_| NetworkProbeError::Timeout)??
            .error_for_status()?;
        let mut total_bytes = 0_u64;
        let mut window_bytes = 0_u64;
        let mut window_started = Instant::now();
        let mut max_speed = 0.0_f64;
        let deadline = started + timeout;

        loop {
            check_cancelled(cancel)?;
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            let chunk = match time::timeout(remaining, response.chunk()).await {
                Ok(Ok(Some(chunk))) => chunk,
                Ok(Ok(None)) | Err(_) => break,
                Ok(Err(error)) => return Err(error.into()),
            };
            let len = u64::try_from(chunk.len()).unwrap_or(u64::MAX);
            total_bytes = total_bytes.saturating_add(len);
            window_bytes = window_bytes.saturating_add(len);
            let elapsed = window_started.elapsed().as_secs_f64();
            if elapsed >= 1.0 {
                max_speed = max_speed.max(window_bytes as f64 / elapsed);
                window_started = Instant::now();
                window_bytes = 0;
            }
        }
        check_cancelled(cancel)?;
        Ok(max_speed.max(total_bytes as f64 / started.elapsed().as_secs_f64().max(0.001)))
    }
}

pub async fn tcp_connect_delay(
    host: &str,
    port: i32,
    timeout: Duration,
    cancel: &CancellationFlag,
) -> Result<i32> {
    check_cancelled(cancel)?;
    let port = u16::try_from(port).map_err(|_| NetworkProbeError::InvalidPort(port))?;
    let mut addresses = lookup_host((host, port)).await?;
    let Some(address) = addresses.next() else {
        return Ok(-1);
    };
    connect_address_delay(address, timeout, cancel).await
}

pub async fn tcp_port_is_open(host: &str, port: u16) -> bool {
    TcpStream::connect((host, port)).await.is_ok()
}

async fn connect_address_delay(
    address: SocketAddr,
    timeout: Duration,
    cancel: &CancellationFlag,
) -> Result<i32> {
    let started = Instant::now();
    let result = time::timeout(timeout, TcpStream::connect(address)).await;
    check_cancelled(cancel)?;
    match result {
        Ok(Ok(_)) => Ok(millis_i32(started.elapsed())),
        Ok(Err(error)) => Err(error.into()),
        Err(_) => Ok(-1),
    }
}

fn check_cancelled(cancel: &CancellationFlag) -> Result<()> {
    if cancel.load(Ordering::SeqCst) {
        Err(NetworkProbeError::Cancelled)
    } else {
        Ok(())
    }
}

fn millis_i32(duration: Duration) -> i32 {
    i32::try_from(duration.as_millis()).unwrap_or(i32::MAX)
}
