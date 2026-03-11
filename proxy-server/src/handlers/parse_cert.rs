use crate::client::BackendClient;
use crate::error::AppError;
use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::{json, Value};

/// Handle the `parse-cert` action.
///
/// Validates the request payload and forwards to `POST /v1/certificates/parse?network=...`.
///
/// Required fields:
/// - `certificate`: The certificate string to parse
pub async fn handle_parse_cert(client: &BackendClient, payload: Value) -> Result<Response, AppError> {
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

    // Forward to backend with network query param
    let path = format!("/v1/certificates/parse?network={}", client.network());
    let (status, body, _duration) = client.post(&path, &request_body).await?;

    Ok((
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}
