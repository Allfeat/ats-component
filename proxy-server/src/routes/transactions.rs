use crate::client::BackendClient;
use crate::error::AppError;
use crate::handlers;
use axum::{
    extract::{Path, State, WebSocketUpgrade},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use std::sync::Arc;

/// Handle GET requests for transaction status (polling fallback).
///
/// Forwards to `GET /v1/transactions/{transaction_id}` on the backend.
pub async fn get_status(
    State(client): State<Arc<BackendClient>>,
    Path(transaction_id): Path<String>,
) -> Result<Response, AppError> {
    tracing::info!(
        transaction_id = %transaction_id,
        "Processing transaction status request"
    );

    let path = format!("/v1/transactions/{}", transaction_id);
    let (status, body, _duration) = client.get(&path).await?;

    Ok((
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}

/// Handle WebSocket upgrade for real-time transaction tracking.
///
/// Upgrades to a WebSocket connection and proxies to the backend.
pub async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(client): State<Arc<BackendClient>>,
    Path(transaction_id): Path<String>,
) -> impl IntoResponse {
    handlers::ws_handler(ws, State(client), Path(transaction_id)).await
}
