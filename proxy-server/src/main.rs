mod client;
mod config;
mod error;
mod handlers;
mod logging;
mod routes;

use axum::{
    Router,
    http::{Method, header},
    routing::{get, post},
};
use client::BackendClient;
use config::Settings;
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load .env file if present
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            // Default to info level for our crate and tower_http
            "ats_proxy_server=info,tower_http=info".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let settings = Settings::load().map_err(|e| {
        eprintln!("Failed to load configuration: {}", e);
        e
    })?;

    // Validate configuration
    settings.validate().map_err(|e| {
        eprintln!("Configuration validation failed: {}", e);
        e
    })?;

    // Build the backend client
    let http_client = reqwest::Client::builder()
        .build()
        .expect("Failed to create HTTP client");

    let backend_client = Arc::new(BackendClient::new(http_client, settings.backend.clone()));

    // Configure CORS - allow all origins for local development
    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    // Build the router
    let app = Router::new()
        // Action-based POST endpoint
        .route("/", post(routes::actions::handle_action))
        // Transaction status (polling fallback)
        .route(
            "/v1/transactions/{id}",
            get(routes::transactions::get_status),
        )
        // WebSocket for real-time transaction tracking
        .route(
            "/v1/ws/transactions/{id}",
            get(routes::transactions::ws_upgrade),
        )
        // Health check
        .route("/health", get(routes::health::health))
        // Apply middleware
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        // Share state
        .with_state(backend_client);

    // Build the server address
    let addr = format!("{}:{}", settings.server.host, settings.server.port);

    // Print startup banner
    println!("═══════════════════════════════════════════════════════════════════");
    println!("  ATS Proxy Server (Rust) running on http://{}", addr);
    println!("  Forwarding to ATS API at: {}", settings.backend.api_url);
    println!("  Network: {}", settings.backend.network);
    println!("═══════════════════════════════════════════════════════════════════");
    println!();
    tracing::info!(addr = %addr, "Server starting");

    // Start the server
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
