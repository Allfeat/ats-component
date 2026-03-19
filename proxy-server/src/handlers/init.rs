use crate::client::BackendClient;
use crate::error::AppError;
use axum::{
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

/// Handle the `init` action.
///
/// Initiates the registration flow by calling the backend `/v1/works/init` endpoint.
/// Returns a `job_id` and `upload_url` (presigned S3 URL) to the client.
///
/// Required fields:
/// - `title`: Work title (string)
/// - `creators`: Array of creator objects
/// - `filename`: Original filename (string)
///
/// The network is always determined by the proxy server configuration.
///
/// The client should then:
/// 1. Upload the file directly to S3 using the `upload_url`
/// 2. Call `/prepare` with the `job_id`
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

    // Always use network from server config (client cannot override)
    let network = client.network();

    tracing::info!(
        title = title,
        creators_count = creators.len(),
        filename = filename,
        network = network,
        "Handling init request"
    );

    // Build init request body
    let init_body = json!({
        "network": network,
        "title": title,
        "creators": creators,
        "filename": filename,
    });

    // Extract Authorization header to forward to backend
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    // Call backend init endpoint with auth header forwarded
    let (status, body, _duration) = client
        .post_with_auth("/v1/works/init", &init_body, auth_header.as_deref())
        .await?;

    tracing::info!(status = status, "Init request completed");

    Ok((
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}
