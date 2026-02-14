use std::path::PathBuf;
use std::time::Duration;

use notify::{Config as NotifyConfig, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc;

use crate::api::{ApiClient, VaultVersion};
use crate::config::Config;
use crate::sync;

/// Default interval between remote version polls.
const POLL_INTERVAL: Duration = Duration::from_secs(30);

pub async fn run_daemon(config: &Config) -> Result<(), Box<dyn std::error::Error>> {
    // Initial sync
    println!("Running initial sync...");
    sync::run_sync(config).await?;

    // Seed the last known version so the first poll tick doesn't
    // trigger a redundant sync.
    let api = ApiClient::from_config(config);
    let mut last_known_version: Option<VaultVersion> = match api.get_vault_version().await {
        Ok(v) => Some(v),
        Err(e) => {
            eprintln!("Warning: could not seed vault version: {e}");
            None
        }
    };

    // Spawn a dedicated signal handler so Ctrl-C works even while
    // sync is running (when the select! branches aren't being polled).
    tokio::spawn(async {
        tokio::signal::ctrl_c().await.ok();
        println!("\nShutting down...");
        std::process::exit(0);
    });

    let vault_path = PathBuf::from(config.resolved_vault_path());
    println!("Watching {}...", vault_path.display());

    // Set up file watcher
    let (tx, mut rx) = mpsc::channel::<()>(100);

    let mut watcher = RecommendedWatcher::new(
        move |result: Result<notify::Event, notify::Error>| {
            if let Ok(event) = result {
                // Only trigger on meaningful file changes
                match event.kind {
                    EventKind::Create(_)
                    | EventKind::Modify(_)
                    | EventKind::Remove(_) => {
                        // Skip events for conflict files
                        let dominated_by_conflict = event.paths.iter().any(|p| {
                            p.to_string_lossy().contains(".conflict-")
                        });
                        if !dominated_by_conflict {
                            let _ = tx.blocking_send(());
                        }
                    }
                    _ => {}
                }
            }
        },
        NotifyConfig::default(),
    )?;

    watcher.watch(vault_path.as_ref(), RecursiveMode::Recursive)?;

    // Clone config for the sync loop
    let sync_config = config.clone();

    // Remote polling state
    let mut poll_interval = tokio::time::interval(POLL_INTERVAL);
    // The first tick fires immediately; consume it so we don't
    // double-sync right after the initial sync above.
    poll_interval.tick().await;

    // Main event loop: react to local FS changes OR remote version changes
    loop {
        tokio::select! {
            // --- Local filesystem change ---
            event = rx.recv() => {
                match event {
                    Some(()) => {}
                    None => break, // channel closed
                }

                // Debounce: drain any additional events over 2 seconds
                let debounce = Duration::from_secs(2);
                let deadline = tokio::time::Instant::now() + debounce;
                loop {
                    tokio::select! {
                        _ = rx.recv() => {
                            // Consume additional events during debounce window
                        }
                        _ = tokio::time::sleep_until(deadline) => {
                            break;
                        }
                    }
                }

                println!("Change detected, syncing...");
                if let Err(e) = sync::run_sync(&sync_config).await {
                    eprintln!("Sync error: {e}");
                }
            }

            // --- Remote polling tick ---
            _ = poll_interval.tick() => {
                match api.get_vault_version().await {
                    Ok(version) => {
                        let changed = last_known_version
                            .as_ref()
                            .is_none_or(|prev| *prev != version);
                        if changed {
                            println!("Remote change detected, syncing...");
                            if let Err(e) = sync::run_sync(&sync_config).await {
                                eprintln!("Sync error: {e}");
                            }
                            last_known_version = Some(version);
                        }
                    }
                    Err(e) => {
                        eprintln!("Warning: remote poll failed: {e}");
                    }
                }
            }
        }
    }

    Ok(())
}

