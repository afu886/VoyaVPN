use super::*;

impl SpeedtestManager {
    #[must_use]
    pub fn new(
        paths: AppPaths,
        core_seed_resource_dir: Option<PathBuf>,
        runner: Arc<dyn ProcessRunner>,
    ) -> Self {
        cleanup_stale_speedtest_configs(&paths);
        Self::with_probe_and_backend(
            paths.clone(),
            Arc::new(ReqwestSpeedtestProbe),
            Arc::new(ProcessSpeedtestCoreBackend::new(
                paths,
                core_seed_resource_dir,
                runner,
            )),
        )
    }

    #[must_use]
    pub(super) fn with_probe_and_backend(
        paths: AppPaths,
        probe: Arc<dyn SpeedtestProbe>,
        core_backend: Arc<dyn SpeedtestCoreBackend>,
    ) -> Self {
        Self {
            probe,
            core_backend,
            paths,
            target_os: TargetOs::current(),
            active_cancel: Arc::new(Mutex::new(None)),
        }
    }

    #[must_use]
    pub fn with_target_os(mut self, target_os: TargetOs) -> Self {
        self.target_os = target_os;
        self
    }

    pub async fn run(
        &self,
        database: &Database,
        config: &AppConfig,
        action: SpeedTestKind,
        index_ids: Vec<String>,
    ) -> Result<SpeedtestRunResult> {
        self.run_with_callback(database, config, action, index_ids, |_| {})
            .await
    }

    pub async fn run_with_callback<F>(
        &self,
        database: &Database,
        config: &AppConfig,
        action: SpeedTestKind,
        index_ids: Vec<String>,
        on_result: F,
    ) -> Result<SpeedtestRunResult>
    where
        F: Fn(SpeedTestResult) + Send + Sync,
    {
        let cancel = self.begin_job()?;
        let result = self
            .run_inner(
                database,
                config,
                action,
                index_ids,
                Arc::clone(&cancel),
                on_result,
            )
            .await;
        self.finish_job(&cancel)?;

        result
    }

    async fn run_inner<F>(
        &self,
        database: &Database,
        config: &AppConfig,
        action: SpeedTestKind,
        index_ids: Vec<String>,
        cancel: CancellationFlag,
        on_result: F,
    ) -> Result<SpeedtestRunResult>
    where
        F: Fn(SpeedTestResult) + Send + Sync,
    {
        let selected = select_test_items(database, config, &index_ids).await?;
        clear_previous_results(database, action, &selected, &on_result).await?;

        let mut results = Vec::new();
        let mut completed_count = 0_u32;

        match action {
            SpeedTestKind::TcpConnect => {
                for item in &selected {
                    if is_cancelled(&cancel) {
                        break;
                    }
                    let item_results = self
                        .run_item(
                            database,
                            config,
                            action,
                            item.clone(),
                            Arc::clone(&cancel),
                            &on_result,
                        )
                        .await?;
                    if !item_results.is_empty() {
                        completed_count = completed_count.saturating_add(1);
                    }
                    results.extend(item_results);
                }
            }
            SpeedTestKind::Latency | SpeedTestKind::Udp => {
                let item_results = self
                    .run_batch_items(
                        database,
                        config,
                        action,
                        &selected,
                        Arc::clone(&cancel),
                        &on_result,
                    )
                    .await?;
                completed_count = completed_count.saturating_add(
                    u32::try_from(unique_result_count(&item_results)).unwrap_or(u32::MAX),
                );
                results.extend(item_results);
            }
            SpeedTestKind::Download | SpeedTestKind::Mixed => {
                let item_results = self
                    .run_concurrent_dedicated_items(
                        database,
                        config,
                        action,
                        &selected,
                        Arc::clone(&cancel),
                        &on_result,
                    )
                    .await?;
                completed_count = completed_count.saturating_add(
                    u32::try_from(unique_result_count(&item_results)).unwrap_or(u32::MAX),
                );
                results.extend(item_results);
            }
        }

        let cancelled = is_cancelled(&cancel);

        Ok(SpeedtestRunResult {
            action,
            cancelled,
            selected_count: u32::try_from(selected.len()).unwrap_or(u32::MAX),
            completed_count,
            results,
        })
    }

