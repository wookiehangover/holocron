import Foundation
import os

/// HTTP client for communicating with the Holocron backend API.
/// Currently a placeholder — will be wired up when the API is deployed.
public final class APIClient {
    private let logger = Logger(subsystem: "com.sambreed.Holocron", category: "api")
    private let baseURL: URL
    private let session: URLSession

    public init(
        baseURL: URL = URL(string: "http://localhost:3000")!,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.session = session
        logger.info("APIClient initialized with base URL: \(baseURL.absoluteString, privacy: .public)")
    }

    /// Request a presigned URL for uploading a file to S3.
    public func requestUploadURL(
        for relativePath: String
    ) async throws -> URL {
        // TODO: Implement actual API call
        logger.info("requestUploadURL called for: \(relativePath, privacy: .public)")
        throw APIError.notImplemented
    }

    /// Request a presigned URL for downloading a file from S3.
    public func requestDownloadURL(
        for relativePath: String
    ) async throws -> URL {
        // TODO: Implement actual API call
        logger.info("requestDownloadURL called for: \(relativePath, privacy: .public)")
        throw APIError.notImplemented
    }

    /// List files in the remote vault.
    public func listRemoteFiles() async throws -> [RemoteFile] {
        // TODO: Implement actual API call
        logger.info("listRemoteFiles called")
        throw APIError.notImplemented
    }

    // MARK: - Types

    public enum APIError: Error, CustomStringConvertible {
        case notImplemented
        case networkError(Error)
        case invalidResponse

        public var description: String {
            switch self {
            case .notImplemented:
                return "API not yet implemented"
            case .networkError(let error):
                return "Network error: \(error.localizedDescription)"
            case .invalidResponse:
                return "Invalid server response"
            }
        }
    }

    public struct RemoteFile: Codable, Sendable {
        public let path: String
        public let size: Int64
        public let lastModified: Date
    }
}

