use config::{Config, ConfigError, Environment, File};
use serde::Deserialize;

/// Application settings loaded from config files and environment variables.
///
/// Configuration is loaded in order of precedence (later overrides earlier):
/// 1. `config/default.toml` - Default values
/// 2. Environment variables with `APP__` prefix (double underscore for nesting)
///
/// Example environment variables:
/// - `APP__SERVER__PORT=3333`
/// - `APP__BACKEND__API_URL=http://localhost:13002`
#[derive(Debug, Deserialize, Clone)]
pub struct Settings {
    pub server: ServerSettings,
    pub backend: BackendSettings,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerSettings {
    /// Port to listen on (default: 3333)
    pub port: u16,
    /// Host to bind to (default: "0.0.0.0")
    pub host: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct BackendSettings {
    /// Backend API URL (e.g., "http://localhost:13002")
    pub api_url: String,
    /// API key for authenticating with the backend
    pub api_key: String,
    /// Passphrase for work registration
    pub passphrase: String,
    /// Network to use (testnet/mainnet)
    pub network: String,
}

impl Settings {
    /// Load settings from configuration files and environment variables.
    pub fn load() -> Result<Self, ConfigError> {
        let config = Config::builder()
            // Start with default configuration
            .add_source(File::with_name("config/default").required(false))
            // Override with environment variables (APP__ prefix, __ separator)
            .add_source(
                Environment::with_prefix("APP")
                    .prefix_separator("__")
                    .separator("__"),
            )
            .build()?;

        config.try_deserialize()
    }

    /// Validate that all required settings are present.
    pub fn validate(&self) -> Result<(), String> {
        if self.backend.api_key.is_empty() {
            return Err("Backend API key is required (set APP__BACKEND__API_KEY)".into());
        }
        if self.backend.passphrase.is_empty() {
            return Err("Backend passphrase is required (set APP__BACKEND__PASSPHRASE)".into());
        }
        if self.backend.api_url.is_empty() {
            return Err("Backend API URL is required (set APP__BACKEND__API_URL)".into());
        }
        Ok(())
    }
}
