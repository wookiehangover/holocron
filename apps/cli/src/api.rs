use reqwest::header::{HeaderMap, HeaderValue};
use reqwest::Client;
use serde::{Deserialize, Serialize};

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
}

// ---------------------------------------------------------------------------
// Response / request types
// ---------------------------------------------------------------------------

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
    pub async fn confirm_upload(&self, file_id: &str) -> Result<(), ApiError> {
        let body = ConfirmUploadRequest { file_id };
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
}

