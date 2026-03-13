use crate::client::BackendClient;
use crate::error::AppError;
use axum::{
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

/// Handle the `parse-cert` action.
///
/// Validates the request payload and forwards to `POST /v1/certificates/parse?network=...`.
///
/// Required fields:
/// - `certificate`: The certificate string to parse
pub async fn handle_parse_cert(
    client: &BackendClient,
    headers: &HeaderMap,
    payload: Value,
) -> Result<Response, AppError> {
    // Validate required field
    let certificate = payload
        .get("certificate")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Missing or invalid certificate field".into()))?;

    tracing::info!(
        certificate_len = certificate.len(),
        "Processing parse-cert request"
    );

    // Build request body
    let request_body = json!({
        "certificate": certificate,
    });

    // Extract Authorization header to forward to backend
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    // Forward to backend with network query param
    let path = format!("/v1/certificates/parse?network={}", client.network());
    let (status, body, _duration) = client
        .post_with_auth(&path, &request_body, auth_header.as_deref())
        .await?;

    Ok((
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}
