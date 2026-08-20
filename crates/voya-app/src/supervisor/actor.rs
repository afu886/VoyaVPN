use super::*;

impl SupervisorActor {
    pub(super) fn new(deps: SupervisorDeps, tx: mpsc::WeakSender<SupervisorCommand>) -> Self {
        Self {
            deps,
            tx,
            running: RunningCore::empty(),
            native_tun_generation: 0,
        }
    }

    pub(super) fn handle(&mut self, command: SupervisorCommand) {
        match command {
            SupervisorCommand::Start(request, reply) => {
                let _ = reply.send(self.start(*request));
            }
            SupervisorCommand::Stop(reply) => {
                let _ = reply.send(self.stop());
            }
            SupervisorCommand::Restart(request, reply) => {
                let _ = reply.send(self.stop().and_then(|_| self.start(*request)));
            }
            SupervisorCommand::Status(reply) => {
                let _ = reply.send(Ok(self.running.snapshot()));
            }
            SupervisorCommand::ProcessExited {
                process_id,
                exit_code,
                reply,
            } => {
                let _ = reply.send(self.process_exited(process_id, exit_code));
            }
            SupervisorCommand::NativeTunExited {
                generation,
                message,
            } => {
                self.native_tun_exited(generation, message);
            }
        }
    }

    pub(super) fn start(
        &mut self,
        request: SupervisorStartRequest,
    ) -> Result<SupervisorSnapshot, SupervisorError> {
        self.stop()?;

        let backend = supervisor_tun_backend(self.deps.target_os, request.tun_enabled);
        if backend.is_native() {
            return self.start_native_tun(request, backend);
        }

        if self.deps.target_os == TargetOs::Windows && request.tun_enabled {
            self.deps.tun_cleaner.cleanup_before_start()?;
        }

        let job = if self.deps.target_os == TargetOs::Windows {
            self.deps.job_factory.create_job()?
        } else {
            None
        };

        let mut partial = RunningCore {
            active_profile_id: request.active_profile_id.clone(),
            main: None,
            pre: None,
            native_tun: None,
            elevated: Vec::new(),
            job,
            last_request: Some(request.clone()),
            running_core_type: Some(request.main.core_type),
        };

        let main = self.spawn_process(ProcessRole::Main, &request.main, &request)?;
        partial.main = Some(main.clone());
        if process_uses_unix_sudo(&self.deps, &request.main, request.tun_enabled) {
            partial.elevated.push(main.clone());
        }
        if let Some(job) = partial.job.as_mut() {
            if let Err(error) = job.assign(&main) {
                return self.cleanup_partial_start(partial, SupervisorError::from(error));
            }
        }

        if let Some(pre_spec) = &request.pre {
            let pre = match self.spawn_process(ProcessRole::Pre, pre_spec, &request) {
                Ok(pre) => pre,
                Err(error) => return self.cleanup_partial_start(partial, error),
            };
            partial.pre = Some(pre.clone());
            if process_uses_unix_sudo(&self.deps, pre_spec, request.tun_enabled) {
                partial.elevated.push(pre.clone());
            }
            if let Some(job) = partial.job.as_mut() {
                if let Err(error) = job.assign(&pre) {
                    return self.cleanup_partial_start(partial, SupervisorError::from(error));
                }
            }
        }

        let running_core_type = request
            .pre
            .as_ref()
            .map_or(request.main.core_type, |pre| pre.core_type);
        partial.running_core_type = Some(running_core_type);

        self.running = partial;

        Ok(self.running.snapshot())
    }

    fn start_native_tun(
        &mut self,
        request: SupervisorStartRequest,
        backend: TunBackend,
    ) -> Result<SupervisorSnapshot, SupervisorError> {
        let native_request = native_tun_start_request(&request, backend)?;
        self.deps.native_tun_controller.start(native_request)?;
        self.native_tun_generation = self.native_tun_generation.wrapping_add(1);
        let generation = self.native_tun_generation;

        let running_core_type = request
            .pre
            .as_ref()
            .map_or(request.main.core_type, |pre| pre.core_type);
        self.running = RunningCore {
            active_profile_id: request.active_profile_id.clone(),
            main: None,
            pre: None,
            native_tun: Some(RunningNativeTun {
                backend,
                generation,
            }),
            elevated: Vec::new(),
            job: None,
            last_request: Some(request),
            running_core_type: Some(running_core_type),
        };
        self.spawn_native_tun_health_watcher(generation, backend);

        Ok(self.running.snapshot())
    }

    fn stop(&mut self) -> Result<SupervisorSnapshot, SupervisorError> {
        let running = std::mem::replace(&mut self.running, RunningCore::empty());

        match self.stop_running(&running) {
            Ok(()) => Ok(SupervisorSnapshot::disconnected()),
            Err(error) => {
                self.running = running;
                Err(error)
            }
        }
    }

