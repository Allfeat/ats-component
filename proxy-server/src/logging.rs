use serde_json::Value;

/// Maximum length for truncated strings in logs.
const MAX_LOG_LENGTH: usize = 200;

/// Sensitive field names to mask in JSON logs.
const SENSITIVE_FIELDS: &[&str] = &["passphrase", "password", "secret", "api_key", "apiKey"];

/// Truncate a string for logging, adding "..." if truncated.
pub fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

/// Truncate with default max length.
pub fn truncate_default(s: &str) -> String {
    truncate(s, MAX_LOG_LENGTH)
}

/// Mask an API key for logging (show first 8 + last 4 chars).
pub fn mask_api_key(key: &str) -> String {
    if key.len() <= 12 {
        "***".to_string()
    } else {
        format!("{}...{}", &key[..8], &key[key.len() - 4..])
    }
}

/// Check if a field name is sensitive.
fn is_sensitive_field(name: &str) -> bool {
    let name_lower = name.to_lowercase();
    SENSITIVE_FIELDS
        .iter()
        .any(|&sensitive| name_lower.contains(sensitive))
}

/// Mask sensitive fields in a JSON value recursively.
pub fn mask_sensitive_json(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut masked = serde_json::Map::new();
            for (key, val) in map {
                if is_sensitive_field(key) {
                    masked.insert(key.clone(), Value::String("***".to_string()));
                } else {
                    masked.insert(key.clone(), mask_sensitive_json(val));
                }
            }
            Value::Object(masked)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(mask_sensitive_json).collect()),
        other => other.clone(),
    }
}

/// Log an incoming request.
pub fn log_incoming(method: &str, action: &str, body: &Value) {
    let masked_body = mask_sensitive_json(body);
    tracing::info!(
        method = method,
        action = action,
        body = %truncate_default(&masked_body.to_string()),
        "Incoming request"
    );
}

/// Log an outgoing request to the backend.
pub fn log_outgoing(url: &str, api_key: &str, body: &Value) {
    let masked_body = mask_sensitive_json(body);
    tracing::info!(
        url = url,
        api_key = %mask_api_key(api_key),
        body = %truncate_default(&masked_body.to_string()),
        "Forwarding to backend"
    );
}

/// Log a response from the backend.
pub fn log_response(status: u16, duration_ms: u128, body: &str) {
    tracing::info!(
        status = status,
        duration_ms = duration_ms,
        body = %truncate_default(body),
        "Backend response"
    );
}

/// Log an error with context.
#[allow(dead_code)]
pub fn log_error(context: &str, error: &str) {
    tracing::error!(context = context, error = error, "Request failed");
}
