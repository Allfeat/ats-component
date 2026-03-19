use crate::client::BackendClient;
use crate::error::AppError;
use axum::{
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

/// Handle the `register` action.
///
/// Validates the request payload, injects the passphrase from configuration,
/// and forwards to `POST /v1/works/register`.
///
/// Required fields:
/// - `title`: Work title (string)
/// - `creators`: Array of creator objects
/// - `audio_base64`: Base64-encoded audio data (string)
/// - `filename`: Original filename (string)
///
/// The network is always determined by the proxy server configuration.
pub async fn handle_register(
    client: &BackendClient,
    payload: Value,
) -> Result<Response, AppError> {
    // Validate required fields
    let title = payload
        .get("title")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Missing or invalid title field".into()))?;

    let creators = payload
        .get("creators")
        .and_then(Value::as_array)
        .filter(|arr| !arr.is_empty())
        .ok_or_else(|| AppError::BadRequest("Missing or invalid creators field".into()))?;

    let audio_base64 = payload
        .get("audio_base64")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Missing or invalid audio_base64 field".into()))?;

    let filename = payload
        .get("filename")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Missing or invalid filename field".into()))?;

    // Always use network from server config (client cannot override)
    let network = client.network();

    // Build request body with injected passphrase
    let request_body = json!({
        "network": network,
        "title": title,
        "creators": creators,
        "audio_base64": audio_base64,
        "filename": filename,
        "passphrase": client.passphrase(),
    });

    // Log with truncated audio data
    tracing::info!(
        title = title,
        creators_count = creators.len(),
        audio_size = audio_base64.len(),
        filename = filename,
        network = network,
        "Processing register request"
    );

    // Forward to backend
    let (status, body, _duration) = client.post("/v1/works/register", &request_body).await?;

    Ok((
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}
