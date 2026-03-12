use crate::client::BackendClient;
use axum::{
    extract::{
        Path, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message as TungsteniteMessage};

/// WebSocket upgrade handler for transaction tracking.
///
/// Upgrades the HTTP connection to WebSocket and establishes a bi-directional
/// proxy to the backend WebSocket at `/v1/ws/transactions/{transaction_id}`.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(client): State<Arc<BackendClient>>,
    Path(transaction_id): Path<String>,
) -> impl IntoResponse {
    tracing::info!(
        transaction_id = %transaction_id,
        "WebSocket upgrade request"
    );

    ws.on_upgrade(move |socket| handle_ws(socket, client, transaction_id))
}

/// Handle the WebSocket connection by proxying to the backend.
async fn handle_ws(client_ws: WebSocket, client: Arc<BackendClient>, transaction_id: String) {
    let backend_url = client.ws_url(&format!("/v1/ws/transactions/{}", transaction_id));

    tracing::info!(
        transaction_id = %transaction_id,
        backend_url = %backend_url,
        "Connecting to backend WebSocket"
    );

    // Connect to backend WebSocket
    let backend_ws = match connect_async(&backend_url).await {
        Ok((ws, _)) => ws,
        Err(e) => {
            tracing::error!(
                transaction_id = %transaction_id,
                error = %e,
                "Failed to connect to backend WebSocket"
            );
            return;
        }
    };

    tracing::info!(
        transaction_id = %transaction_id,
        "Backend WebSocket connected"
    );

    // Split both connections
    let (mut client_tx, mut client_rx) = client_ws.split();
    let (mut backend_tx, mut backend_rx) = backend_ws.split();

    // Create channels for clean shutdown coordination
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    let shutdown_tx2 = shutdown_tx.clone();

    // Forward client -> backend
    let client_to_backend = tokio::spawn(async move {
        while let Some(msg) = client_rx.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    tracing::debug!(
                        direction = "client->backend",
                        msg = %crate::logging::truncate(&text, 100),
                        "Forwarding message"
                    );
                    // Convert axum text to tungstenite text
                    if backend_tx
                        .send(TungsteniteMessage::Text(text.to_string().into()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Ok(Message::Binary(data)) => {
                    // Convert axum bytes to tungstenite bytes
                    if backend_tx
                        .send(TungsteniteMessage::Binary(data.to_vec().into()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Ok(Message::Close(_)) => {
                    let _ = backend_tx.send(TungsteniteMessage::Close(None)).await;
                    break;
                }
                Ok(Message::Ping(data)) => {
                    let _ = backend_tx
                        .send(TungsteniteMessage::Ping(data.to_vec().into()))
                        .await;
                }
                Ok(Message::Pong(data)) => {
                    let _ = backend_tx
                        .send(TungsteniteMessage::Pong(data.to_vec().into()))
                        .await;
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Client WebSocket error");
                    break;
                }
            }
        }
        let _ = shutdown_tx.send(()).await;
    });

    // Forward backend -> client
    let backend_to_client = tokio::spawn(async move {
        while let Some(msg) = backend_rx.next().await {
            match msg {
                Ok(TungsteniteMessage::Text(text)) => {
                    tracing::debug!(
                        direction = "backend->client",
                        msg = %crate::logging::truncate(&text, 100),
                        "Forwarding message"
                    );
                    // Convert tungstenite text to axum text
                    if client_tx
                        .send(Message::Text(text.to_string().into()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Ok(TungsteniteMessage::Binary(data)) => {
                    // Convert tungstenite bytes to axum bytes
                    if client_tx
                        .send(Message::Binary(data.to_vec().into()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Ok(TungsteniteMessage::Close(_)) => {
                    let _ = client_tx.send(Message::Close(None)).await;
                    break;
                }
                Ok(TungsteniteMessage::Ping(data)) => {
                    let _ = client_tx.send(Message::Ping(data.to_vec().into())).await;
                }
                Ok(TungsteniteMessage::Pong(data)) => {
                    let _ = client_tx.send(Message::Pong(data.to_vec().into())).await;
                }
                Ok(TungsteniteMessage::Frame(_)) => {
                    // Raw frames are not forwarded
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Backend WebSocket error");
                    break;
                }
            }
        }
        let _ = shutdown_tx2.send(()).await;
    });

    // Wait for either direction to complete
    tokio::select! {
        _ = shutdown_rx.recv() => {}
    }

    // Clean up
    client_to_backend.abort();
    backend_to_client.abort();

    tracing::info!(
        transaction_id = %transaction_id,
        "WebSocket proxy connection closed"
    );
}
