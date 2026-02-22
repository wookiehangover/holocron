import Foundation

/// A node in the virtual folder tree built from flat file paths.
enum FileNode: Identifiable {
    case folder(name: String, children: [FileNode])
    case file(HolocronFile)

    var id: String {
        switch self {
        case .folder(let name, _):
            return "folder://\(name)"
        case .file(let file):
            return file.id
        }
    }

    var name: String {
        switch self {
        case .folder(let name, _):
            return name
        case .file(let file):
            return file.name
        }
    }

    /// Build a virtual folder tree from a flat list of files.
    ///
    /// Files without `/` in their path are root-level.
    /// Files with `/` in their path are grouped into folders recursively.
    /// Sorting: folders first (alphabetically), then files (alphabetically).
    static func buildTree(from files: [HolocronFile]) -> [FileNode] {
        // Group files by their first path component
        var folderContents: [String: [HolocronFile]] = [:]
        var rootFiles: [HolocronFile] = []

        for file in files {
            let components = file.path.split(separator: "/", maxSplits: 1)
            if components.count > 1 {
                let folderName = String(components[0])
                folderContents[folderName, default: []].append(file)
            } else {
                rootFiles.append(file)
            }
        }

        // Build folder nodes recursively
        let folders: [FileNode] = folderContents.keys.sorted().map { folderName in
            let children = folderContents[folderName]!
            // Strip the first path component from each child's path for recursion
            let strippedFiles = children.map { file -> HolocronFile in
                let remaining = file.path.split(separator: "/", maxSplits: 1)
                let newPath = remaining.count > 1 ? String(remaining[1]) : file.name
                return HolocronFile(
                    id: file.id,
                    name: file.name,
                    path: newPath,
                    size: file.size,
                    mimeType: file.mimeType,
                    checksum: file.checksum,
                    createdAt: file.createdAt,
                    updatedAt: file.updatedAt,
                    indexingStatus: file.indexingStatus
                )
            }
            let childNodes = buildTree(from: strippedFiles)
            return .folder(name: folderName, children: childNodes)
        }

        // Build file nodes sorted alphabetically
        let fileNodes: [FileNode] = rootFiles
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            .map { .file($0) }

        // Folders first, then files
        return folders + fileNodes
    }
}

