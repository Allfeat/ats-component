use crate::client::BackendClient;
use crate::error::AppError;
use crate::handlers;
use crate::logging;
use axum::{Json, extract::State, http::HeaderMap, response::Response};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

/// Request body for action-based routing.
#[derive(Deserialize)]
pub struct ActionRequest {
    /// The action to perform (register-raw, prepare-raw, confirm, download-certificate, parse-cert)
    pub action: String,
    /// Additional payload fields (flattened)
    #[serde(flatten)]
    pub payload: Value,
}

/// Handle POST requests with action-based routing.
///
/// Routes to the appropriate handler based on the `action` field:
/// - `register-raw` → Register a new work with raw audio (legacy single-phase)
/// - `prepare-raw` → Prepare registration (validation phase)
/// - `confirm` → Confirm registration (commit phase)
/// - `download-certificate` → Download a certificate for a work
/// - `parse-cert` → Parse a certificate string
pub async fn handle_action(
    State(client): State<Arc<BackendClient>>,
    headers: HeaderMap,
    Json(req): Json<ActionRequest>,
) -> Result<Response, AppError> {
    logging::log_incoming("POST", &req.action, &req.payload);

    match req.action.as_str() {
        // Two-phase registration flow
        "prepare-raw" => handlers::handle_prepare_raw(&client, &headers, req.payload).await,
        "confirm" => handlers::handle_confirm(&client, &headers, req.payload).await,
        // Legacy single-phase registration
        "register-raw" => handlers::handle_register_raw(&client, req.payload).await,
        // Utility actions
        "download-certificate" => handlers::handle_download_certificate(&client, req.payload).await,
        "parse-cert" => handlers::handle_parse_cert(&client, req.payload).await,
        _ => {
            tracing::warn!(action = %req.action, "Unknown action");
            Err(AppError::BadRequest(format!(
                "Unknown action: {}",
                req.action
            )))
        }
    }
}
