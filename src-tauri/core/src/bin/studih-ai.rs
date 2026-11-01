//! Dev-only bridge used by the Vite dev server so the UI can be exercised in a plain browser
//! with the same Rust AI code the Tauri app uses. Not shipped with the app.
//!
//!   studih-ai chat            < ChatRequest JSON   → one AiEvent JSON per line
//!   studih-ai key-status                           → true | false
//!   studih-ai set-key         < key                → null
//!   studih-ai claude-version                       → "x.y.z" | null

use std::io::Read;
use studih_core::{ai, secrets};
use tokio_util::sync::CancellationToken;

fn stdin() -> String {
    let mut s = String::new();
    std::io::stdin().read_to_string(&mut s).expect("read stdin");
    s
}

fn print_json<T: serde::Serialize>(v: &T) {
    println!("{}", serde_json::to_string(v).unwrap());
}

#[tokio::main]
async fn main() {
    let cmd = std::env::args().nth(1).unwrap_or_default();
    match cmd.as_str() {
        "chat" => {
            let req: ai::ChatRequest = match serde_json::from_str(&stdin()) {
                Ok(r) => r,
                Err(e) => return print_json(&ai::AiEvent::Error { message: format!("bad request: {e}") }),
            };
            ai::stream_chat(req, CancellationToken::new(), |e| print_json(&e)).await;
        }
        "key-status" => print_json(&secrets::get_openrouter_key().map(|k| k.is_some()).unwrap_or(false)),
        "set-key" => match secrets::set_openrouter_key(&stdin()) {
            Ok(()) => print_json(&()),
            Err(e) => {
                eprintln!("{e}");
                std::process::exit(1);
            }
        },
        "claude-version" => print_json(&ai::claude_cli::version().await),
        _ => {
            eprintln!("usage: studih-ai chat|key-status|set-key|claude-version");
            std::process::exit(2);
        }
    }
}
