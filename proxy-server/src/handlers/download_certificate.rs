use crate::client::BackendClient;
use crate::error::AppError;
use axum::{
    http::{StatusCode, header},
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
    payload: Value,
) -> Result<Response, AppError> {
    // Validate required field
    let work_id = payload
        .get("work_id")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Missing or invalid work_id field".into()))?;

    tracing::info!(work_id = work_id, "Processing download-certificate request");

    // Forward to backend
    let path = format!("/v1/works/{}/download/certificate", work_id);
    let (status, body, _duration) = client.get(&path).await?;

    Ok((
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}
