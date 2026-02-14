mod api;
mod config;

use clap::{Parser, Subcommand};
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
        Command::Ls => {
            eprintln!("ls: not yet implemented");
        }
        Command::Share { id } => {
            eprintln!("share {id}: not yet implemented");
        }
        Command::Url { id } => {
            eprintln!("url {id}: not yet implemented");
        }
        Command::Health => {
            eprintln!("health: not yet implemented");
        }
        Command::Sync => {
            eprintln!("sync: not yet implemented");
        }
        Command::Daemon => {
            eprintln!("daemon: not yet implemented");
        }
    }
}

