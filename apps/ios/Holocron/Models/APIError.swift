import Foundation

/// Errors returned by the Holocron API client.
enum APIError: Error, LocalizedError {
    /// The request failed due to a network issue.
    case networkError(Error)
    /// The API key is missing or invalid (HTTP 401).
    case unauthorized
    /// The requested resource was not found (HTTP 404).
    case notFound
    /// The server returned an error status code (5xx).
    case serverError(Int)
    /// The response was not a valid HTTP response or had an unexpected status.
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .unauthorized:
            return "Unauthorized — invalid or missing API key"
        case .notFound:
            return "Resource not found"
        case .serverError(let code):
            return "Server error (\(code))"
        case .invalidResponse:
            return "Invalid server response"
        }
    }
}

// Sendable conformance for the associated Error value
extension APIError: CustomStringConvertible {
    var description: String {
        errorDescription ?? "Unknown API error"
    }
}

