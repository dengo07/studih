use std::collections::HashMap;
use std::sync::Mutex;

use studih_core::ai::{self, AiEvent, ChatRequest};
use studih_core::secrets;
use tauri::State;
use tauri::ipc::Channel;
use tauri_plugin_sql::{Migration, MigrationKind};
use tokio_util::sync::CancellationToken;

pub const DB_URL: &str = "sqlite:studih.db";

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "plan item kind",
            sql: include_str!("../migrations/002_plan_kind.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// In-flight AI requests, so the UI can stop one.
#[derive(Default)]
struct AiJobs(Mutex<HashMap<String, CancellationToken>>);

#[tauri::command]
async fn ai_stream(
    request_id: String,
    request: ChatRequest,
    on_event: Channel<AiEvent>,
    jobs: State<'_, AiJobs>,
) -> Result<(), String> {
    let token = CancellationToken::new();
    jobs.0.lock().unwrap().insert(request_id.clone(), token.clone());
    ai::stream_chat(request, token, |e| {
        let _ = on_event.send(e);
    })
    .await;
    jobs.0.lock().unwrap().remove(&request_id);
    Ok(())
}

#[tauri::command]
fn ai_cancel(request_id: String, jobs: State<'_, AiJobs>) {
    if let Some(token) = jobs.0.lock().unwrap().remove(&request_id) {
        token.cancel();
    }
}

#[tauri::command]
fn openrouter_key_status() -> Result<bool, String> {
    secrets::get_openrouter_key().map(|k| k.is_some())
}

#[tauri::command]
fn set_openrouter_key(key: String) -> Result<(), String> {
    secrets::set_openrouter_key(&key)
}

#[tauri::command]
async fn claude_cli_version() -> Option<String> {
    ai::claude_cli::version().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .manage(AiJobs::default())
        .invoke_handler(tauri::generate_handler![
            ai_stream,
            ai_cancel,
            openrouter_key_status,
            set_openrouter_key,
            claude_cli_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
