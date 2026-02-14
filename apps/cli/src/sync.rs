use std::collections::HashMap;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::api::{ApiClient, RemoteFile};
use crate::config::Config;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    pub checksum: String,
    pub file_id: String,
}

type Manifest = HashMap<String, ManifestEntry>;

#[derive(Debug)]
struct LocalFile {
    relative_path: String,
    absolute_path: PathBuf,
}

// ---------------------------------------------------------------------------
// Manifest persistence
// ---------------------------------------------------------------------------

fn manifest_path() -> PathBuf {
    dirs::home_dir()
        .expect("could not determine home directory")
        .join(".config")
        .join("holocron")
        .join("sync-state.json")
}

fn load_manifest() -> Manifest {
    let path = manifest_path();
    if !path.exists() {
        return HashMap::new();
    }
    match std::fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

fn save_manifest(manifest: &Manifest) -> Result<(), Box<dyn std::error::Error>> {
    let path = manifest_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(manifest)?;
    std::fs::write(path, json)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn compute_checksum(path: &Path) -> Result<String, Box<dyn std::error::Error>> {
    let bytes = std::fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let result = hasher.finalize();
    Ok(hex::encode(result))
}

fn enumerate_local_files(vault_path: &Path) -> Vec<LocalFile> {
    let mut files = Vec::new();
    walk_dir(vault_path, vault_path, &mut files);
    files
}

fn walk_dir(root: &Path, current: &Path, files: &mut Vec<LocalFile>) {
    let entries = match std::fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            // Skip hidden directories
            if name.starts_with('.') && path.is_dir() {
                continue;
            }
            // Skip hidden files at directory level
            if name.starts_with('.') {
                continue;
            }
        }
        if path.is_dir() {
            walk_dir(root, &path, files);
        } else {
            let rel = path.strip_prefix(root).unwrap_or(&path);
            let relative_path = rel.to_string_lossy().to_string();
            // Skip conflict files
            if relative_path.contains(".conflict-") {
                continue;
            }
            files.push(LocalFile {
                relative_path,
                absolute_path: path,
            });
        }
    }
}

