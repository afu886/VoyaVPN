use super::*;

#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
pub fn ipc_demo_round_trip<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: DemoRequest,
) -> Result<DemoResponse, AppError> {
    let response = DemoResponse {
        echoed_message: request.message.clone(),
        message_length: u32::try_from(request.message.chars().count()).unwrap_or(u32::MAX),
    };

    InvalidateEvent {
        keys: vec![QueryInvalidation {
            query_key: vec!["ipc-demo".to_string()],
            reason: "demo-round-trip".to_string(),
        }],
    }
    .emit(&app)
    .map_err(|error| AppError::EventEmit(error.to_string()))?;

    TransientStreamEvent::LogLine(LogLineEvent {
        id: next_log_line_id(),
        level: LogLevel::Info,
        line: format!("IPC demo echoed {} characters", response.message_length),
    })
    .emit(&app)
    .map_err(|error| AppError::EventEmit(error.to_string()))?;

    TransientStreamEvent::CoreState(CoreStateEvent {
        state: CoreState::Disconnected,
        active_profile_id: None,
        main_pid: None,
        pre_pid: None,
        running_core_type: None,
    })
    .emit(&app)
    .map_err(|error| AppError::EventEmit(error.to_string()))?;

    AppEvent::Notice(AppNotice {
        level: AppNoticeLevel::Info,
        title: "IPC demo".to_string(),
        message: Some("Typed command and event bridge are connected.".to_string()),
    })
    .emit(&app)
    .map_err(|error| AppError::EventEmit(error.to_string()))?;

    Ok(response)
}
