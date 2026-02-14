use std::path::PathBuf;
use std::time::Duration;

use notify::{Config as NotifyConfig, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc;

use crate::config::Config;
use crate::sync;

pub async fn run_daemon(config: &Config) -> Result<(), Box<dyn std::error::Error>> {
    // Initial sync
    println!("Running initial sync...");
    sync::run_sync(config).await?;

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

    // Main event loop with debounce
    loop {
        tokio::select! {
            // Wait for a file change event or shutdown signal
            Some(()) = rx.recv() => {
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
            _ = tokio::signal::ctrl_c() => {
                println!("Shutting down...");
                break;
            }
        }
    }

    Ok(())
}

