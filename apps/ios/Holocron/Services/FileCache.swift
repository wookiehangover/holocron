import Foundation

/// Manages a local file cache in the app's Documents directory.
/// Files are stored directly under `Documents/` mirroring their server path,
/// and a JSON manifest in Library/Application Support tracks checksums for cache invalidation.
@MainActor
final class FileCache {
    static let shared = FileCache()

    private let fileManager = FileManager.default

    private var baseURL: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
    }

    private var manifestURL: URL {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport.appendingPathComponent("holocron-cache-manifest.json")
    }

    private init() {
        migrateFromLegacyCacheDirectory()
    }

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

    /// Write file data to Documents/{path}, update manifest. Returns local URL.
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
        removeEmptyAncestorDirectories(from: fileURL.deletingLastPathComponent(), upTo: baseURL)
        saveManifest(manifest)
    }

    /// Remove all cached files.
    func clearCache() {
        let manifest = loadManifest()
        for entry in manifest.values {
            let fileURL = baseURL.appendingPathComponent(entry.localRelativePath)
            try? fileManager.removeItem(at: fileURL)
            removeEmptyAncestorDirectories(from: fileURL.deletingLastPathComponent(), upTo: baseURL)
        }
        saveManifest([:])
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
            let manifestDir = manifestURL.deletingLastPathComponent()
            try fileManager.createDirectory(at: manifestDir, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(manifest)
            try data.write(to: manifestURL, options: .atomic)
        } catch {
            // Best-effort — cache still works, just won't persist manifest
        }
    }

    // MARK: - Private Helpers

    /// Walk up from `directory` removing empty directories, stopping before `stopAt`.
    private func removeEmptyAncestorDirectories(from directory: URL, upTo stopAt: URL) {
        var current = directory.standardizedFileURL
        let stop = stopAt.standardizedFileURL
        while current != stop {
            let contents = try? fileManager.contentsOfDirectory(atPath: current.path)
            guard let items = contents, items.isEmpty else { break }
            try? fileManager.removeItem(at: current)
            current = current.deletingLastPathComponent().standardizedFileURL
        }
    }

    /// Remove stale legacy cache directory (`Documents/Files/`) and its old manifest.
    private func migrateFromLegacyCacheDirectory() {
        let legacyDir = baseURL.appendingPathComponent("Files", isDirectory: true)
        if fileManager.fileExists(atPath: legacyDir.path) {
            try? fileManager.removeItem(at: legacyDir)
        }
    }
}

