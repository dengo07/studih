//! Streaming chat over two backends: the local Claude Code CLI and the OpenRouter API.

pub mod claude_cli;
pub mod openrouter;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Provider {
    ClaudeCli,
    Openrouter,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatMessage {
    pub role: String, // "user" | "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub provider: Provider,
    /// Model id/alias. `None` → the backend's default.
    pub model: Option<String>,
    pub system: String,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AiEvent {
    Delta { text: String },
    Done,
    Error { message: String },
}

/// Run one request, reporting text deltas through `emit`. Always ends with `Done` or `Error`
/// (cancellation ends with `Done`).
pub async fn stream_chat(req: ChatRequest, cancel: CancellationToken, emit: impl Fn(AiEvent) + Send + Sync) {
    let result = match req.provider {
        Provider::ClaudeCli => claude_cli::stream(&req, &cancel, &emit).await,
        Provider::Openrouter => match crate::secrets::get_openrouter_key() {
            Ok(Some(key)) => openrouter::stream(&req, &key, &cancel, &emit).await,
            Ok(None) => Err("No OpenRouter API key set. Add one in Settings.".into()),
            Err(e) => Err(format!("Couldn't read the OpenRouter key from the system keyring: {e}")),
        },
    };
    match result {
        Ok(()) => emit(AiEvent::Done),
        Err(message) => emit(AiEvent::Error { message }),
    }
}
