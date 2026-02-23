import Foundation

/// Represents a file stored in the Holocron vault.
/// Matches the server's `HolocronFile` type with camelCase JSON keys.
struct HolocronFile: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let path: String
    let size: Int64
    let mimeType: String
    let checksum: String
    let createdAt: Date
    let updatedAt: Date
    let indexingStatus: String?
}

