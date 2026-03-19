use crate::client::BackendClient;
use crate::error::AppError;
use axum::{
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

/// Handle the `prepare` action.
///
/// Completes the prepare phase of registration by calling the backend
/// `/v1/works/prepare` endpoint with the job_id.
///
/// This should be called after:
/// 1. Client called `/init` to get job_id and upload_url
/// 2. Client uploaded the file directly to S3 using upload_url
///
/// Required fields:
/// - `job_id`: The job ID returned from `/init`
///
/// Returns the prepare response containing fees, commitment, and expiration.
pub async fn handle_prepare(
    client: &BackendClient,
    headers: &HeaderMap,
    payload: Value,
) -> Result<Response, AppError> {
    // Extract job_id (only required field now)
    let job_id = payload
        .get("job_id")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Missing or invalid job_id field".into()))?;

    tracing::info!(job_id = job_id, "Handling prepare request");

    // Build prepare request body with passphrase
    let prepare_body = json!({
        "job_id": job_id,
        "passphrase": client.passphrase(),
    });

    // Extract Authorization header to forward to backend
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    // Call backend prepare endpoint with auth header forwarded
    let (status, body, _duration) = client
        .post_with_auth("/v1/works/prepare", &prepare_body, auth_header.as_deref())
        .await?;

    tracing::info!(status = status, job_id = job_id, "Prepare request completed");

    Ok((
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}