    pub fn cancel(&self) -> Result<bool> {
        let active = self
            .active_cancel
            .lock()
            .map_err(|_| SpeedtestError::JobLockPoisoned)?;
        if let Some(cancel) = active.as_ref() {
            cancel.store(true, Ordering::SeqCst);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn status(&self) -> Result<SpeedtestStatus> {
        Ok(SpeedtestStatus {
            running: self
                .active_cancel
                .lock()
                .map_err(|_| SpeedtestError::JobLockPoisoned)?
                .is_some(),
        })
    }

    async fn run_item<F>(
        &self,
        database: &Database,
        config: &AppConfig,
        action: SpeedTestKind,
        item: ServerTestItem,
        cancel: CancellationFlag,
        on_result: &F,
    ) -> Result<Vec<SpeedTestResult>>
    where
        F: Fn(SpeedTestResult) + Send + Sync,
    {
        let mut results = Vec::new();
        match action {
            SpeedTestKind::TcpConnect => {
                let result = self.run_tcping(database, action, item, cancel).await?;
                on_result(result.clone());
                results.push(result);
            }
            SpeedTestKind::Latency => {
                let result = self
                    .run_realping(database, config, action, item, cancel)
                    .await?;
                on_result(result.clone());
                results.push(result);
            }
            SpeedTestKind::Udp => {
                let result = self.run_udp(database, config, action, item, cancel).await?;
                on_result(result.clone());
                results.push(result);
            }
            SpeedTestKind::Download => {
                let realping = self
                    .run_realping(database, config, action, item.clone(), Arc::clone(&cancel))
                    .await?;
                on_result(realping.clone());
                let can_continue = realping.delay.unwrap_or_default() > 0 && !is_cancelled(&cancel);
                results.push(realping);

                if can_continue {
                    let speed = self
                        .run_download(database, config, action, item, cancel)
                        .await?;
                    on_result(speed.clone());
                    results.push(speed);
                }
            }
            SpeedTestKind::Mixed => {
                let realping = self
                    .run_realping(database, config, action, item.clone(), Arc::clone(&cancel))
                    .await?;
                on_result(realping.clone());
                let can_continue = realping.delay.unwrap_or_default() > 0 && !is_cancelled(&cancel);
                results.push(realping);

                if can_continue {
                    let speed = self
                        .run_download(database, config, action, item.clone(), Arc::clone(&cancel))
                        .await?;
                    on_result(speed.clone());
                    results.push(speed);
                }
            }
        }

        Ok(results)
    }

    async fn run_batch_items<F>(
        &self,
        database: &Database,
        config: &AppConfig,
        action: SpeedTestKind,
        items: &[ServerTestItem],
        cancel: CancellationFlag,
        on_result: &F,
    ) -> Result<Vec<SpeedTestResult>>
    where
        F: Fn(SpeedTestResult) + Send + Sync,
    {
        let prepared = self
            .prepare_speedtest_items(database, config, items.iter().cloned())
            .await?;
        let mut results = Vec::new();
        for (core_type, group) in group_prepared_items(prepared) {
            if is_cancelled(&cancel) {
                break;
            }
            let page_size = speedtest_page_size(config, group.len());
            let batch_count = group.chunks(page_size).len();
            for (batch_index, batch) in group.chunks(page_size).enumerate() {
                if is_cancelled(&cancel) {
                    break;
                }
                let entries = batch
                    .iter()
                    .map(|prepared| prepared.entry.clone())
                    .collect::<Vec<_>>();
                let _session = self
                    .core_backend
                    .start(core_type, entries, Arc::clone(&cancel))
                    .await?;
                for prepared in batch {
                    if is_cancelled(&cancel) {
                        break;
                    }
                    let item_results = self
                        .run_item(
                            database,
                            config,
                            action,
                            prepared.item.clone(),
                            Arc::clone(&cancel),
                            on_result,
                        )
                        .await?;
                    results.extend(item_results);
                }
                if batch_index + 1 < batch_count && !is_cancelled(&cancel) {
                    time::sleep(speedtest_delay_interval(config)).await;
                }
            }
        }

        Ok(results)
    }

    async fn run_dedicated_item<F>(
        &self,
        database: &Database,
        config: &AppConfig,
        action: SpeedTestKind,
        prepared: PreparedSpeedtestItem,
        cancel: CancellationFlag,
        on_result: &F,
    ) -> Result<Vec<SpeedTestResult>>
    where
        F: Fn(SpeedTestResult) + Send + Sync,
    {
        let core_type = prepared.entry.context.run_core_type;
        let _session = self
            .core_backend
            .start(core_type, vec![prepared.entry], Arc::clone(&cancel))
            .await?;
        self.run_item(database, config, action, prepared.item, cancel, on_result)
            .await
    }

    async fn run_concurrent_dedicated_items<F>(
        &self,
        database: &Database,
        config: &AppConfig,
        action: SpeedTestKind,
        items: &[ServerTestItem],
        cancel: CancellationFlag,
        on_result: &F,
    ) -> Result<Vec<SpeedTestResult>>
    where
        F: Fn(SpeedTestResult) + Send + Sync,
    {
        if is_cancelled(&cancel) {
            return Ok(Vec::new());
        }

        let prepared = self
            .prepare_speedtest_items(database, config, items.iter().cloned())
            .await?;
        let concurrency = dedicated_concurrency_count(action, config, items.len());
        let mut pending = prepared.into_iter();
        let mut in_flight = FuturesUnordered::new();
        let mut results = Vec::new();

        while in_flight.len() < concurrency {
            let Some(prepared) = pending.next() else {
                break;
            };
            if is_cancelled(&cancel) {
                break;
            }
            in_flight.push(self.run_dedicated_item(
                database,
                config,
                action,
                prepared,
                Arc::clone(&cancel),
                on_result,
            ));
        }

        while let Some(item_results) = in_flight.next().await {
            results.extend(item_results?);
            while in_flight.len() < concurrency {
                let Some(prepared) = pending.next() else {
                    break;
                };
                if is_cancelled(&cancel) {
                    break;
                }
                in_flight.push(self.run_dedicated_item(
                    database,
                    config,
                    action,
                    prepared,
                    Arc::clone(&cancel),
                    on_result,
                ));
            }
        }

        Ok(results)
    }

    async fn prepare_speedtest_items<I>(
        &self,
        database: &Database,
        config: &AppConfig,
        items: I,
    ) -> Result<Vec<PreparedSpeedtestItem>>
    where
        I: IntoIterator<Item = ServerTestItem>,
    {
        let env = load_runtime_core_gen_env(database, &self.paths, config, self.target_os).await?;
        let builder = CoreConfigContextBuilder::new(&env);
        let mut used_ports = HashSet::new();
        let mut prepared = Vec::new();

        for mut item in items {
            let socks_port = find_free_speedtest_port(i32::from(item.socks_port), &mut used_ports)?;
            item.socks_port = socks_port;
            let build = builder.build(config, &item.profile);
            if !build.success() {
                return Err(SpeedtestError::Validation {
                    index_id: item.index_id,
                    message: build.validator_result.errors.join("; "),
                });
            }
            item.core_type = build.context.run_core_type;
            prepared.push(PreparedSpeedtestItem {
                entry: SpeedtestConfigEntry {
                    index_id: item.index_id.clone(),
                    port: i32::from(socks_port),
                    context: build.context,
                },
                item,
            });
        }

        Ok(prepared)
    }

    async fn run_tcping(
        &self,
        database: &Database,
        action: SpeedTestKind,
        item: ServerTestItem,
        cancel: CancellationFlag,
    ) -> Result<SpeedTestResult> {
        let index_id = item.index_id.clone();
        let delay = self.probe.tcping(item, cancel).await.unwrap_or(-1);
        let result = SpeedTestResult {
            action,
            index_id,
            delay: Some(delay),
            speed: None,
            message: Some(delay.to_string()),
            ip_info: None,
        };
        persist_speedtest_result(database, &result).await?;

        Ok(result)
    }

    async fn run_realping(
        &self,
        database: &Database,
        config: &AppConfig,
        action: SpeedTestKind,
        item: ServerTestItem,
        cancel: CancellationFlag,
    ) -> Result<SpeedTestResult> {
        let index_id = item.index_id.clone();
        let result = match self
            .probe
            .realping(item.socks_port, config.speed_test_item.clone(), cancel)
            .await
        {
            Ok(realping) => SpeedTestResult {
                action,
                index_id,
                delay: Some(realping.delay),
                speed: None,
                message: Some(realping.delay.to_string()),
                ip_info: realping.ip_info,
            },
            Err(error) => {
                tracing::warn!(index_id = %index_id, ?error, "speedtest realping failed");
                SpeedTestResult {
                    action,
                    index_id,
                    delay: Some(-1),
                    speed: None,
                    message: Some(speedtest_error_message(&error)),
                    ip_info: Some("Skipped".to_string()),
                }
            }
        };
        persist_speedtest_result(database, &result).await?;

        Ok(result)
    }

    async fn run_download(
        &self,
        database: &Database,
        config: &AppConfig,
        action: SpeedTestKind,
        item: ServerTestItem,
        cancel: CancellationFlag,
    ) -> Result<SpeedTestResult> {
        let index_id = item.index_id.clone();
        let result = match self
            .probe
            .download_speed(item.socks_port, config.speed_test_item.clone(), cancel)
            .await
        {
            Ok(speed) => SpeedTestResult {
                action,
                index_id,
                delay: None,
                speed: Some(speed),
                message: Some(format!("{speed:.0}")),
                ip_info: None,
            },
            Err(error) => {
                tracing::warn!(index_id = %index_id, ?error, "speedtest download failed");
                SpeedTestResult {
                    action,
                    index_id,
                    delay: None,
                    speed: Some(0.0),
                    message: Some(speedtest_error_message(&error)),
                    ip_info: None,
                }
            }
        };
        persist_speedtest_result(database, &result).await?;

        Ok(result)
    }

    async fn run_udp(
        &self,
        database: &Database,
        config: &AppConfig,
        action: SpeedTestKind,
        item: ServerTestItem,
        cancel: CancellationFlag,
    ) -> Result<SpeedTestResult> {
        let index_id = item.index_id.clone();
        let delay = self
            .probe
            .udp_test(item.socks_port, config.speed_test_item.clone(), cancel)
            .await
            .unwrap_or(-1);
        let result = SpeedTestResult {
            action,
            index_id,
            delay: Some(delay),
            speed: None,
            message: Some(delay.to_string()),
            ip_info: None,
        };
        persist_speedtest_result(database, &result).await?;

        Ok(result)
    }

    fn begin_job(&self) -> Result<CancellationFlag> {
        let cancel = Arc::new(AtomicBool::new(false));
        let mut active = self
            .active_cancel
            .lock()
            .map_err(|_| SpeedtestError::JobLockPoisoned)?;
        if let Some(previous) = active.replace(Arc::clone(&cancel)) {
            previous.store(true, Ordering::SeqCst);
        }

        Ok(cancel)
    }

    fn finish_job(&self, cancel: &CancellationFlag) -> Result<()> {
        let mut active = self
            .active_cancel
            .lock()
            .map_err(|_| SpeedtestError::JobLockPoisoned)?;
        if active
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, cancel))
        {
            *active = None;
        }

        Ok(())
    }
}
