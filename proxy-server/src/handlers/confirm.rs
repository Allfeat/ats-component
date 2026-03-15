use crate::client::BackendClient;
use crate::error::AppError;
use axum::{
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

/// Handle the `confirm` action.
///
/// Confirms a prepared registration job to start blockchain submission.
/// Forwards to `POST /v1/works/confirm` with the Authorization header.
///
/// Required fields:
/// - `job_id`: The job ID from prepare response (string)
pub async fn handle_confirm(
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

    // Build request body
    let request_body = json!({
        "job_id": job_id,
    });

    tracing::info!(
        job_id = job_id,
        has_auth = auth_header.is_some(),
        "Processing confirm request"
    );

    // Forward to backend with auth header
    let (status, body, _duration) = client
        .post_with_auth("/v1/works/confirm", &request_body, auth_header.as_deref())
        .await?;

    // Return 202 Accepted for async operation
    let response_status = if status == 200 || status == 202 {
        StatusCode::ACCEPTED
    } else {
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR)
    };

    // Strip the backend API path prefix from ws_url and status_url
    // so they match the proxy's own routes (/v1/transactions/{id}, not /ats/v1/transactions/{id})
    let prefix = client.api_path_prefix();
    let body = if !prefix.is_empty() {
        if let Ok(mut json) = serde_json::from_str::<Value>(&body) {
            for key in &["ws_url", "status_url"] {
                if let Some(val) = json.get(*key).and_then(Value::as_str) {
                    if let Some(stripped) = val.strip_prefix(prefix) {
                        json[*key] = Value::String(stripped.to_string());
                    }
                }
            }
            json.to_string()
        } else {
            body
        }
    } else {
        body
    };

    Ok((
        response_status,
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}
