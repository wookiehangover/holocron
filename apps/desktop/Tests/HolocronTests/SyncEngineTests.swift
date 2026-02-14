import Foundation
import Testing

@testable import HolocronLib

// MARK: - Helpers

private let fm = FileManager.default

private func makeSyncEngine() -> SyncEngine {
    let apiClient = APIClient(
        baseURL: URL(string: "http://localhost:9999")!,
        apiKey: "test-key"
    )
    return SyncEngine(apiClient: apiClient)
}

private func makeTempVault() throws -> URL {
    let url = fm.temporaryDirectory
        .appendingPathComponent("holocron-test-\(UUID().uuidString)")
    try fm.createDirectory(at: url, withIntermediateDirectories: true)
    // Use POSIX realpath to fully resolve symlinks — FileManager.enumerator returns
    // paths under /private/var but URL/NSString resolving methods do not.
    let resolved: String = url.path.withCString { cStr in
        guard let real = realpath(cStr, nil) else { return url.path }
        defer { free(real) }
        return String(cString: real)
    }
    return URL(fileURLWithPath: resolved, isDirectory: true)
}

private func write(_ content: String, to url: URL) throws {
    try content.data(using: .utf8)!.write(to: url)
}

// MARK: - Subfolder enumeration tests

@Suite("SyncEngine.enumerateLocalFiles — subfolder support")
struct SyncEngineEnumerateTests {

    @Test("Subfolder files appear with correct relative paths")
    func subfolderRelativePaths() throws {
        let engine = makeSyncEngine()
        let vault = try makeTempVault()
        defer { try? fm.removeItem(at: vault) }

        let workDir = vault.appendingPathComponent("notes/work")
        try fm.createDirectory(at: workDir, withIntermediateDirectories: true)

        try write("root file", to: vault.appendingPathComponent("readme.md"))
        try write("daily note", to: vault.appendingPathComponent("notes/daily.md"))
        try write("project note", to: workDir.appendingPathComponent("project.md"))

        let files = engine.enumerateLocalFiles(in: vault)
        let paths = Set(files.map(\.relativePath))

        #expect(paths.contains("readme.md"))
        #expect(paths.contains("notes/daily.md"))
        #expect(paths.contains("notes/work/project.md"))
        #expect(paths.count == 3)
    }

    @Test("Hidden subdirectories are skipped")
    func hiddenSubdirectoriesSkipped() throws {
        let engine = makeSyncEngine()
        let vault = try makeTempVault()
        defer { try? fm.removeItem(at: vault) }

        let notesDir = vault.appendingPathComponent("notes")
        let gitDir = vault.appendingPathComponent(".git/objects")
        let obsidianDir = vault.appendingPathComponent(".obsidian/plugins")
        try fm.createDirectory(at: notesDir, withIntermediateDirectories: true)
        try fm.createDirectory(at: gitDir, withIntermediateDirectories: true)
        try fm.createDirectory(at: obsidianDir, withIntermediateDirectories: true)

        try write("visible", to: notesDir.appendingPathComponent("note.md"))
        try write("git object", to: gitDir.appendingPathComponent("abc123"))
        try write("obsidian plugin", to: obsidianDir.appendingPathComponent("data.json"))

        let files = engine.enumerateLocalFiles(in: vault)
        let paths = Set(files.map(\.relativePath))

        #expect(paths.contains("notes/note.md"))
        #expect(!paths.contains(".git/objects/abc123"))
        #expect(!paths.contains(".obsidian/plugins/data.json"))
        #expect(paths.count == 1)
    }

    @Test("Conflict files in subfolders are skipped")
    func conflictFilesInSubfoldersSkipped() throws {
        let engine = makeSyncEngine()
        let vault = try makeTempVault()
        defer { try? fm.removeItem(at: vault) }

        let notesDir = vault.appendingPathComponent("notes")
        try fm.createDirectory(at: notesDir, withIntermediateDirectories: true)

        try write("normal", to: notesDir.appendingPathComponent("daily.md"))
        try write("conflict copy", to: notesDir.appendingPathComponent(
            "daily.conflict-2026-02-14T05-42-46Z.md"
        ))
        try write("root conflict", to: vault.appendingPathComponent(
            "photo.conflict-2026-02-14T06-00-00Z.jpg"
        ))

        let files = engine.enumerateLocalFiles(in: vault)
        let paths = Set(files.map(\.relativePath))

        #expect(paths.contains("notes/daily.md"))
        #expect(!paths.contains("notes/daily.conflict-2026-02-14T05-42-46Z.md"))
        #expect(!paths.contains("photo.conflict-2026-02-14T06-00-00Z.jpg"))
        #expect(paths.count == 1)
    }

    @Test("Empty vault returns no files")
    func emptyVault() throws {
        let engine = makeSyncEngine()
        let vault = try makeTempVault()
        defer { try? fm.removeItem(at: vault) }

        let files = engine.enumerateLocalFiles(in: vault)
        #expect(files.isEmpty)
    }
}

// MARK: - Download path construction tests

@Suite("SyncEngine download — subfolder path construction")
struct SyncEngineDownloadPathTests {

    @Test("Download path for subfolder file creates intermediate directories")
    func subfolderDirectoryCreation() throws {
        let vault = try makeTempVault()
        defer { try? fm.removeItem(at: vault) }

        let remotePath = "notes/work/project.md"
        let localURL = vault.appendingPathComponent(remotePath)
        let parentDir = localURL.deletingLastPathComponent()

        #expect(!fm.fileExists(atPath: parentDir.path))

        // Replicate downloadFile's directory-creation logic
        try fm.createDirectory(at: parentDir, withIntermediateDirectories: true)
        try write("downloaded content", to: localURL)

        #expect(fm.fileExists(atPath: localURL.path))
        #expect(localURL.path.hasSuffix("notes/work/project.md"))
    }

    @Test("Download path for root-level file needs no directory creation")
    func rootLevelFile() throws {
        let vault = try makeTempVault()
        defer { try? fm.removeItem(at: vault) }

        let remotePath = "readme.md"
        let localURL = vault.appendingPathComponent(remotePath)
        let parentDir = localURL.deletingLastPathComponent()

        // Parent is the vault itself — already exists
        #expect(fm.fileExists(atPath: parentDir.path))

        try write("root content", to: localURL)
        #expect(fm.fileExists(atPath: localURL.path))
    }
}

