mod api;
mod config;
mod daemon;
mod sync;

use clap::{Parser, Subcommand};
use api::ApiClient;
use config::Config;

#[derive(Parser)]
#[command(name = "holocron", about = "Holocron CLI — sync and manage your vault")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Manage configuration
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },
    /// List remote files
    Ls,
    /// Create a share URL for a file
    Share {
        /// File ID to share
        id: String,
        /// Optional expiration time in seconds
        #[arg(long)]
        expires_in: Option<u64>,
    },
    /// Get a presigned download URL for a file
    Url {
        /// File ID to get URL for
        id: String,
    },
    /// Check API health
    Health,
    /// One-shot bidirectional sync
    Sync,
    /// Run as a background daemon, watching for changes
    Daemon,
}

#[derive(Subcommand)]
enum ConfigAction {
    /// Show current configuration
    Show,
    /// Set a configuration value
    Set {
        /// Key to set (api-url, vault-path, api-key)
        key: String,
        /// Value to set
        value: String,
    },
    /// Get a configuration value
    Get {
        /// Key to get (api-url, vault-path, api-key)
        key: String,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Command::Config { action } => match action {
            ConfigAction::Show => {
                let config = Config::load();
                println!("{}", config.to_json_pretty());
            }
            ConfigAction::Set { key, value } => {
                let mut config = Config::load();
                match key.as_str() {
                    "api-url" => config.api_url = Some(value.clone()),
                    "vault-path" => config.vault_path = Some(value.clone()),
                    "api-key" => config.api_key = Some(value.clone()),
                    _ => {
                        eprintln!("Unknown config key: {key}");
                        eprintln!("Valid keys: api-url, vault-path, api-key");
                        std::process::exit(1);
                    }
                }
                if let Err(e) = config.save() {
                    eprintln!("Failed to save config: {e}");
                    std::process::exit(1);
                }
                println!("Set {key} = {value}");
            }
            ConfigAction::Get { key } => {
                let config = Config::load();
                let value = match key.as_str() {
                    "api-url" => config.resolved_api_url(),
                    "vault-path" => config.resolved_vault_path(),
                    "api-key" => config.resolved_api_key(),
                    _ => {
                        eprintln!("Unknown config key: {key}");
                        eprintln!("Valid keys: api-url, vault-path, api-key");
                        std::process::exit(1);
                    }
                };
                println!("{value}");
            }
        },
        Command::Health => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.health().await {
                Ok(()) => println!("API is healthy"),
                Err(e) => {
                    eprintln!("Health check failed: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Ls => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.list_files().await {
                Ok(files) => {
                    if files.is_empty() {
                        println!("No files found.");
                    } else {
                        println!(
                            "{:<36}  {:<30}  {:>10}  {}",
                            "ID", "NAME", "SIZE", "PATH"
                        );
                        println!("{}", "-".repeat(90));
                        for f in &files {
                            println!(
                                "{:<36}  {:<30}  {:>10}  {}",
                                f.id, f.name, f.size, f.path
                            );
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to list files: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Share { id, expires_in } => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.create_share_link(&id, expires_in).await {
                Ok(resp) => println!("{}", resp.url),
                Err(e) => {
                    eprintln!("Failed to create share link: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Url { id } => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.get_file(&id).await {
                Ok(detail) => println!("{}", detail.download_url),
                Err(e) => {
                    eprintln!("Failed to get download URL: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Sync => {
            let config = Config::load();
            if let Err(e) = sync::run_sync(&config).await {
                eprintln!("Sync failed: {e}");
                std::process::exit(1);
            }
        }
        Command::Daemon => {
            let config = Config::load();
            if let Err(e) = daemon::run_daemon(&config).await {
                eprintln!("Daemon failed: {e}");
                std::process::exit(1);
            }
        }
    }
}