async fn upload_file(
    api: &ApiClient,
    local: &LocalFile,
    vault_path: &Path,
) -> Result<ManifestEntry, Box<dyn std::error::Error>> {
    let abs = vault_path.join(&local.relative_path);
    let bytes = std::fs::read(&abs)?;
    let size = bytes.len() as i64;
    let mime = mime_guess::from_path(&abs)
        .first_or_octet_stream()
        .to_string();
    let name = Path::new(&local.relative_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let upload = api
        .request_upload_url(&name, &local.relative_path, size, &mime)
        .await?;

    reqwest::Client::new()
        .put(&upload.upload_url)
        .header("Content-Type", &mime)
        .body(bytes)
        .send()
        .await?;

    let checksum = compute_checksum(&abs)?;
    api.confirm_upload(&upload.file_id, &checksum).await?;

    Ok(ManifestEntry {
        checksum,
        file_id: upload.file_id,
    })
}

async fn download_file(
    api: &ApiClient,
    remote: &RemoteFile,
    vault_path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let detail = api.get_file(&remote.id).await?;
    let bytes = reqwest::get(&detail.download_url).await?.bytes().await?;
    let dest = vault_path.join(&remote.path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&dest, &bytes)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Main sync logic
// ---------------------------------------------------------------------------

pub async fn run_sync(config: &Config) -> Result<(), Box<dyn std::error::Error>> {
    let vault_path = PathBuf::from(config.resolved_vault_path());
    if !vault_path.exists() {
        std::fs::create_dir_all(&vault_path)?;
    }

    let api = ApiClient::from_config(config);
    let mut manifest = load_manifest();
    let remote_files = api.list_files().await?;
    let local_files = enumerate_local_files(&vault_path);

    // Build lookup maps
    let remote_map: HashMap<String, &RemoteFile> =
        remote_files.iter().map(|f| (f.path.clone(), f)).collect();
    let local_map: HashMap<String, &LocalFile> = local_files
        .iter()
        .map(|f| (f.relative_path.clone(), f))
        .collect();

    // Collect all known paths
    let mut all_paths: std::collections::HashSet<String> = std::collections::HashSet::new();
    for key in manifest.keys() {
        all_paths.insert(key.clone());
    }
    for key in remote_map.keys() {
        all_paths.insert(key.clone());
    }
    for key in local_map.keys() {
        all_paths.insert(key.clone());
    }

    let mut new_manifest = Manifest::new();

    for path in &all_paths {
        let in_manifest = manifest.get(path);
        let on_disk = local_map.get(path.as_str());
        let on_remote = remote_map.get(path.as_str());

        match (in_manifest, on_disk, on_remote) {
            // In manifest + on disk + on remote
            (Some(entry), Some(local), Some(remote)) => {
                let local_checksum = compute_checksum(&local.absolute_path)?;

                // Gracefully handle missing checksums: if the manifest
                // or remote has no checksum yet (legacy data), skip
                // change detection for that side.
                let local_changed = !entry.checksum.is_empty()
                    && local_checksum != entry.checksum;
                let remote_changed = !entry.checksum.is_empty()
                    && !remote.checksum.is_empty()
                    && remote.checksum != entry.checksum;

                if local_changed && remote_changed {
                    // Conflict: rename local, download remote
                    let ts = Utc::now().format("%Y%m%d%H%M%S");
                    let conflict_name = format!(
                        "{}.conflict-{}",
                        path, ts
                    );
                    let conflict_path = vault_path.join(&conflict_name);
                    std::fs::rename(&local.absolute_path, &conflict_path)?;
                    download_file(&api, remote, &vault_path).await?;
                    let dl_checksum = compute_checksum(&vault_path.join(path))?;
                    println!("conflict: {path} (local saved as {conflict_name})");
                    new_manifest.insert(
                        path.clone(),
                        ManifestEntry {
                            checksum: dl_checksum,
                            file_id: remote.id.clone(),
                        },
                    );
                } else if local_changed {
                    // Upload local changes
                    let me = upload_file(&api, local, &vault_path).await?;
                    println!("uploaded: {path}");
                    new_manifest.insert(path.clone(), me);
                } else if remote_changed {
                    // Download remote changes
                    download_file(&api, remote, &vault_path).await?;
                    let dl_checksum = compute_checksum(&vault_path.join(path))?;
                    println!("downloaded: {path}");
                    new_manifest.insert(
                        path.clone(),
                        ManifestEntry {
                            checksum: dl_checksum,
                            file_id: remote.id.clone(),
                        },
                    );
                } else {
                    // No changes — store the computed local checksum so
                    // the manifest always has a valid baseline.
                    new_manifest.insert(
                        path.clone(),
                        ManifestEntry {
                            checksum: local_checksum,
                            file_id: remote.id.clone(),
                        },
                    );
                }
            }

            // In manifest + on disk + NOT on remote → remote deleted
            (Some(_entry), Some(local), None) => {
                std::fs::remove_file(&local.absolute_path)?;
                println!("deleted local (remote removed): {path}");
                // Not in new manifest
            }

            // In manifest + NOT on disk + on remote → local deleted
            (Some(_entry), None, Some(remote)) => {
                api.delete_file(&remote.id).await?;
                println!("deleted remote (local removed): {path}");
                // Not in new manifest
            }

            // In manifest + NOT on disk + NOT on remote → both deleted
            (Some(_entry), None, None) => {
                // Just remove from manifest (don't add to new)
            }

            // NOT in manifest + on disk + on remote
            (None, Some(local), Some(remote)) => {
                let local_checksum = compute_checksum(&local.absolute_path)?;
                // If checksums match (or remote has none yet), treat
                // as same content and record the local checksum.
                if local_checksum == remote.checksum
                    || remote.checksum.is_empty()
                {
                    new_manifest.insert(
                        path.clone(),
                        ManifestEntry {
                            checksum: local_checksum,
                            file_id: remote.id.clone(),
                        },
                    );
                } else {
                    // Conflict
                    let ts = Utc::now().format("%Y%m%d%H%M%S");
                    let conflict_name = format!("{}.conflict-{}", path, ts);
                    let conflict_path = vault_path.join(&conflict_name);
                    std::fs::rename(&local.absolute_path, &conflict_path)?;
                    download_file(&api, remote, &vault_path).await?;
                    let dl_checksum = compute_checksum(&vault_path.join(path))?;
                    println!("conflict (new): {path} (local saved as {conflict_name})");
                    new_manifest.insert(
                        path.clone(),
                        ManifestEntry {
                            checksum: dl_checksum,
                            file_id: remote.id.clone(),
                        },
                    );
                }
            }

            // NOT in manifest + on disk + NOT on remote → new local
            (None, Some(local), None) => {
                let me = upload_file(&api, local, &vault_path).await?;
                println!("uploaded (new): {path}");
                new_manifest.insert(path.clone(), me);
            }

            // NOT in manifest + NOT on disk + on remote → new remote
            (None, None, Some(remote)) => {
                download_file(&api, remote, &vault_path).await?;
                let dl_checksum = compute_checksum(&vault_path.join(path))?;
                println!("downloaded (new): {path}");
                new_manifest.insert(
                    path.clone(),
                    ManifestEntry {
                        checksum: dl_checksum,
                        file_id: remote.id.clone(),
                    },
                );
            }

            // NOT in manifest + NOT on disk + NOT on remote → impossible
            (None, None, None) => {}
        }
    }

    manifest = new_manifest;
    save_manifest(&manifest)?;
    println!("sync complete");
    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Helper: create a file inside `base` at the given relative path,
    /// creating intermediate directories as needed.
    fn touch(base: &Path, rel: &str) {
        let full = base.join(rel);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&full, format!("content of {rel}")).unwrap();
    }

    // -----------------------------------------------------------------------
    // enumerate_local_files / walk_dir
    // -----------------------------------------------------------------------

    #[test]
    fn enumerates_files_in_nested_subdirectories() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        touch(root, "top.txt");
        touch(root, "sub/mid.txt");
        touch(root, "sub/deep/bottom.txt");
        touch(root, "a/b/c/d.txt");

        let files = enumerate_local_files(root);
        let mut paths: Vec<String> = files.into_iter().map(|f| f.relative_path).collect();
        paths.sort();

        assert_eq!(
            paths,
            vec![
                "a/b/c/d.txt",
                "sub/deep/bottom.txt",
                "sub/mid.txt",
                "top.txt",
            ]
        );
    }

    #[test]
    fn skips_hidden_directories_inside_subfolders() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        touch(root, "visible/file.txt");
        touch(root, "visible/.hidden_dir/secret.txt");
        touch(root, ".top_hidden/nope.txt");
        touch(root, "a/.git/config");

        let files = enumerate_local_files(root);
        let paths: Vec<String> = files.into_iter().map(|f| f.relative_path).collect();

        assert_eq!(paths, vec!["visible/file.txt"]);
    }

    #[test]
    fn skips_hidden_files_inside_subfolders() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        touch(root, "sub/.hidden_file");
        touch(root, "sub/visible.txt");
        touch(root, ".DS_Store");

        let files = enumerate_local_files(root);
        let paths: Vec<String> = files.into_iter().map(|f| f.relative_path).collect();

        assert_eq!(paths, vec!["sub/visible.txt"]);
    }

    #[test]
    fn produces_correct_relative_paths() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        touch(root, "notes/journal/2024/jan.md");
        touch(root, "notes/journal/2024/feb.md");
        touch(root, "readme.txt");

        let files = enumerate_local_files(root);
        let mut paths: Vec<String> = files.into_iter().map(|f| f.relative_path).collect();
        paths.sort();

        assert_eq!(
            paths,
            vec![
                "notes/journal/2024/feb.md",
                "notes/journal/2024/jan.md",
                "readme.txt",
            ]
        );

        // Verify no paths start with '/' (they should be relative)
        for p in &paths {
            assert!(!p.starts_with('/'), "path should be relative: {p}");
        }
    }

    #[test]
    fn filters_conflict_files_in_subfolders() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        touch(root, "sub/file.txt");
        touch(root, "sub/file.txt.conflict-20240101120000");
        touch(root, "deep/a/b.md");
        touch(root, "deep/a/b.md.conflict-20240615093000");
        touch(root, "top.conflict-20240101000000");

        let files = enumerate_local_files(root);
        let mut paths: Vec<String> = files.into_iter().map(|f| f.relative_path).collect();
        paths.sort();

        assert_eq!(paths, vec!["deep/a/b.md", "sub/file.txt"]);
    }

    #[test]
    fn empty_directory_returns_no_files() {
        let tmp = TempDir::new().unwrap();
        let files = enumerate_local_files(tmp.path());
        assert!(files.is_empty());
    }

    #[test]
    fn empty_subdirectories_are_ignored() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        // Create empty subdirectories
        fs::create_dir_all(root.join("empty_sub")).unwrap();
        fs::create_dir_all(root.join("a/b/c")).unwrap();
        touch(root, "real.txt");

        let files = enumerate_local_files(root);
        let paths: Vec<String> = files.into_iter().map(|f| f.relative_path).collect();

        assert_eq!(paths, vec!["real.txt"]);
    }

    #[test]
    fn absolute_paths_are_correct_for_subfolder_files() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        touch(root, "sub/deep/file.txt");

        let files = enumerate_local_files(root);
        assert_eq!(files.len(), 1);

        let file = &files[0];
        assert_eq!(file.relative_path, "sub/deep/file.txt");
        assert_eq!(file.absolute_path, root.join("sub/deep/file.txt"));
        assert!(file.absolute_path.exists());
    }

    // -----------------------------------------------------------------------
    // compute_checksum
    // -----------------------------------------------------------------------

    #[test]
    fn checksum_is_consistent_for_subfolder_files() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        touch(root, "sub/file.txt");
        let path = root.join("sub/file.txt");

        let c1 = compute_checksum(&path).unwrap();
        let c2 = compute_checksum(&path).unwrap();
        assert_eq!(c1, c2);
        // SHA-256 hex is 64 chars
        assert_eq!(c1.len(), 64);
    }
}