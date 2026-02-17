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

    /// Output results as JSON instead of human-readable text
    #[arg(long, global = true)]
    json: bool,
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
    /// Check indexing status of a file
    Status {
        /// File ID to check
        id: String,
    },
    /// Trigger re-indexing of a file
    Reindex {
        /// File ID to re-index
        id: String,
    },
    /// Download a file to the current directory
    Pull {
        /// File ID to download
        id: String,
        /// Output path (defaults to original filename in current directory)
        #[arg(long)]
        output: Option<String>,
    },
    /// Search indexed files
    Search {
        /// Search query
        query: String,
        /// Maximum number of results to return
        #[arg(long, default_value_t = 20)]
        limit: u32,
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

/// Print a JSON error to stdout and exit with code 1.
fn json_error(msg: &str) -> ! {
    println!("{}", serde_json::json!({ "error": msg }));
    std::process::exit(1);
}

#[tokio::main]
async fn main() {
    let Cli { command, json } = Cli::parse();

    match command {
        Command::Config { action } => match action {
            ConfigAction::Show => {
                let config = Config::load();
                if json {
                    println!("{}", serde_json::json!({ "config": config }));
                } else {
                    println!("{}", config.to_json_pretty());
                }
            }
            ConfigAction::Set { key, value } => {
                let mut config = Config::load();
                match key.as_str() {
                    "api-url" => config.api_url = Some(value.clone()),
                    "vault-path" => config.vault_path = Some(value.clone()),
                    "api-key" => config.api_key = Some(value.clone()),
                    _ => {
                        if json {
                            json_error(&format!("Unknown config key: {key}"));
                        }
                        eprintln!("Unknown config key: {key}");
                        eprintln!("Valid keys: api-url, vault-path, api-key");
                        std::process::exit(1);
                    }
                }
                if let Err(e) = config.save() {
                    if json {
                        json_error(&format!("Failed to save config: {e}"));
                    }
                    eprintln!("Failed to save config: {e}");
                    std::process::exit(1);
                }
                if json {
                    println!("{}", serde_json::json!({ "key": key, "value": value }));
                } else {
                    println!("Set {key} = {value}");
                }
            }
            ConfigAction::Get { key } => {
                let config = Config::load();
                let value = match key.as_str() {
                    "api-url" => config.resolved_api_url(),
                    "vault-path" => config.resolved_vault_path(),
                    "api-key" => config.resolved_api_key(),
                    _ => {
                        if json {
                            json_error(&format!("Unknown config key: {key}"));
                        }
                        eprintln!("Unknown config key: {key}");
                        eprintln!("Valid keys: api-url, vault-path, api-key");
                        std::process::exit(1);
                    }
                };
                if json {
                    println!("{}", serde_json::json!({ "key": key, "value": value }));
                } else {
                    println!("{value}");
                }
            }
        },
        Command::Health => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.health().await {
                Ok(()) => {
                    if json {
                        println!("{}", serde_json::json!({ "status": "ok" }));
                    } else {
                        println!("API is healthy");
                    }
                }
                Err(e) => {
                    if json {
                        json_error(&format!("Health check failed: {e}"));
                    }
                    eprintln!("Health check failed: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Search { query, limit } => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.search(&query, limit).await {
                Ok(resp) => {
                    if json {
                        println!("{}", serde_json::to_string_pretty(&resp).unwrap());
                    } else if resp.results.is_empty() {
                        println!("No results found for \"{query}\".");
                    } else {
                        println!(
                            "Found {} result{} for \"{query}\":\n",
                            resp.total,
                            if resp.total == 1 { "" } else { "s" }
                        );
                        for result in &resp.results {
                            let snippet = result
                                .chunks
                                .first()
                                .map(|c| {
                                    let text = c.text.trim();
                                    if text.len() > 200 {
                                        let end = text
                                            .char_indices()
                                            .map(|(i, _)| i)
                                            .take_while(|&i| i <= 200)
                                            .last()
                                            .unwrap_or(200);
                                        format!("{}…", &text[..end])
                                    } else {
                                        text.to_string()
                                    }
                                })
                                .unwrap_or_default();
                            println!("  {} ({})", result.file.name, result.file.path);
                            println!("  Score: {:.0}/10  |  Type: {}", result.top_score, result.file.mime_type);
                            if !snippet.is_empty() {
                                println!("  > {snippet}");
                            }
                            println!();
                        }
                    }
                }
                Err(e) => {
                    if json {
                        json_error(&format!("Search failed: {e}"));
                    }
                    eprintln!("Search failed: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Ls => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.list_files().await {
                Ok(files) => {
                    if json {
                        println!("{}", serde_json::json!({ "files": files }));
                    } else if files.is_empty() {
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
                    if json {
                        json_error(&format!("Failed to list files: {e}"));
                    }
                    eprintln!("Failed to list files: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Share { id, expires_in } => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.create_share_link(&id, expires_in).await {
                Ok(resp) => {
                    if json {
                        println!("{}", serde_json::to_string_pretty(&resp).unwrap());
                    } else {
                        println!("{}", resp.url);
                    }
                }
                Err(e) => {
                    if json {
                        json_error(&format!("Failed to create share link: {e}"));
                    }
                    eprintln!("Failed to create share link: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Url { id } => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.get_file(&id).await {
                Ok(detail) => {
                    if json {
                        println!("{}", serde_json::json!({ "url": detail.download_url }));
                    } else {
                        println!("{}", detail.download_url);
                    }
                }
                Err(e) => {
                    if json {
                        json_error(&format!("Failed to get download URL: {e}"));
                    }
                    eprintln!("Failed to get download URL: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Status { id } => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.get_file(&id).await {
                Ok(detail) => {
                    if json {
                        println!("{}", serde_json::to_string_pretty(&detail).unwrap());
                    } else {
                        let file = &detail.file;
                        println!("File: {} ({})", file.name, file.path);
                        println!("Status: {}", file.indexing_status.as_deref().unwrap_or("not indexed"));
                        if let Some(meta) = &file.metadata {
                            if !meta.summary.is_empty() {
                                println!("Summary: {}", meta.summary);
                            }
                            if !meta.keywords.is_empty() {
                                println!("Keywords: {}", meta.keywords.join(", "));
                            }
                            if !meta.topics.is_empty() {
                                println!("Topics: {}", meta.topics.join(", "));
                            }
                            if let (Some(w), Some(h)) = (meta.image_width, meta.image_height) {
                                println!("Dimensions: {w} × {h}");
                            }
                        }
                    }
                }
                Err(e) => {
                    if json {
                        json_error(&format!("Failed to get file status: {e}"));
                    }
                    eprintln!("Failed to get file status: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Reindex { id } => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);
            match api.reindex_file(&id).await {
                Ok(()) => {
                    if json {
                        println!("{}", serde_json::json!({ "status": "reindexing", "id": id }));
                    } else {
                        println!("Re-indexing started for file {id}");
                    }
                }
                Err(e) => {
                    if json {
                        json_error(&format!("Failed to trigger re-indexing: {e}"));
                    }
                    eprintln!("Failed to trigger re-indexing: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Pull { id, output } => {
            let config = Config::load();
            let api = ApiClient::from_config(&config);

            // Resolve the destination path up-front so we can show progress
            // before the download starts.
            let detail = match api.get_file(&id).await {
                Ok(d) => d,
                Err(e) => {
                    if json {
                        json_error(&format!("Failed to get file info: {e}"));
                    }
                    eprintln!("Failed to get file info: {e}");
                    std::process::exit(1);
                }
            };

            let dest = match output {
                Some(p) => std::path::PathBuf::from(p),
                None => std::path::PathBuf::from(&detail.file.name),
            };

            if !json {
                println!(
                    "Downloading {} ({} bytes)...",
                    detail.file.name, detail.file.size
                );
            }

            match api.download_file(&id, &dest).await {
                Ok(_) => {
                    if json {
                        println!("{}", serde_json::json!({
                            "file": detail.file.name,
                            "path": dest.display().to_string(),
                            "size": detail.file.size,
                        }));
                    } else {
                        println!("Saved to {}", dest.display());
                    }
                }
                Err(e) => {
                    if json {
                        json_error(&format!("Download failed: {e}"));
                    }
                    eprintln!("Download failed: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Sync => {
            let config = Config::load();
            match sync::run_sync(&config).await {
                Ok(()) => {
                    if json {
                        println!("{}", serde_json::json!({ "status": "ok" }));
                    }
                }
                Err(e) => {
                    if json {
                        json_error(&format!("Sync failed: {e}"));
                    }
                    eprintln!("Sync failed: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Daemon => {
            let config = Config::load();
            if let Err(e) = daemon::run_daemon(&config).await {
                if json {
                    json_error(&format!("Daemon failed: {e}"));
                }
                eprintln!("Daemon failed: {e}");
                std::process::exit(1);
            }
        }
    }
}

