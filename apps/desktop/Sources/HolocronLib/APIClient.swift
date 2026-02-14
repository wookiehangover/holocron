import Foundation
import os

/// HTTP client for communicating with the Holocron backend API.
public final class APIClient {
    private let logger = Logger(subsystem: "com.sambreed.Holocron", category: "api")
    private let baseURL: URL
    private let session: URLSession
    private let apiKey: String

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private let encoder = JSONEncoder()

    public init(
        baseURL: URL? = nil,
        session: URLSession = .shared,
        apiKey: String? = nil
    ) {
        let config = Config.load()
        self.baseURL = baseURL ?? URL(string: config.resolvedAPIURL)!
        self.session = session
        self.apiKey = apiKey ?? config.resolvedAPIKey
        logger.info("APIClient initialized with base URL: \(self.baseURL.absoluteString, privacy: .public)")
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

    // MARK: - API Methods

    /// Request a presigned URL for uploading a file to S3.
    public func requestUploadURL(
        name: String,
        path: String,
        size: Int64,
        mimeType: String
    ) async throws -> UploadResponse {
        logger.info("requestUploadURL called for: \(path, privacy: .public)")
        let body = UploadRequest(name: name, path: path, size: size, mimeType: mimeType)
        let encoded = try encoder.encode(body)
        let request = makeRequest(path: "files/upload", method: "POST", body: encoded)
        let (responseData, _) = try await perform(request)
        return try decoder.decode(UploadResponse.self, from: responseData)
    }

    /// Request a presigned URL for downloading a file from S3.
    public func requestDownloadURL(
        for fileId: String
    ) async throws -> URL {
        logger.info("requestDownloadURL called for file: \(fileId, privacy: .public)")
        let request = makeRequest(path: "files/\(fileId)")
        let (data, _) = try await perform(request)
        let response = try decoder.decode(FileDetailResponse.self, from: data)
        guard let url = URL(string: response.downloadUrl) else {
            throw APIError.invalidResponse
        }
        return url
    }

    /// List files in the remote vault.
    public func listRemoteFiles() async throws -> [RemoteFile] {
        logger.info("listRemoteFiles called")
        let request = makeRequest(path: "files")
        let (data, _) = try await perform(request)
        let response = try decoder.decode(FilesListResponse.self, from: data)
        return response.files
    }

    /// Confirm a file upload has completed.
    public func confirmUpload(fileId: String) async throws {
        logger.info("confirmUpload called for file: \(fileId, privacy: .public)")
        let body = try encoder.encode(ConfirmUploadRequest(fileId: fileId))
        let request = makeRequest(path: "files/upload/confirm", method: "POST", body: body)
        _ = try await perform(request)
    }

    /// Create a shareable link for a file.
    public func createShareLink(
        fileId: String,
        expiresIn: Int? = nil
    ) async throws -> ShareLinkResponse {
        logger.info("createShareLink called for file: \(fileId, privacy: .public)")
        let body = try encoder.encode(ShareRequest(fileId: fileId, expiresIn: expiresIn))
        let request = makeRequest(path: "share", method: "POST", body: body)
        let (responseData, _) = try await perform(request)
        return try decoder.decode(ShareLinkResponse.self, from: responseData)
    }

    // MARK: - Types

    public enum APIError: Error, CustomStringConvertible {
        case unauthorized
        case notFound
        case serverError(Int)
        case networkError(Error)
        case invalidResponse

        public var description: String {
            switch self {
            case .unauthorized:
                return "Unauthorized — invalid or missing API key"
            case .notFound:
                return "Resource not found"
            case .serverError(let code):
                return "Server error (\(code))"
            case .networkError(let error):
                return "Network error: \(error.localizedDescription)"
            case .invalidResponse:
                return "Invalid server response"
            }
        }
    }

    public struct RemoteFile: Codable, Sendable {
        public let id: String
        public let name: String
        public let path: String
        public let size: Int64
        public let mimeType: String
        public let checksum: String
        public let createdAt: Date
        public let updatedAt: Date
    }

    // MARK: - Request Types

    private struct UploadRequest: Encodable {
        let name: String
        let path: String
        let size: Int64
        let mimeType: String
    }

    private struct ConfirmUploadRequest: Encodable {
        let fileId: String
    }

    private struct ShareRequest: Encodable {
        let fileId: String
        let expiresIn: Int?
    }

    // MARK: - Response Types

    public struct UploadResponse: Codable, Sendable {
        public let fileId: String
        public let uploadUrl: String
    }

    struct FileDetailResponse: Codable {
        let file: RemoteFile
        let downloadUrl: String
    }

    struct FilesListResponse: Codable {
        let files: [RemoteFile]
    }

    public struct ShareLinkResponse: Codable, Sendable {
        public let id: String
        public let url: String
        public let expiresAt: Date?
    }
}

