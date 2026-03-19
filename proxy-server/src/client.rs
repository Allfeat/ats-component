use crate::config::BackendSettings;
use crate::error::AppError;
use reqwest::Client;
use serde_json::Value;
use std::time::Instant;

/// HTTP client wrapper for backend API requests.
#[derive(Clone)]
pub struct BackendClient {
    client: Client,
    config: BackendSettings,
}

impl BackendClient {
    /// Create a new backend client.
    pub fn new(client: Client, config: BackendSettings) -> Self {
        Self { client, config }
    }

    /// Get the passphrase.
    pub fn passphrase(&self) -> &str {
        &self.config.passphrase
    }

    /// Get the network.
    pub fn network(&self) -> &str {
        &self.config.network
    }

    /// Build the WebSocket URL for the backend.
    pub fn ws_url(&self, path: &str) -> String {
        let ws_base = self
            .config
            .api_url
            .replace("http://", "ws://")
            .replace("https://", "wss://");
        format!("{}{}", ws_base, path)
    }

    /// Send a POST request to the backend.
    pub async fn post(&self, path: &str, body: &Value) -> Result<(u16, String, u128), AppError> {
        self.post_with_auth(path, body, None).await
    }

    /// Send a POST request with optional Authorization header forwarding.
    ///
    /// This is used for session-based authentication where the client's
    /// session token needs to be forwarded to the backend.
    pub async fn post_with_auth(
        &self,
        path: &str,
        body: &Value,
        auth_header: Option<&str>,
    ) -> Result<(u16, String, u128), AppError> {
        let url = format!("{}{}", self.config.api_url, path);
        let start = Instant::now();

        crate::logging::log_outgoing(&url, &self.config.api_key, body);

        let mut request = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("x-api-key", &self.config.api_key);

        // Forward Authorization header if provided
        if let Some(auth) = auth_header {
            request = request.header("Authorization", auth);
            tracing::debug!("Forwarding Authorization header");
        }

        let response = request.json(body).send().await?;

        let status = response.status().as_u16();
        let body_text = response.text().await.unwrap_or_default();
        let duration = start.elapsed().as_millis();

        crate::logging::log_response(status, duration, &body_text);

        Ok((status, body_text, duration))
    }

    /// Send a GET request to the backend.
    pub async fn get(&self, path: &str) -> Result<(u16, String, u128), AppError> {
        self.get_with_auth(path, None).await
    }

    /// Send a GET request with optional Authorization header forwarding.
    ///
    /// This is used for session-based authentication where the client's
    /// session token needs to be forwarded to the backend.
    pub async fn get_with_auth(
        &self,
        path: &str,
        auth_header: Option<&str>,
    ) -> Result<(u16, String, u128), AppError> {
        let url = format!("{}{}", self.config.api_url, path);
        let start = Instant::now();

        tracing::info!(url = %url, "GET request to backend");

        let mut request = self
            .client
            .get(&url)
            .header("x-api-key", &self.config.api_key);

        // Forward Authorization header if provided
        if let Some(auth) = auth_header {
            request = request.header("Authorization", auth);
            tracing::debug!("Forwarding Authorization header for GET request");
        }

        let response = request.send().await?;

        let status = response.status().as_u16();
        let body_text = response.text().await.unwrap_or_default();
        let duration = start.elapsed().as_millis();

        crate::logging::log_response(status, duration, &body_text);

        Ok((status, body_text, duration))
    }
}
