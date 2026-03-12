use axum::Json;
use serde_json::{Value, json};

/// Health check endpoint.
///
/// Returns a simple JSON response indicating the server is running.
pub async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "ats-proxy-server"
    }))
}
