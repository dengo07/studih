//! Drive the user's installed `claude` CLI in headless mode.
//!
//! The CLI is run with every tool and MCP server disabled, in an empty scratch directory, so it can
//! only answer in text. It authenticates with whatever login the user already has.

use super::{AiEvent, ChatMessage, ChatRequest};
use serde_json::Value;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

pub const BINARY: &str = "claude";

pub fn args(req: &ChatRequest) -> Vec<String> {
    let mut args: Vec<String> = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--tools",
        "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-session-persistence",
        "--system-prompt",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    args.push(req.system.clone());
    if let Some(model) = req.model.as_deref().filter(|m| !m.trim().is_empty()) {
        args.push("--model".into());
        args.push(model.into());
    }
    args
}

/// The CLI takes a single prompt, so earlier turns are replayed as a transcript.
pub fn prompt(messages: &[ChatMessage]) -> String {
    match messages {
        [] => String::new(),
        [only] => only.content.clone(),
        [history @ .., last] => {
            let mut out = String::from("<conversation_so_far>\n");
            for m in history {
                let who = if m.role == "assistant" { "Assistant" } else { "User" };
                out.push_str(&format!("{who}: {}\n\n", m.content.trim()));
            }
            out.push_str("</conversation_so_far>\n\nContinue the conversation. The user now says:\n\n");
            out.push_str(&last.content);
            out
        }
    }
}

/// What one stdout line means for us.
#[derive(Debug, PartialEq)]
pub enum Line {
    Delta(String),
    /// A complete assistant message (only used if no deltas were streamed).
    Message(String),
    /// The final result line; `Some` carries an error message.
    Result(Option<String>),
    Other,
}

pub fn parse_line(line: &str) -> Line {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        return Line::Other;
    };
    match v["type"].as_str() {
        Some("stream_event") => {
            let ev = &v["event"];
            if ev["type"] == "content_block_delta" && ev["delta"]["type"] == "text_delta" {
                if let Some(t) = ev["delta"]["text"].as_str() {
                    return Line::Delta(t.to_string());
                }
            }
            Line::Other
        }
        Some("assistant") => {
            let text: String = v["message"]["content"]
                .as_array()
                .map(|blocks| {
                    blocks
                        .iter()
                        .filter(|b| b["type"] == "text")
                        .filter_map(|b| b["text"].as_str())
                        .collect()
                })
                .unwrap_or_default();
            Line::Message(text)
        }
        Some("result") => {
            if v["is_error"].as_bool() == Some(true) {
                let msg = v["result"].as_str().or(v["error"].as_str()).unwrap_or("Claude CLI reported an error");
                Line::Result(Some(msg.to_string()))
            } else {
                Line::Result(None)
            }
        }
        _ => Line::Other,
    }
}

fn scratch_dir() -> std::io::Result<std::path::PathBuf> {
    let dir = std::env::temp_dir().join("studih-claude");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub async fn stream(req: &ChatRequest, cancel: &CancellationToken, emit: &(impl Fn(AiEvent) + Send + Sync)) -> Result<(), String> {
    let mut child = Command::new(BINARY)
        .args(args(req))
        .current_dir(scratch_dir().map_err(|e| e.to_string())?)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => "The `claude` CLI wasn't found on your PATH. Install Claude Code or switch to OpenRouter in Settings.".to_string(),
            _ => format!("Couldn't start the claude CLI: {e}"),
        })?;

    let mut stdin = child.stdin.take().expect("piped stdin");
    let input = prompt(&req.messages);
    stdin.write_all(input.as_bytes()).await.map_err(|e| e.to_string())?;
    drop(stdin);

    let mut stderr = child.stderr.take().expect("piped stderr");
    let mut lines = BufReader::new(child.stdout.take().expect("piped stdout")).lines();
    let mut streamed_any = false;
    let mut error: Option<String> = None;

    loop {
        let next = tokio::select! {
            _ = cancel.cancelled() => {
                let _ = child.kill().await;
                return Ok(());
            }
            line = lines.next_line() => line.map_err(|e| e.to_string())?,
        };
        let Some(line) = next else { break };
        match parse_line(&line) {
            Line::Delta(t) => {
                streamed_any = true;
                emit(AiEvent::Delta { text: t });
            }
            Line::Message(t) if !streamed_any && !t.is_empty() => emit(AiEvent::Delta { text: t }),
            Line::Result(Some(e)) => error = Some(e),
            _ => {}
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if let Some(e) = error {
        return Err(e);
    }
    if !status.success() {
        let mut err = String::new();
        let _ = stderr.read_to_string(&mut err).await;
        let err = err.trim();
        return Err(if err.is_empty() { format!("claude exited with {status}") } else { err.to_string() });
    }
    Ok(())
}

/// `claude --version`, or `None` if it isn't installed.
pub async fn version() -> Option<String> {
    let out = Command::new(BINARY).arg("--version").output().await.ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage { role: role.into(), content: content.into() }
    }

    #[test]
    fn parses_stream_lines() {
        let delta = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi there"}},"session_id":"x"}"#;
        assert_eq!(parse_line(delta), Line::Delta("hi there".into()));

        let start = r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}"#;
        assert_eq!(parse_line(start), Line::Other);

        let assistant = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"a"},{"type":"tool_use"},{"type":"text","text":"b"}]}}"#;
        assert_eq!(parse_line(assistant), Line::Message("ab".into()));

        assert_eq!(parse_line(r#"{"type":"result","subtype":"success","is_error":false,"result":"hi"}"#), Line::Result(None));
        assert_eq!(
            parse_line(r#"{"type":"result","is_error":true,"result":"Not logged in"}"#),
            Line::Result(Some("Not logged in".into()))
        );
        assert_eq!(parse_line("not json"), Line::Other);
    }

    #[test]
    fn builds_transcript_prompt() {
        assert_eq!(prompt(&[msg("user", "hello")]), "hello");
        let p = prompt(&[msg("user", "what is 2+2"), msg("assistant", "4"), msg("user", "and times 3?")]);
        assert!(p.contains("User: what is 2+2\n\nAssistant: 4"));
        assert!(p.ends_with("and times 3?"));
    }

    #[test]
    fn args_disable_tools_and_pass_model() {
        let req = ChatRequest {
            provider: super::super::Provider::ClaudeCli,
            model: Some("sonnet".into()),
            system: "be brief".into(),
            messages: vec![],
        };
        let a = args(&req);
        let tools = a.iter().position(|x| x == "--tools").unwrap();
        assert_eq!(a[tools + 1], "");
        assert!(a.contains(&"--strict-mcp-config".to_string()));
        assert_eq!(a[a.iter().position(|x| x == "--system-prompt").unwrap() + 1], "be brief");
        assert_eq!(a.last().unwrap(), "sonnet");
    }

    /// Real round trip through the installed CLI. Run with `cargo test -p studih-core -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn live_claude_cli() {
        let req = ChatRequest {
            provider: super::super::Provider::ClaudeCli,
            model: None,
            system: "Reply tersely.".into(),
            messages: vec![msg("user", "Reply with exactly the word: pong")],
        };
        let out = std::sync::Mutex::new(String::new());
        let result = stream(&req, &CancellationToken::new(), &|e| {
            if let AiEvent::Delta { text } = e {
                out.lock().unwrap().push_str(&text);
            }
        })
        .await;
        assert_eq!(result, Ok(()));
        assert!(out.lock().unwrap().to_lowercase().contains("pong"));
    }
}
