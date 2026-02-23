import CryptoKit
import SwiftUI
import UniformTypeIdentifiers

enum ActiveSheet: Identifiable {
    case documentPicker
    case shareSheet(URL)

    var id: Int {
        switch self {
        case .documentPicker: return 0
        case .shareSheet: return 1
        }
    }
}

/// Main file browser view with virtual folder navigation and file operations.
struct FileBrowserView: View {
    @EnvironmentObject var settingsStore: SettingsStore
    @State private var nodes: [FileNode] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    // File operation state
    @State private var activeSheet: ActiveSheet?
    @State private var showPreview = false
    @State private var previewURL: URL?
    @State private var showRenameAlert = false
    @State private var renameText = ""
    @State private var selectedFile: HolocronFile?
    @State private var isUploading = false
    @State private var showDeleteConfirm = false
    @State private var isDownloading = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && nodes.isEmpty {
                    ProgressView("Loading files…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let errorMessage {
                    errorStateView(message: errorMessage)
                } else if nodes.isEmpty {
                    emptyStateView
                } else {
                    fileListView(nodes: nodes, currentPath: "")
                }
            }
            .navigationTitle("Files")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Image(systemName: "moon.dust")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    if isUploading {
                        ProgressView()
                    } else {
                        Button {
                            activeSheet = .documentPicker
                        } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
            .overlay {
                if isDownloading {
                    ProgressView("Opening file…")
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .task {
                await loadFiles()
            }
            .sheet(item: $activeSheet) { sheet in
                switch sheet {
                case .documentPicker:
                    DocumentPickerView { url in
                        Task { await uploadFile(from: url, toFolder: "") }
                    }
                case .shareSheet(let url):
                    ShareSheetView(items: [url])
                }
            }
            .fullScreenCover(isPresented: $showPreview) {
                if let previewURL {
                    FilePreviewSheet(
                        fileURL: previewURL,
                        file: selectedFile,
                        settingsStore: settingsStore,
                        onDismiss: { showPreview = false }
                    )
                }
            }
            .alert("Rename File", isPresented: $showRenameAlert) {
                TextField("New name", text: $renameText)
                Button("Cancel", role: .cancel) {}
                Button("Rename") {
                    if let file = selectedFile {
                        Task { await renameFile(file, to: renameText) }
                    }
                }
            } message: {
                Text("Enter a new name for the file.")
            }
            .alert("Delete File?", isPresented: $showDeleteConfirm) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    if let file = selectedFile {
                        Task { await deleteFile(file) }
                    }
                }
            } message: {
                if let file = selectedFile {
                    Text("Are you sure you want to delete \"\(file.name)\"? This cannot be undone.")
                }
            }

        }
    }

    // MARK: - Subviews

    private func fileListView(nodes: [FileNode], currentPath: String) -> some View {
        List {
            ForEach(nodes) { node in
                switch node {
                case .folder(let name, let children):
                    NavigationLink {
                        FolderContentView(
                            folderName: name,
                            nodes: children,
                            currentPath: currentPath.isEmpty ? name : "\(currentPath)/\(name)",
                            onView: { file in await viewFile(file) },
                            onShare: { file in await shareFile(file) },
                            onDelete: { file in promptDelete(file) },
                            onRename: { file in promptRename(file) },
                            onUpload: { url, folder in await uploadFile(from: url, toFolder: folder) },
                            isUploading: $isUploading
                        )
                        .environmentObject(settingsStore)
                    } label: {
                        Label(name, systemImage: "folder.fill")
                    }
                case .file(let holocronFile):
                    fileRow(for: holocronFile, currentPath: currentPath)
                }
            }
        }
        .refreshable {
            await loadFiles()
        }
    }

    private func fileRow(for file: HolocronFile, currentPath: String) -> some View {
        Button {
            Task { await viewFile(file) }
        } label: {
            FileRowView(file: file)
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) {
                    promptDelete(file)
                } label: {
                    Label("Delete", systemImage: "trash")
                }
                Button {
                    promptRename(file)
                } label: {
                    Label("Rename", systemImage: "pencil")
                }
                .tint(.orange)
            }
            .contextMenu {
                Button { Task { await viewFile(file) } } label: {
                    Label("View", systemImage: "eye")
                }
                Button { Task { await shareFile(file) } } label: {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                Divider()
                Button { promptRename(file) } label: {
                    Label("Rename", systemImage: "pencil")
                }
                Button(role: .destructive) { promptDelete(file) } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
    }

    private var emptyStateView: some View {
        ContentUnavailableView(
            "No Files",
            systemImage: "doc",
            description: Text("Upload files to get started.")
        )
    }

    private func errorStateView(message: String) -> some View {
        ContentUnavailableView {
            Label("Error", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Retry") {
                Task { await loadFiles() }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    // MARK: - Prompts

    private func promptDelete(_ file: HolocronFile) {
        selectedFile = file
        showDeleteConfirm = true
    }

    private func promptRename(_ file: HolocronFile) {
        selectedFile = file
        renameText = file.name
        showRenameAlert = true
    }

    // MARK: - File Actions

    private func viewFile(_ file: HolocronFile) async {
        isDownloading = true
        defer { isDownloading = false }
        do {
            // Check cache first
            if let cachedURL = FileCache.shared.cachedURL(for: file) {
                selectedFile = file
                previewURL = cachedURL
                showPreview = true
                return
            }
            // Cache miss — download and cache
            let client = makeClient()
            let (serverFile, downloadURL) = try await client.getFile(id: file.id)
            let (data, _) = try await URLSession.shared.data(from: downloadURL)
            let localURL = try FileCache.shared.cache(data: data, for: serverFile)
            selectedFile = file
            previewURL = localURL
            showPreview = true
        } catch {
            errorMessage = "Preview failed: \(error.localizedDescription)"
        }
    }

    private func shareFile(_ file: HolocronFile) async {
        do {
            let client = makeClient()
            let response = try await client.createShareLink(fileId: file.id)
            let baseURL = settingsStore.serverURL.hasSuffix("/")
                ? settingsStore.serverURL
                : settingsStore.serverURL + "/"
            let sharePath = response.url.hasPrefix("/") ? String(response.url.dropFirst()) : response.url
            if let url = URL(string: baseURL + sharePath) {
                activeSheet = .shareSheet(url)
            }
        } catch {
            errorMessage = "Share failed: \(error.localizedDescription)"
        }
    }

    private func deleteFile(_ file: HolocronFile) async {
        do {
            let client = makeClient()
            try await client.deleteFile(id: file.id)
            FileCache.shared.removeCachedFile(id: file.id)
            await loadFiles()
        } catch {
            errorMessage = "Delete failed: \(error.localizedDescription)"
        }
    }

    private func renameFile(_ file: HolocronFile, to newName: String) async {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        // Reconstruct full path: replace the last component with the new name
        let components = file.path.split(separator: "/")
        let newPath: String
        if components.count > 1 {
            let folder = components.dropLast().joined(separator: "/")
            newPath = "\(folder)/\(trimmed)"
        } else {
            newPath = trimmed
        }
        do {
            let client = makeClient()
            try await client.updateFilePath(id: file.id, path: newPath)
            await loadFiles()
        } catch {
            errorMessage = "Rename failed: \(error.localizedDescription)"
        }
    }

    private func uploadFile(from url: URL, toFolder folder: String) async {
        isUploading = true
        defer { isUploading = false }
        do {
            let fileData = try Data(contentsOf: url)
            let fileName = url.lastPathComponent
            let filePath = folder.isEmpty ? fileName : "\(folder)/\(fileName)"
            let mimeType = mimeTypeForURL(url)

            let client = makeClient()
            let uploadResponse = try await client.requestUploadURL(
                name: fileName,
                path: filePath,
                size: Int64(fileData.count),
                mimeType: mimeType
            )

            guard let presignedURL = URL(string: uploadResponse.uploadUrl) else {
                errorMessage = "Invalid upload URL"
                return
            }
            try await client.uploadData(fileData, to: presignedURL)

            let checksum = SHA256.hash(data: fileData)
                .map { String(format: "%02x", $0) }
                .joined()

            try await client.confirmUpload(fileId: uploadResponse.fileId, checksum: checksum)
            await loadFiles()
        } catch {
            errorMessage = "Upload failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Data Loading

    private func loadFiles() async {
        isLoading = true
        errorMessage = nil
        do {
            let client = makeClient()
            let files = try await client.listFiles()
            nodes = FileNode.buildTree(from: files)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Helpers

    private func makeClient() -> APIClient {
        APIClient(serverURL: settingsStore.serverURL, apiKey: settingsStore.apiKey)
    }

    private func mimeTypeForURL(_ url: URL) -> String {
        if let utType = UTType(filenameExtension: url.pathExtension), let mime = utType.preferredMIMEType {
            return mime
        }
        return "application/octet-stream"
    }
}

// MARK: - File Preview Sheet

/// Wraps the file preview in a NavigationStack with Done and Share buttons.
private struct FilePreviewSheet: View {
    let fileURL: URL
    let file: HolocronFile?
    let settingsStore: SettingsStore
    let onDismiss: () -> Void
    @State private var shareItems: [Any]?
    @State private var showShare = false
    @State private var isSharing = false

    var body: some View {
        NavigationStack {
            FilePreviewView(fileURL: fileURL)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Done") { onDismiss() }
                    }
                    ToolbarItem(placement: .navigationBarTrailing) {
                        if isSharing {
                            ProgressView()
                        } else {
                            Button {
                                guard let file else { return }
                                Task { await share(file) }
                            } label: {
                                Image(systemName: "square.and.arrow.up")
                            }
                        }
                    }
                }
                .sheet(isPresented: $showShare) {
                    if let shareItems {
                        ShareSheetView(items: shareItems)
                    }
                }
        }
    }

    private func share(_ file: HolocronFile) async {
        isSharing = true
        defer { isSharing = false }
        do {
            let client = APIClient(serverURL: settingsStore.serverURL, apiKey: settingsStore.apiKey)
            let response = try await client.createShareLink(fileId: file.id)
            let baseURL = settingsStore.serverURL.hasSuffix("/")
                ? settingsStore.serverURL
                : settingsStore.serverURL + "/"
            let sharePath = response.url.hasPrefix("/") ? String(response.url.dropFirst()) : response.url
            if let url = URL(string: baseURL + sharePath) {
                shareItems = [url]
                showShare = true
            }
        } catch {
            // silently fail in preview
        }
    }
}

// MARK: - Share Sheet

/// Minimal UIActivityViewController wrapper for sharing URLs.
struct ShareSheetView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Folder Content View

/// Displays folder contents with full file-operation support (swipe actions, context menus, upload).
struct FolderContentView: View {
    let folderName: String
    let nodes: [FileNode]
    let currentPath: String
    let onView: (HolocronFile) async -> Void
    let onShare: (HolocronFile) async -> Void
    let onDelete: (HolocronFile) -> Void
    let onRename: (HolocronFile) -> Void
    let onUpload: (URL, String) async -> Void
    @Binding var isUploading: Bool
    @EnvironmentObject var settingsStore: SettingsStore
    @State private var showDocumentPicker = false
    @State private var isDownloading = false

    var body: some View {
        List {
            ForEach(nodes) { node in
                switch node {
                case .folder(let name, let children):
                    NavigationLink {
                        FolderContentView(
                            folderName: name,
                            nodes: children,
                            currentPath: "\(currentPath)/\(name)",
                            onView: onView,
                            onShare: onShare,
                            onDelete: onDelete,
                            onRename: onRename,
                            onUpload: onUpload,
                            isUploading: $isUploading
                        )
                        .environmentObject(settingsStore)
                    } label: {
                        Label(name, systemImage: "folder.fill")
                    }
                case .file(let holocronFile):
                    folderFileRow(for: holocronFile)
                }
            }
        }
        .overlay {
            if isDownloading {
                ProgressView("Opening file…")
                    .padding()
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .navigationTitle(folderName)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if isUploading {
                    ProgressView()
                } else {
                    Button {
                        showDocumentPicker = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .sheet(isPresented: $showDocumentPicker) {
            DocumentPickerView { url in
                Task { await onUpload(url, currentPath) }
            }
        }
    }

    private func folderFileRow(for file: HolocronFile) -> some View {
        Button {
            Task {
                isDownloading = true
                defer { isDownloading = false }
                await onView(file)
            }
        } label: {
            FileRowView(file: file)
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) { onDelete(file) } label: {
                    Label("Delete", systemImage: "trash")
                }
                Button { onRename(file) } label: {
                    Label("Rename", systemImage: "pencil")
                }
                .tint(.orange)
            }
            .contextMenu {
                Button { Task { await onView(file) } } label: {
                    Label("View", systemImage: "eye")
                }
                Button { Task { await onShare(file) } } label: {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                Divider()
                Button { onRename(file) } label: {
                    Label("Rename", systemImage: "pencil")
                }
                Button(role: .destructive) { onDelete(file) } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
    }
}

// MARK: - Legacy Folder View (kept for compatibility)

/// Displays the contents of a virtual folder (minimal version without file actions).
struct FolderView: View {
    let folderName: String
    let nodes: [FileNode]
    @EnvironmentObject var settingsStore: SettingsStore

    var body: some View {
        List {
            ForEach(nodes) { node in
                switch node {
                case .folder(let name, let children):
                    NavigationLink {
                        FolderView(folderName: name, nodes: children)
                            .environmentObject(settingsStore)
                    } label: {
                        Label(name, systemImage: "folder.fill")
                    }
                case .file(let holocronFile):
                    FileRowView(file: holocronFile)
                }
            }
        }
        .navigationTitle(folderName)
    }
}

#Preview {
    FileBrowserView()
        .environmentObject(SettingsStore(serverURL: "http://localhost:3000", apiKey: "test"))
}

