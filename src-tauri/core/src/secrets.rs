//! API keys live in the OS keyring (Secret Service / Keychain / Credential Manager), never on disk.

const SERVICE: &str = "com.deniz.studih";
const OPENROUTER: &str = "openrouter-api-key";

fn entry() -> keyring::Result<keyring::Entry> {
    keyring::Entry::new(SERVICE, OPENROUTER)
}

pub fn get_openrouter_key() -> Result<Option<String>, String> {
    match entry().and_then(|e| e.get_password()) {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Store the key, or remove it when `key` is empty.
pub fn set_openrouter_key(key: &str) -> Result<(), String> {
    let e = entry().map_err(|e| e.to_string())?;
    let key = key.trim();
    if key.is_empty() {
        match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        }
    } else {
        e.set_password(key).map_err(|e| e.to_string())
    }
}
