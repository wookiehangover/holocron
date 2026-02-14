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

            // 1. List remote files
            let remoteFiles = try await apiClient.listRemoteFiles()
            let remoteByPath = Dictionary(uniqueKeysWithValues: remoteFiles.map { ($0.path, $0) })

            // 2. Scan local files
            let localFiles = enumerateLocalFiles(in: vaultURL)
            let localByRelativePath = Dictionary(uniqueKeysWithValues: localFiles.map { ($0.relativePath, $0) })

            // 3. Upload new local files (exist locally but not remotely)
            for localFile in localFiles {
                if remoteByPath[localFile.relativePath] == nil {
                    try await uploadFile(localFile, vaultURL: vaultURL)
                }
            }

            // 4. Download new remote files (exist remotely but not locally)
            for remoteFile in remoteFiles {
                if localByRelativePath[remoteFile.path] == nil {
                    try await downloadFile(remoteFile, vaultURL: vaultURL)
                }
            }

            // 5. Handle conflicts (exist in both with different checksums)
            for remoteFile in remoteFiles {
                if let localFile = localByRelativePath[remoteFile.path] {
                    let localChecksum = localFile.checksum
                    if localChecksum != remoteFile.checksum {
                        try await resolveConflict(localFile: localFile, remoteFile: remoteFile, vaultURL: vaultURL)
                    }
                }
            }

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
            let size = Int64(values.fileSize ?? 0)
            let checksum = computeChecksum(for: fileURL)

            results.append(LocalFile(
                url: fileURL,
                relativePath: relativePath,
                size: size,
                checksum: checksum
            ))
        }

        return results
    }

    private func computeChecksum(for url: URL) -> String {
        guard let data = try? Data(contentsOf: url) else { return "" }
        // Simple size-based checksum as a proxy; a real implementation would use SHA-256
        return "\(data.count)"
    }

    // MARK: - Upload

    private func uploadFile(_ localFile: LocalFile, vaultURL: URL) async throws {
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
    }

    // MARK: - Download

    private func downloadFile(_ remoteFile: APIClient.RemoteFile, vaultURL: URL) async throws {
        logger.info("Downloading: \(remoteFile.path, privacy: .public)")

        let downloadURL = try await apiClient.requestDownloadURL(for: remoteFile.id)

        let (data, response) = try await URLSession.shared.data(from: downloadURL)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode)
        else {
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

