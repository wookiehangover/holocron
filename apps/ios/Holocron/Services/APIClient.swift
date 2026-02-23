import Foundation
import os

/// HTTP client for communicating with the Holocron backend API.
/// Thread-safe and designed for use with Swift concurrency (async/await).
final class APIClient: Sendable {
    private let logger = Logger(subsystem: "com.sambreed.Holocron", category: "api")
    private let baseURL: URL
    private let session: URLSession
    private let apiKey: String

    // MARK: - JSON Coding

    /// Shared decoder with ISO 8601 date support (with and without fractional seconds).
    static let jsonDecoder: JSONDecoder = {
        let d = JSONDecoder()
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let basic = ISO8601DateFormatter()
        basic.formatOptions = [.withInternetDateTime]
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = fractional.date(from: string) { return date }
            if let date = basic.date(from: string) { return date }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO 8601 date: \(string)"
            )
        }
        return d
    }()

    private let encoder = JSONEncoder()

    // MARK: - Initialization

    /// Create an API client with explicit server URL and API key.
    /// These are typically provided by a `SettingsStore` (ObservableObject).
    init(serverURL: String, apiKey: String, session: URLSession = .shared) {
        guard let url = URL(string: serverURL) else {
            fatalError("Invalid server URL: \(serverURL)")
        }
        self.baseURL = url
        self.apiKey = apiKey
        self.session = session
        logger.info("APIClient initialized with base URL: \(serverURL, privacy: .public)")
    }

    // MARK: - Private Helpers

    private func makeRequest(
        path: String,
        method: String = "GET",
        body: Data? = nil
    ) -> URLRequest {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(apiKey, forHTTPHeaderField: "X-Api-Key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body {
            request.httpBody = body
        }
        return request
    }

    private func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200...299:
            return (data, httpResponse)
        case 401:
            throw APIError.unauthorized
        case 404:
            throw APIError.notFound
        case 500...599:
            throw APIError.serverError(httpResponse.statusCode)
        default:
            throw APIError.invalidResponse
        }
    }

    // MARK: - Health

    /// Check if the server is reachable.
    func health() async throws -> HealthResponse {
        logger.info("health check")
        let request = makeRequest(path: "health")
        let (data, _) = try await perform(request)
        return try Self.jsonDecoder.decode(HealthResponse.self, from: data)
    }

    // MARK: - Files

    /// List all files in the vault.
    func listFiles() async throws -> [HolocronFile] {
        logger.info("listFiles called")
        let request = makeRequest(path: "files")
        let (data, _) = try await perform(request)
        let response = try Self.jsonDecoder.decode(FilesListResponse.self, from: data)
        return response.files
    }

    /// Get a single file's metadata and a presigned download URL.
    func getFile(id: String) async throws -> (file: HolocronFile, downloadUrl: URL) {
        logger.info("getFile called for: \(id, privacy: .public)")
        let request = makeRequest(path: "files/\(id)")
        let (data, _) = try await perform(request)
        let response = try Self.jsonDecoder.decode(FileDetailResponse.self, from: data)
        guard let url = URL(string: response.downloadUrl) else {
            throw APIError.invalidResponse
        }
        return (response.file, url)
    }

    /// Rename or move a file (update its path).
    func updateFilePath(id: String, path: String) async throws {
        logger.info("updateFilePath called for: \(id, privacy: .public)")
        let body = try encoder.encode(UpdateFilePathRequest(path: path))
        let request = makeRequest(path: "files/\(id)", method: "PATCH", body: body)
        _ = try await perform(request)
    }

    /// Delete a file from the vault.
    func deleteFile(id: String) async throws {
        logger.info("deleteFile called for: \(id, privacy: .public)")
        let request = makeRequest(path: "files/\(id)", method: "DELETE")
        _ = try await perform(request)
    }

    // MARK: - Upload

    /// Request a presigned URL for uploading a file to S3.
    func requestUploadURL(
        name: String,
        path: String,
        size: Int64,
        mimeType: String
    ) async throws -> UploadResponse {
        logger.info("requestUploadURL called for: \(path, privacy: .public)")
        let body = try encoder.encode(
            UploadRequest(name: name, path: path, size: size, mimeType: mimeType)
        )
        let request = makeRequest(path: "files/upload", method: "POST", body: body)
        let (data, _) = try await perform(request)
        return try Self.jsonDecoder.decode(UploadResponse.self, from: data)
    }

    /// Confirm that a file upload has completed, providing a content checksum.
    func confirmUpload(fileId: String, checksum: String) async throws {
        logger.info("confirmUpload called for: \(fileId, privacy: .public)")
        let body = try encoder.encode(
            ConfirmUploadRequest(fileId: fileId, checksum: checksum)
        )
        let request = makeRequest(path: "files/upload/confirm", method: "POST", body: body)
        _ = try await perform(request)
    }

    /// Upload raw file data to a presigned S3 URL using HTTP PUT.
    func uploadData(_ data: Data, to presignedURL: URL) async throws {
        logger.info("uploadData called, size: \(data.count) bytes")
        var request = URLRequest(url: presignedURL)
        request.httpMethod = "PUT"
        request.httpBody = data
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")

        let response: URLResponse
        do {
            (_, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.invalidResponse
        }
    }

    // MARK: - Sharing

    /// Create a shareable link for a file.
    func createShareLink(fileId: String, expiresIn: Int? = nil) async throws -> ShareLinkResponse {
        logger.info("createShareLink called for: \(fileId, privacy: .public)")
        let body = try encoder.encode(ShareRequest(fileId: fileId, expiresIn: expiresIn))
        let request = makeRequest(path: "share", method: "POST", body: body)
        let (data, _) = try await perform(request)
        return try Self.jsonDecoder.decode(ShareLinkResponse.self, from: data)
    }
}

