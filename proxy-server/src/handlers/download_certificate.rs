use crate::client::BackendClient;
use crate::error::AppError;
use axum::{
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::Value;

/// Handle the `download-certificate` action.
///
/// Validates the request payload and forwards to `GET /v1/works/{work_id}/download/certificate`.
///
/// Required fields:
/// - `work_id`: The work ID to download the certificate for (string)
pub async fn handle_download_certificate(
    client: &BackendClient,
    headers: &HeaderMap,
    payload: Value,
) -> Result<Response, AppError> {
    // Validate required field
    let work_id = payload
        .get("work_id")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Missing or invalid work_id field".into()))?;

    tracing::info!(work_id = work_id, "Processing download-certificate request");

    // Extract auth header to forward to backend
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    // Forward to backend with auth
    let path = format!("/v1/works/{}/download/certificate", work_id);
    let (status, body, _duration) = client.get_with_auth(&path, auth_header).await?;

    Ok((
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}
