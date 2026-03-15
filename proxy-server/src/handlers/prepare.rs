use crate::client::BackendClient;
use crate::error::AppError;
use axum::{
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

/// Handle the `prepare` action.
///
/// Validates the job_id, injects the passphrase from configuration,
/// and forwards to `POST /v1/works/prepare` with the Authorization header.
///
/// Required fields:
/// - `job_id`: The job ID from init response (string)
pub async fn handle_prepare(
    client: &BackendClient,
    headers: &HeaderMap,
    payload: Value,
) -> Result<Response, AppError> {
    // Validate required field
    let job_id = payload
        .get("job_id")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Missing or invalid job_id field".into()))?;

    // Extract Authorization header to forward
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    // Build request body with injected passphrase
    let request_body = json!({
        "job_id": job_id,
        "passphrase": client.passphrase(),
    });

    tracing::info!(
        job_id = job_id,
        has_auth = auth_header.is_some(),
        "Processing prepare request"
    );

    // Forward to backend with auth header
    let (status, body, _duration) = client
        .post_with_auth(
            "/v1/works/prepare",
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
