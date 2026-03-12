use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

/// Application error types with automatic HTTP response conversion.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// Client sent invalid data (400 Bad Request)
    #[error("Bad request: {0}")]
    BadRequest(String),

    /// Backend service returned an error (502 Bad Gateway)
    #[error("Backend error: {0}")]
    BackendError(String),

    /// Internal server error (500 Internal Server Error)
    #[error("Internal error: {0}")]
    #[allow(dead_code)]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::BackendError(msg) => (StatusCode::BAD_GATEWAY, msg.clone()),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
        };

        tracing::error!(error = %message, status = %status.as_u16(), "Request failed");

        (status, Json(json!({ "error": message }))).into_response()
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::BackendError(format!("HTTP request failed: {}", err))
    }
}
