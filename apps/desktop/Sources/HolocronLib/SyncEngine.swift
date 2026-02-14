import CryptoKit
import Foundation
import UniformTypeIdentifiers
import os

/// Manages sync operations between the local vault and the remote backend.
public final class SyncEngine {
    private let logger = Logger(subsystem: "com.sambreed.Holocron", category: "sync")
    private let apiClient: APIClient
    private let fileManager = FileManager.default

    public enum SyncState: Equatable {
        case idle
        case syncing
        case error(String)
    }

    public private(set) var state: SyncState = .idle

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
        logger.info("SyncEngine initialized")
    }

    /// Start periodic background syncing.
    public func start() {
        logger.info("SyncEngine started")
        state = .idle
    }

    /// Stop all sync activity.
    public func stop() {
        logger.info("SyncEngine stopped")
        state = .idle
    }

    /// Trigger an immediate sync.
    public func syncNow() async {
        logger.info("SyncEngine: syncNow called")
        state = .syncing

        do {
            let vaultURL = URL(fileURLWithPath: FileWatcher.defaultVaultPath)

            // Ensure vault directory exists
            if !fileManager.fileExists(atPath: vaultURL.path) {
                try fileManager.createDirectory(at: vaultURL, withIntermediateDirectories: true)
            }

            // Load previous sync state
            var manifest = loadManifest()

            // 1. List remote files
            let remoteFiles = try await apiClient.listRemoteFiles()
            let remoteByPath = Dictionary(uniqueKeysWithValues: remoteFiles.map { ($0.path, $0) })

            // 2. Scan local files
            let localFiles = enumerateLocalFiles(in: vaultURL)
            let localByRelativePath = Dictionary(uniqueKeysWithValues: localFiles.map { ($0.relativePath, $0) })

            // Collect all known paths
            var allPaths = Set<String>()
            allPaths.formUnion(manifest.keys)
            allPaths.formUnion(localByRelativePath.keys)
            allPaths.formUnion(remoteByPath.keys)

            for path in allPaths {
                let inManifest = manifest[path]
                let onDisk = localByRelativePath[path]
                let onRemote = remoteByPath[path]

                switch (inManifest, onDisk, onRemote) {

                // In manifest + on disk + on remote → compare checksums
                case let (.some(entry), .some(local), .some(remote)):
                    let localChanged = local.checksum != entry.checksum
                    let remoteChanged = remote.checksum != entry.checksum

                    if localChanged && remoteChanged {
                        // Both sides changed — conflict
                        if local.checksum != remote.checksum {
                            try await resolveConflict(localFile: local, remoteFile: remote, vaultURL: vaultURL)
                            manifest[path] = SyncManifestEntry(checksum: remote.checksum, fileId: remote.id)
                        }
                        // If checksums match, both sides made the same change — no action needed
                    } else if localChanged {
                        // Local changed, remote didn't — upload
                        try await uploadFile(local, vaultURL: vaultURL)
                        manifest[path] = SyncManifestEntry(checksum: local.checksum, fileId: entry.fileId)
                    } else if remoteChanged {
                        // Remote changed, local didn't — download
                        try await downloadFile(remote, vaultURL: vaultURL)
                        manifest[path] = SyncManifestEntry(checksum: remote.checksum, fileId: remote.id)
                    }
                    // else: no changes — nothing to do

                // In manifest + on disk + NOT on remote → remote was deleted
                case (.some(_), .some(let local), .none):
                    logger.info("Remote deleted, removing local: \(path, privacy: .public)")
                    try fileManager.removeItem(at: local.url)
                    manifest.removeValue(forKey: path)

                // In manifest + NOT on disk + on remote → local was deleted
                case (.some(let entry), .none, .some(_)):
                    logger.info("Local deleted, removing remote: \(path, privacy: .public)")
                    try await apiClient.deleteFile(id: entry.fileId)
                    manifest.removeValue(forKey: path)

                // In manifest + NOT on disk + NOT on remote → both deleted
                case (.some(_), .none, .none):
                    manifest.removeValue(forKey: path)

                // NOT in manifest + on disk + on remote → new on both sides
                case (.none, .some(let local), .some(let remote)):
                    if local.checksum != remote.checksum {
                        // Different content — conflict
                        try await resolveConflict(localFile: local, remoteFile: remote, vaultURL: vaultURL)
                    }
                    manifest[path] = SyncManifestEntry(checksum: remote.checksum, fileId: remote.id)

                // NOT in manifest + on disk + NOT on remote → new local file
                case (.none, .some(let local), .none):
                    let response = try await uploadFile(local, vaultURL: vaultURL)
                    manifest[path] = SyncManifestEntry(checksum: local.checksum, fileId: response.fileId)

                // NOT in manifest + NOT on disk + on remote → new remote file
                case (.none, .none, .some(let remote)):
                    try await downloadFile(remote, vaultURL: vaultURL)
                    manifest[path] = SyncManifestEntry(checksum: remote.checksum, fileId: remote.id)

                // NOT in manifest + NOT on disk + NOT on remote → impossible, skip
                case (.none, .none, .none):
                    break
                }
            }

            // Save updated manifest
            saveManifest(manifest)

            state = .idle
            logger.info("SyncEngine: sync complete")
        } catch {
            let message = String(describing: error)
            state = .error(message)
            logger.error("SyncEngine: sync failed — \(message, privacy: .public)")
        }
    }

    // MARK: - Local File Enumeration

    private struct LocalFile {
        let url: URL
        let relativePath: String
        let size: Int64
        let checksum: String
    }

    private func enumerateLocalFiles(in vaultURL: URL) -> [LocalFile] {
        var results: [LocalFile] = []
        guard let enumerator = fileManager.enumerator(
            at: vaultURL,
            includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else {
            return results
        }

        for case let fileURL as URL in enumerator {
            // Skip hidden directories (same logic as FileWatcher.hasRelevantChange)
            let pathComponents = fileURL.pathComponents
            let vaultComponents = vaultURL.pathComponents
            let relativeComponents = Array(pathComponents.dropFirst(vaultComponents.count))
            let dirComponents = relativeComponents.dropLast()
            let isInsideHiddenDir = dirComponents.contains { $0.hasPrefix(".") && $0.count > 1 }
            if isInsideHiddenDir {
                continue
            }

            guard let values = try? fileURL.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
                  values.isRegularFile == true
            else {
                continue
            }

            let relativePath = relativeComponents.joined(separator: "/")

            // Skip conflict files — they are local-only backups
            let filename = fileURL.lastPathComponent
            if filename.contains(".conflict-") {
                continue
            }

            let size = Int64(values.fileSize ?? 0)
            guard let checksum = try? computeChecksum(for: fileURL) else {
                continue
            }

            results.append(LocalFile(
                url: fileURL,
                relativePath: relativePath,
                size: size,
                checksum: checksum
            ))
        }

        return results
    }

    private func computeChecksum(for url: URL) throws -> String {
        let data = try Data(contentsOf: url)
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Sync Manifest

    private struct SyncManifestEntry: Codable {
        let checksum: String
        let fileId: String
    }

    private static var manifestURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config/holocron/sync-state.json")
    }

    private func loadManifest() -> [String: SyncManifestEntry] {
        let url = Self.manifestURL
        guard let data = try? Data(contentsOf: url) else { return [:] }
        return (try? JSONDecoder().decode([String: SyncManifestEntry].self, from: data)) ?? [:]
    }

    private func saveManifest(_ manifest: [String: SyncManifestEntry]) {
        let url = Self.manifestURL
        let dir = url.deletingLastPathComponent()
        try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(manifest) {
            try? data.write(to: url)
        }
    }

    // MARK: - Upload

    @discardableResult
    private func uploadFile(_ localFile: LocalFile, vaultURL: URL) async throws -> APIClient.UploadResponse {
        let name = localFile.url.lastPathComponent
        let mimeType = detectMimeType(for: localFile.url)
        let data = try Data(contentsOf: localFile.url)

        logger.info("Uploading: \(localFile.relativePath, privacy: .public)")

        let uploadResponse = try await apiClient.requestUploadURL(
            name: name,
            path: localFile.relativePath,
            size: localFile.size,
            mimeType: mimeType
        )

        // PUT to presigned S3 URL
        guard let presignedURL = URL(string: uploadResponse.uploadUrl) else {
            throw SyncError.invalidUploadURL
        }
        var request = URLRequest(url: presignedURL)
        request.httpMethod = "PUT"
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode)
        else {
            throw SyncError.uploadFailed(localFile.relativePath)
        }

        try await apiClient.confirmUpload(fileId: uploadResponse.fileId)
        logger.info("Uploaded: \(localFile.relativePath, privacy: .public)")
        return uploadResponse
    }

    // MARK: - Download

    private func downloadFile(_ remoteFile: APIClient.RemoteFile, vaultURL: URL) async throws {
        logger.info("Downloading: \(remoteFile.path, privacy: .public)")

        let downloadURL = try await apiClient.requestDownloadURL(for: remoteFile.id)

        let (data, response) = try await URLSession.shared.data(from: downloadURL)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode)
        else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            let body = String(data: data, encoding: .utf8) ?? "(non-utf8)"
            logger.error("Download HTTP \(status) for \(remoteFile.path, privacy: .public): \(body, privacy: .public)")
            throw SyncError.downloadFailed(remoteFile.path)
        }

        let localURL = vaultURL.appendingPathComponent(remoteFile.path)
        let parentDir = localURL.deletingLastPathComponent()
        if !fileManager.fileExists(atPath: parentDir.path) {
            try fileManager.createDirectory(at: parentDir, withIntermediateDirectories: true)
        }

        try data.write(to: localURL)
        logger.info("Downloaded: \(remoteFile.path, privacy: .public)")
    }

    // MARK: - Conflict Resolution

    private func resolveConflict(
        localFile: LocalFile,
        remoteFile: APIClient.RemoteFile,
        vaultURL: URL
    ) async throws {
        logger.info("Conflict detected: \(localFile.relativePath, privacy: .public)")

        let timestamp = ISO8601DateFormatter().string(from: Date())
            .replacingOccurrences(of: ":", with: "-")
        let ext = localFile.url.pathExtension
        let nameWithoutExt = localFile.url.deletingPathExtension().lastPathComponent
        let conflictName: String
        if ext.isEmpty {
            conflictName = "\(nameWithoutExt).conflict-\(timestamp)"
        } else {
            conflictName = "\(nameWithoutExt).conflict-\(timestamp).\(ext)"
        }
        let conflictURL = localFile.url.deletingLastPathComponent().appendingPathComponent(conflictName)

        // Rename local file to conflict copy
        try fileManager.moveItem(at: localFile.url, to: conflictURL)

        // Download remote version to original path
        try await downloadFile(remoteFile, vaultURL: vaultURL)

        logger.info("Conflict resolved: local renamed to \(conflictName, privacy: .public)")
    }

    // MARK: - MIME Type Detection

    private func detectMimeType(for url: URL) -> String {
        let ext = url.pathExtension
        if let utType = UTType(filenameExtension: ext) {
            return utType.preferredMIMEType ?? "application/octet-stream"
        }
        return "application/octet-stream"
    }

    // MARK: - Errors

    private enum SyncError: Error, CustomStringConvertible {
        case invalidUploadURL
        case uploadFailed(String)
        case downloadFailed(String)

        var description: String {
            switch self {
            case .invalidUploadURL:
                return "Invalid presigned upload URL"
            case .uploadFailed(let path):
                return "Upload failed for \(path)"
            case .downloadFailed(let path):
                return "Download failed for \(path)"
            }
        }
    }
}

