import Foundation

/// Manages a local file cache in the app's Documents directory.
/// Files are stored under `Documents/Files/` mirroring their server path,
/// and a JSON manifest tracks checksums for cache invalidation.
@MainActor
final class FileCache {
    static let shared = FileCache()

    private let fileManager = FileManager.default

    private var baseURL: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
            .appendingPathComponent("Files", isDirectory: true)
    }

    private var manifestURL: URL {
        baseURL.appendingPathComponent(".cache-manifest.json")
    }

    private init() {}

    // MARK: - Public API

    /// Returns cached file URL if it exists AND checksum matches. Nil means cache miss.
    func cachedURL(for file: HolocronFile) -> URL? {
        let manifest = loadManifest()
        guard let entry = manifest[file.id] else { return nil }
        guard entry.checksum == file.checksum else { return nil }
        let fileURL = baseURL.appendingPathComponent(entry.localRelativePath)
        guard fileManager.fileExists(atPath: fileURL.path) else { return nil }
        return fileURL
    }

    /// Write file data to Documents/Files/{path}, update manifest. Returns local URL.
    func cache(data: Data, for file: HolocronFile) throws -> URL {
        let relativePath = file.path.isEmpty ? file.name : file.path
        let fileURL = baseURL.appendingPathComponent(relativePath)

        // Create intermediate directories
        let directory = fileURL.deletingLastPathComponent()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)

        // Write file data
        try data.write(to: fileURL, options: .atomic)

        // Update manifest
        var manifest = loadManifest()
        manifest[file.id] = CacheEntry(
            localRelativePath: relativePath,
            checksum: file.checksum,
            cachedAt: Date()
        )
        saveManifest(manifest)

        return fileURL
    }

    /// Remove a specific file from cache + manifest.
    func removeCachedFile(id: String) {
        var manifest = loadManifest()
        guard let entry = manifest.removeValue(forKey: id) else { return }
        let fileURL = baseURL.appendingPathComponent(entry.localRelativePath)
        try? fileManager.removeItem(at: fileURL)
        saveManifest(manifest)
    }

    /// Remove all cached files.
    func clearCache() {
        try? fileManager.removeItem(at: baseURL)
    }

    // MARK: - Manifest

    private struct CacheEntry: Codable {
        let localRelativePath: String
        let checksum: String
        let cachedAt: Date
    }

    private func loadManifest() -> [String: CacheEntry] {
        guard let data = try? Data(contentsOf: manifestURL),
              let manifest = try? JSONDecoder().decode([String: CacheEntry].self, from: data)
        else {
            return [:]
        }
        return manifest
    }

    private func saveManifest(_ manifest: [String: CacheEntry]) {
        do {
            try fileManager.createDirectory(at: baseURL, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(manifest)
            try data.write(to: manifestURL, options: .atomic)
        } catch {
            // Best-effort — cache still works, just won't persist manifest
        }
    }
}