    fn stop_running(&self, running: &RunningCore) -> Result<(), SupervisorError> {
        let mut first_error = None;

        if let Some(native_tun) = &running.native_tun {
            if let Err(error) = self.deps.native_tun_controller.stop(native_tun.backend) {
                first_error.get_or_insert(SupervisorError::from(error));
            }
        }

        for handle in &running.elevated {
            self.sudo_kill(handle, running)?;
        }

        if let Some(main) = &running.main {
            if let Err(error) = self.deps.runner.stop(main) {
                first_error.get_or_insert(SupervisorError::from(error));
            }
        }

        if let Some(pre) = &running.pre {
            if let Err(error) = self.deps.runner.stop(pre) {
                first_error.get_or_insert(SupervisorError::from(error));
            }
        }

        match first_error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    fn cleanup_partial_start(
        &self,
        running: RunningCore,
        start_error: SupervisorError,
    ) -> Result<SupervisorSnapshot, SupervisorError> {
        match self.stop_running(&running) {
            Ok(()) => Err(start_error),
            Err(cleanup_error) => Err(cleanup_error),
        }
    }

    fn process_exited(
        &mut self,
        process_id: u32,
        _exit_code: Option<i32>,
    ) -> Result<SupervisorSnapshot, SupervisorError> {
        if !self.running.contains_pid(process_id) {
            return Ok(self.running.snapshot());
        }

        let restart = self
            .running
            .last_request
            .clone()
            .filter(|request| request.restart_on_crash);
        self.stop()?;

        if let Some(request) = restart {
            self.start(request)
        } else {
            Ok(SupervisorSnapshot::disconnected())
        }
    }

    fn native_tun_exited(&mut self, generation: u64, message: String) {
        let Some(native_tun) = &self.running.native_tun else {
            return;
        };
        if native_tun.generation != generation {
            return;
        }

        let backend = native_tun.backend;
        let active_profile_id = self.running.active_profile_id.clone();
        let running = std::mem::replace(&mut self.running, RunningCore::empty());
        if let Err(error) = self.stop_running(&running) {
            tracing::warn!(
                ?error,
                "failed to stop native TUN after provider terminal state"
            );
        }
        self.deps.event_sink.native_tun_exited(NativeTunExitEvent {
            active_profile_id,
            backend,
            message,
        });
    }

    fn spawn_native_tun_health_watcher(&self, generation: u64, backend: TunBackend) {
        let controller = Arc::clone(&self.deps.native_tun_controller);
        let tx = self.tx.clone();
        let interval = self.deps.native_tun_health_interval;
        tokio::spawn(async move {
            loop {
                if tx.upgrade().is_none() {
                    return;
                }
                tokio::time::sleep(interval).await;
                let status = match tokio::task::spawn_blocking({
                    let controller = Arc::clone(&controller);
                    move || controller.status(backend)
                })
                .await
                {
                    Ok(status) => status,
                    Err(error) => {
                        tracing::warn!(?error, "native TUN health watcher status task failed");
                        return;
                    }
                };

                let Some(message) = terminal_native_tun_message(&status) else {
                    continue;
                };
                let Some(tx) = tx.upgrade() else {
                    return;
                };
                let _ = tx
                    .send(SupervisorCommand::NativeTunExited {
                        generation,
                        message,
                    })
                    .await;
                return;
            }
        });
    }

    fn spawn_process(
        &self,
        role: ProcessRole,
        spec: &CoreProcessSpec,
        request: &SupervisorStartRequest,
    ) -> Result<ProcessHandle, SupervisorError> {
        let mut spawn = ProcessSpawn::from_core_launch(role, &spec.launch, spec.display_log)?;

        if process_uses_unix_sudo(&self.deps, spec, request.tun_enabled) {
            let launcher = self.elevation_launcher(spec.core_type)?;
            spawn = wrap_spawn_with_unix_sudo_passwordless(spawn, &launcher);
        }

        let handle = self.deps.runner.spawn(spawn)?;
        Ok(handle)
    }

    fn sudo_kill(
        &self,
        handle: &ProcessHandle,
        running: &RunningCore,
    ) -> Result<(), SupervisorError> {
        if running.last_request.is_none() {
            return Ok(());
        }
        let target = running
            .sudo_kill_target(handle)
            .ok_or(SupervisorError::UnknownSudoKillTarget { pid: handle.id() })?;
        let launcher = self.elevation_launcher(target.core_type)?;
        let spawn = unix_sudo_kill_spawn_passwordless(
            self.deps.target_os,
            &launcher,
            handle.id(),
            &target.launch.executable,
            target.launch.working_dir.clone(),
        )?;
        let output = self.deps.runner.run_oneshot(spawn)?;
        ensure_sudo_kill_success(handle.id(), output)
    }

    /// Resolve the root-owned elevation launcher, requiring an active grant.
    fn elevation_launcher(&self, core_type: CoreType) -> Result<PathBuf, SupervisorError> {
        if !self.deps.elevation.is_granted() {
            return Err(SupervisorError::ElevationNotGranted(core_type));
        }
        elevate_launcher_path(self.deps.target_os)
            .ok_or(SupervisorError::ElevationNotGranted(core_type))
    }
}

impl Drop for SupervisorActor {
    fn drop(&mut self) {
        let running = std::mem::replace(&mut self.running, RunningCore::empty());
        if let Err(error) = self.stop_running(&running) {
            tracing::warn!(?error, "failed to stop core supervisor during actor drop");
        }
    }
}
