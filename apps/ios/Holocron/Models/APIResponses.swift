import Foundation

// MARK: - Response Types

/// Response from `GET /files` — a list of remote files.
struct FilesListResponse: Codable, Sendable {
    let files: [HolocronFile]
}

/// Response from `GET /files/:id` — file detail with download URL.
struct FileDetailResponse: Codable, Sendable {
    let file: HolocronFile
    let downloadUrl: String
}

/// Response from `POST /files/upload` — presigned upload URL.
struct UploadResponse: Codable, Sendable {
    let fileId: String
    let uploadUrl: String
}

/// Response from `POST /share` — share link details.
struct ShareLinkResponse: Codable, Sendable {
    let id: String
    let url: String
    let expiresAt: Date?
}

/// Response from `GET /health` — health check.
struct HealthResponse: Codable, Sendable {
    let status: String
    let timestamp: String
}

/// Generic success response for mutations like PATCH.
struct OkResponse: Codable, Sendable {
    let ok: Bool
}

/// Response from `POST /files/upload/confirm`.
struct ConfirmUploadResponse: Codable, Sendable {
    let status: String
}

// MARK: - Search Types

/// Request body for `POST /search`.
struct SearchRequest: Encodable, Sendable {
    let query: String
    let limit: Int
}

/// A single chunk of text from a search result.
struct SearchChunk: Codable, Sendable {
    let id: String
    let text: String
    let page: Int?
    let chunkIndex: Int
    let relevanceScore: Double
}

/// Lightweight file info returned by the search API (no size, checksum, or timestamps).
struct SearchFile: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let path: String
    let mimeType: String
}

/// A file-level search result containing matched chunks.
struct SearchResult: Codable, Sendable {
    let file: SearchFile
    let chunks: [SearchChunk]
    let topScore: Double
}

/// Response from `POST /search` — hybrid search results.
struct SearchResponse: Codable, Sendable {
    let results: [SearchResult]
    let query: String
    let total: Int
}

// MARK: - Request Types

/// Request body for `POST /files/upload`.
struct UploadRequest: Encodable, Sendable {
    let name: String
    let path: String
    let size: Int64
    let mimeType: String
}

/// Request body for `POST /files/upload/confirm`.
struct ConfirmUploadRequest: Encodable, Sendable {
    let fileId: String
    let checksum: String
}

/// Request body for `POST /share`.
struct ShareRequest: Encodable, Sendable {
    let fileId: String
    let expiresIn: Int?
}

/// Request body for `PATCH /files/:id`.
struct UpdateFilePathRequest: Encodable, Sendable {
    let path: String
}

