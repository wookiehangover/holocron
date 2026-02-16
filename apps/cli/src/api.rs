use std::path::Path;

use reqwest::header::{HeaderMap, HeaderValue};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;

use crate::config::Config;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),

    #[error("Unauthorized — invalid or missing API key")]
    Unauthorized,

    #[error("Resource not found")]
    NotFound,

    #[error("Server error ({0})")]
    ServerError(u16),

    #[error("Unexpected status {0}")]
    UnexpectedStatus(u16),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

// ---------------------------------------------------------------------------
// Response / request types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub summary: String,
    pub title: String,
    pub keywords: Vec<String>,
    pub topics: Vec<String>,
    pub language: String,
    pub author: Option<String>,
    pub page_count: Option<u64>,
    pub word_count: Option<u64>,
    pub char_count: Option<u64>,
    pub image_width: Option<u64>,
    pub image_height: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: i64,
    pub mime_type: String,
    pub checksum: String,
    pub created_at: String,
    pub updated_at: String,
    pub indexing_status: Option<String>,
    pub metadata: Option<FileMetadata>,
}

#[derive(Debug, Deserialize)]
struct FilesListResponse {
    files: Vec<RemoteFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResponse {
    pub file_id: String,
    pub upload_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDetail {
    pub file: RemoteFile,
    pub download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareLinkResponse {
    pub id: String,
    pub url: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultVersion {
    pub latest_change: Option<String>,
    pub file_count: i64,
}

// Search types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchChunk {
    pub text: String,
    pub page: Option<u64>,
    pub chunk_index: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub mime_type: String,
    pub metadata: Option<FileMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub file: SearchResultFile,
    pub chunks: Vec<SearchChunk>,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub query: String,
    pub total: u64,
}

// Private request bodies

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadRequest<'a> {
    name: &'a str,
    path: &'a str,
    size: i64,
    mime_type: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfirmUploadRequest<'a> {
    file_id: &'a str,
    checksum: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ShareRequest<'a> {
    file_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    expires_in: Option<u64>,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

pub struct ApiClient {
    client: Client,
    base_url: String,
}

impl ApiClient {
    /// Build an `ApiClient` from the loaded configuration.
    pub fn from_config(config: &Config) -> Self {
        let mut headers = HeaderMap::new();
        let key = config.resolved_api_key();
        if !key.is_empty() {
            headers.insert(
                "X-Api-Key",
                HeaderValue::from_str(&key).expect("invalid API key header value"),
            );
        }

        let client = Client::builder()
            .default_headers(headers)
            .build()
            .expect("failed to build HTTP client");

        Self {
            client,
            base_url: config.resolved_api_url().trim_end_matches('/').to_string(),
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    /// Map non-2xx responses to `ApiError`.
    async fn check(response: reqwest::Response) -> Result<reqwest::Response, ApiError> {
        let status = response.status().as_u16();
        match status {
            200..=299 => Ok(response),
            401 => Err(ApiError::Unauthorized),
            404 => Err(ApiError::NotFound),
            500..=599 => Err(ApiError::ServerError(status)),
            _ => Err(ApiError::UnexpectedStatus(status)),
        }
    }

    // -----------------------------------------------------------------------
    // Endpoints
    // -----------------------------------------------------------------------

    /// GET /health — returns Ok(()) on 200.
    pub async fn health(&self) -> Result<(), ApiError> {
        let resp = self.client.get(self.url("/health")).send().await?;
        Self::check(resp).await?;
        Ok(())
    }

    /// GET /files — list all remote files.
    pub async fn list_files(&self) -> Result<Vec<RemoteFile>, ApiError> {
        let resp = self.client.get(self.url("/files")).send().await?;
        let resp = Self::check(resp).await?;
        let body: FilesListResponse = resp.json().await?;
        Ok(body.files)
    }

    /// POST /files/upload — request a presigned upload URL.
    pub async fn request_upload_url(
        &self,
        name: &str,
        path: &str,
        size: i64,
        mime_type: &str,
    ) -> Result<UploadResponse, ApiError> {
        let body = UploadRequest {
            name,
            path,
            size,
            mime_type,
        };
        let resp = self
            .client
            .post(self.url("/files/upload"))
            .json(&body)
            .send()
            .await?;
        let resp = Self::check(resp).await?;
        Ok(resp.json().await?)
    }

    /// POST /files/upload/confirm — confirm an upload has completed.
    pub async fn confirm_upload(&self, file_id: &str, checksum: &str) -> Result<(), ApiError> {
        let body = ConfirmUploadRequest { file_id, checksum };
        let resp = self
            .client
            .post(self.url("/files/upload/confirm"))
            .json(&body)
            .send()
            .await?;
        Self::check(resp).await?;
        Ok(())
    }

    /// GET /files/:id — get file metadata and a presigned download URL.
    pub async fn get_file(&self, id: &str) -> Result<FileDetail, ApiError> {
        let resp = self
            .client
            .get(self.url(&format!("/files/{id}")))
            .send()
            .await?;
        let resp = Self::check(resp).await?;
        Ok(resp.json().await?)
    }

    /// POST /share — create a share link for a file.
    pub async fn create_share_link(
        &self,
        file_id: &str,
        expires_in: Option<u64>,
    ) -> Result<ShareLinkResponse, ApiError> {
        let body = ShareRequest {
            file_id,
            expires_in,
        };
        let resp = self
            .client
            .post(self.url("/share"))
            .json(&body)
            .send()
            .await?;
        let resp = Self::check(resp).await?;
        Ok(resp.json().await?)
    }

    /// DELETE /files/:id — delete a file (expects 204).
    pub async fn delete_file(&self, id: &str) -> Result<(), ApiError> {
        let resp = self
            .client
            .delete(self.url(&format!("/files/{id}")))
            .send()
            .await?;
        Self::check(resp).await?;
        Ok(())
    }

    /// GET /files/version — fetch the current vault version for change detection.
    pub async fn get_vault_version(&self) -> Result<VaultVersion, ApiError> {
        let resp = self.client.get(self.url("/files/version")).send().await?;
        let resp = Self::check(resp).await?;
        Ok(resp.json().await?)
    }

    /// POST /files/:id/reindex — trigger re-indexing of a file.
    pub async fn reindex_file(&self, id: &str) -> Result<(), ApiError> {
        let resp = self
            .client
            .post(self.url(&format!("/files/{id}/reindex")))
            .send()
            .await?;
        Self::check(resp).await?;
        Ok(())
    }

    /// GET /files/search?q=...&limit=... — search indexed files.
    pub async fn search(&self, query: &str, limit: u32) -> Result<SearchResponse, ApiError> {
        let encoded_query = urlencoding::encode(query);
        let url = format!("{}/files/search?q={}&limit={}", self.base_url, encoded_query, limit);
        let resp = self.client.get(&url).send().await?;
        let resp = Self::check(resp).await?;
        Ok(resp.json().await?)
    }

    /// Fetch a file's presigned URL via [`get_file`](Self::get_file) and stream
    /// its content to `dest`. Returns the [`FileDetail`] metadata.
    pub async fn download_file(&self, id: &str, dest: &Path) -> Result<FileDetail, ApiError> {
        let detail = self.get_file(id).await?;

        let resp = self.client.get(&detail.download_url).send().await?;
        let mut resp = Self::check(resp).await?;

        let mut file = tokio::fs::File::create(dest).await?;
        while let Some(chunk) = resp.chunk().await? {
            file.write_all(&chunk).await?;
        }
        file.flush().await?;

        Ok(detail)
    }
}

