use crate::client::BackendClient;
use crate::error::AppError;
use axum::{
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

/// Handle the `init` action.
///
/// Validates the request payload and forwards to `POST /v1/works/init`
/// with the Authorization header. Returns the presigned upload URL.
///
/// Required fields:
/// - `title`: Work title (string)
/// - `creators`: Array of creator objects (non-empty)
/// - `filename`: Original filename (string)
///
/// Optional fields:
/// - `network`: Network to use (defaults to config value)
pub async fn handle_init(
    client: &BackendClient,
    headers: &HeaderMap,
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

    let filename = payload
        .get("filename")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Missing or invalid filename field".into()))?;

    // Use provided network or default from config
    let network = payload
        .get("network")
        .and_then(Value::as_str)
        .unwrap_or(client.network());

    // Extract Authorization header to forward
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    // Build request body (no passphrase needed at init)
    let request_body = json!({
        "network": network,
        "title": title,
        "creators": creators,
        "filename": filename,
    });

    tracing::info!(
        title = title,
        creators_count = creators.len(),
        filename = filename,
        network = network,
        has_auth = auth_header.is_some(),
        "Processing init request"
    );

    // Forward to backend with auth header
    let (status, body, _duration) = client
        .post_with_auth(
            "/v1/works/init",
            &request_body,
            auth_header.as_deref(),
        )
        .await?;

    Ok((
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}
