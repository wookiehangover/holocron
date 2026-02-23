use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Application configuration stored at `~/.config/holocron/config.json`.
///
/// JSON keys use camelCase to match the Swift desktop app.
/// Fields are ordered alphabetically by JSON key name so that
/// `serde_json::to_string_pretty` produces sorted-key output.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    /// API key for authentication.
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,

    /// Base URL for the Holocron API.
    #[serde(rename = "apiURL")]
    pub api_url: Option<String>,

    /// Whether to launch the app at login (desktop-only setting, preserved for round-tripping).
    #[serde(rename = "launchAtLogin")]
    pub launch_at_login: Option<bool>,

    /// Path to the local vault directory.
    #[serde(rename = "vaultPath")]
    pub vault_path: Option<String>,
}

impl Config {
    const DEFAULT_API_URL: &'static str = "http://localhost:3000";
    const DEFAULT_VAULT_PATH: &'static str = "~/Holocron";

    /// Config directory: `~/.config/holocron/`
    fn config_dir() -> PathBuf {
        dirs::home_dir()
            .expect("could not determine home directory")
            .join(".config")
            .join("holocron")
    }

    /// Config file: `~/.config/holocron/config.json`
    fn config_file() -> PathBuf {
        Self::config_dir().join("config.json")
    }

    /// Load config from disk. Returns defaults if the file does not exist.
    pub fn load() -> Self {
        let path = Self::config_file();
        if !path.exists() {
            return Self::default();
        }
        match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    /// Save config to disk, creating the directory if needed.
    /// Pretty-prints JSON with sorted keys to match the Swift app output.
    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let dir = Self::config_dir();
        fs::create_dir_all(&dir)?;

        let mut json = self.to_json_pretty();
        json.push('\n');
        fs::write(Self::config_file(), json)?;
        Ok(())
    }

    /// Serialize to pretty-printed JSON with sorted keys.
    pub fn to_json_pretty(&self) -> String {
        serde_json::to_string_pretty(self).expect("failed to serialize config")
    }

    /// API URL from config, falling back to localhost.
    pub fn resolved_api_url(&self) -> String {
        match &self.api_url {
            Some(url) if !url.trim().is_empty() => url.clone(),
            _ => Self::DEFAULT_API_URL.to_string(),
        }
    }

    /// Vault path from config, with `~` expanded to the home directory.
    pub fn resolved_vault_path(&self) -> String {
        let raw = match &self.vault_path {
            Some(path) if !path.trim().is_empty() => path.clone(),
            _ => Self::DEFAULT_VAULT_PATH.to_string(),
        };

        if raw.starts_with("~/") || raw == "~" {
            if let Some(home) = dirs::home_dir() {
                return home
                    .join(raw.strip_prefix("~/").unwrap_or(""))
                    .to_string_lossy()
                    .to_string();
            }
        }
        raw
    }

    /// API key from config, falling back to empty string.
    pub fn resolved_api_key(&self) -> String {
        self.api_key.clone().unwrap_or_default()
    }
}

