//! OpenRouter's OpenAI-compatible chat completions API, streamed over SSE.

use super::{AiEvent, ChatRequest};
use futures_util::StreamExt;
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;

pub const URL: &str = "https://openrouter.ai/api/v1/chat/completions";
pub const DEFAULT_MODEL: &str = "anthropic/claude-sonnet-5.5";

#[derive(Debug, PartialEq)]
pub enum SseEvent {
    Delta(String),
    Error(String),
    Done,
    Ignore,
}

/// Parse one SSE line (`data: {...}`, `data: [DONE]`, or `: comment`).
pub fn parse_sse_line(line: &str) -> SseEvent {
    let Some(data) = line.strip_prefix("data:").map(str::trim) else {
        return SseEvent::Ignore;
    };
    if data == "[DONE]" {
        return SseEvent::Done;
    }
    let Ok(v) = serde_json::from_str::<Value>(data) else {
        return SseEvent::Ignore;
    };
    if let Some(msg) = v["error"]["message"].as_str() {
        return SseEvent::Error(msg.to_string());
    }
    match v["choices"][0]["delta"]["content"].as_str() {
        Some(t) if !t.is_empty() => SseEvent::Delta(t.to_string()),
        _ => SseEvent::Ignore,
    }
}

pub fn body(req: &ChatRequest) -> Value {
    let mut messages = vec![json!({ "role": "system", "content": req.system })];
    messages.extend(req.messages.iter().map(|m| json!({ "role": m.role, "content": m.content })));
    let model = req.model.as_deref().filter(|m| !m.trim().is_empty()).unwrap_or(DEFAULT_MODEL);
    json!({ "model": model, "messages": messages, "stream": true })
}

pub async fn stream(req: &ChatRequest, key: &str, cancel: &CancellationToken, emit: &(impl Fn(AiEvent) + Send + Sync)) -> Result<(), String> {
    let resp = reqwest::Client::new()
        .post(URL)
        .bearer_auth(key)
        .header("HTTP-Referer", "https://github.com/studih")
        .header("X-Title", "Studih")
        .json(&body(req))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach OpenRouter: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let msg = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(String::from))
            .unwrap_or(text);
        return Err(format!("OpenRouter error {status}: {msg}"));
    }

    let mut bytes = resp.bytes_stream();
    let mut buf = String::new();
    loop {
        let chunk = tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            c = bytes.next() => c,
        };
        let Some(chunk) = chunk else { return Ok(()) };
        buf.push_str(&String::from_utf8_lossy(&chunk.map_err(|e| e.to_string())?));
        while let Some(nl) = buf.find('\n') {
            let line: String = buf.drain(..=nl).collect();
            match parse_sse_line(line.trim_end()) {
                SseEvent::Delta(t) => emit(AiEvent::Delta { text: t }),
                SseEvent::Error(e) => return Err(e),
                SseEvent::Done => return Ok(()),
                SseEvent::Ignore => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::{ChatMessage, Provider};

    #[test]
    fn parses_sse() {
        assert_eq!(
            parse_sse_line(r#"data: {"id":"x","choices":[{"index":0,"delta":{"role":"assistant","content":"Hel"}}]}"#),
            SseEvent::Delta("Hel".into())
        );
        assert_eq!(parse_sse_line(r#"data: {"choices":[{"delta":{"content":""}}]}"#), SseEvent::Ignore);
        assert_eq!(parse_sse_line(": OPENROUTER PROCESSING"), SseEvent::Ignore);
        assert_eq!(parse_sse_line("data: [DONE]"), SseEvent::Done);
        assert_eq!(
            parse_sse_line(r#"data: {"error":{"code":429,"message":"Rate limited"}}"#),
            SseEvent::Error("Rate limited".into())
        );
    }

    #[test]
    fn builds_body_with_system_first_and_default_model() {
        let req = ChatRequest {
            provider: Provider::Openrouter,
            model: Some("  ".into()),
            system: "sys".into(),
            messages: vec![ChatMessage { role: "user".into(), content: "hi".into() }],
        };
        let b = body(&req);
        assert_eq!(b["model"], DEFAULT_MODEL);
        assert_eq!(b["messages"][0]["role"], "system");
        assert_eq!(b["messages"][1]["content"], "hi");
        assert_eq!(b["stream"], true);
    }
}
