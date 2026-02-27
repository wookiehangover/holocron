import SwiftUI

/// Search view with a search bar and results grouped by file with chunk previews.
struct SearchView: View {
    @EnvironmentObject var settingsStore: SettingsStore
    @State private var searchText = ""
    @State private var results: [SearchResult] = []
    @State private var isSearching = false
    @State private var errorMessage: String?
    @State private var hasSearched = false

    // File preview state
    @State private var selectedFile: HolocronFile?
    @State private var previewURL: URL?
    @State private var showPreview = false
    @State private var isDownloading = false

    var body: some View {
        NavigationStack {
            Group {
                if isSearching {
                    ProgressView("Searching…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let errorMessage {
                    errorStateView(message: errorMessage)
                } else if !hasSearched {
                    emptyStateView
                } else if results.isEmpty {
                    noResultsView
                } else {
                    resultsList
                }
            }
            .navigationTitle("Search")
            .searchable(text: $searchText, prompt: "Search your vault")
            .onSubmit(of: .search) {
                Task { await performSearch() }
            }
            .overlay {
                if isDownloading {
                    ProgressView("Opening file…")
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .fullScreenCover(isPresented: $showPreview) {
                if let previewURL {
                    SearchFilePreviewSheet(
                        fileURL: previewURL,
                        file: selectedFile,
                        settingsStore: settingsStore,
                        onDismiss: { showPreview = false }
                    )
                }
            }
        }
    }

    // MARK: - State Views

    private var emptyStateView: some View {
        ContentUnavailableView(
            "Search your vault",
            systemImage: "magnifyingglass",
            description: Text("Enter a query to search across all your files.")
        )
    }

    private var noResultsView: some View {
        ContentUnavailableView.search(text: searchText)
    }

    private func errorStateView(message: String) -> some View {
        ContentUnavailableView {
            Label("Search Failed", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Try Again") {
                Task { await performSearch() }
            }
        }
    }

    // MARK: - Results List

    private var resultsList: some View {
        List {
            ForEach(results, id: \.file.id) { result in
                Section {
                    ForEach(result.chunks.prefix(3), id: \.id) { chunk in
                        Button {
                            Task { await viewFile(result.file) }
                        } label: {
                            chunkRow(chunk)
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    resultHeader(result)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func resultHeader(_ result: SearchResult) -> some View {
        HStack(spacing: 6) {
            Text(result.file.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)

            Text(displayMimeType(result.file.mimeType))
                .font(.caption2)
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .background(.secondary.opacity(0.15), in: Capsule())

            Text(String(format: "%.0f/10", result.topScore))
                .font(.caption2)
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .background(.blue.opacity(0.12), in: Capsule())

            Spacer()

            if result.chunks.count > 0 {
                Text("\(result.chunks.count) \(result.chunks.count == 1 ? "match" : "matches")")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func chunkRow(_ chunk: SearchChunk) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(truncateText(chunk.text, maxLength: 200))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(4)

            if let page = chunk.page {
                Text("Page \(page)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Search

    private func performSearch() async {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return }
        isSearching = true
        errorMessage = nil
        do {
            let client = makeClient()
            let response = try await client.search(query: query)
            results = response.results
            hasSearched = true
        } catch {
            errorMessage = error.localizedDescription
        }
        isSearching = false
    }

    // MARK: - File Preview

    private func viewFile(_ file: SearchFile) async {
        isDownloading = true
        defer { isDownloading = false }
        do {
            let client = makeClient()
            let (serverFile, downloadURL) = try await client.getFile(id: file.id)
            // Check cache using the full file (which has checksum)
            if let cachedURL = FileCache.shared.cachedURL(for: serverFile) {
                selectedFile = serverFile
                previewURL = cachedURL
                showPreview = true
                return
            }
            let (data, _) = try await URLSession.shared.data(from: downloadURL)
            let localURL = try FileCache.shared.cache(data: data, for: serverFile)
            selectedFile = serverFile
            previewURL = localURL
            showPreview = true
        } catch {
            errorMessage = "Preview failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Helpers

    private func makeClient() -> APIClient {
        APIClient(serverURL: settingsStore.serverURL, apiKey: settingsStore.apiKey)
    }

    private func truncateText(_ text: String, maxLength: Int) -> String {
        let cleaned = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.count <= maxLength { return cleaned }
        return String(cleaned.prefix(maxLength)) + "…"
    }

    private func displayMimeType(_ mimeType: String) -> String {
        switch mimeType {
        case "application/pdf": return "PDF"
        case "text/plain": return "Text"
        case "text/markdown": return "Markdown"
        case let m where m.hasPrefix("image/"): return "Image"
        case let m where m.hasPrefix("video/"): return "Video"
        case let m where m.hasPrefix("audio/"): return "Audio"
        default:
            if let subtype = mimeType.split(separator: "/").last {
                return String(subtype).uppercased()
            }
            return mimeType
        }
    }
}

// MARK: - Search File Preview Sheet

/// Wraps the file preview in a NavigationStack with Done and Share buttons.
/// Mirrors the FilePreviewSheet pattern from FileBrowserView.
private struct SearchFilePreviewSheet: View {
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

#Preview {
    SearchView()
        .environmentObject(SettingsStore(serverURL: "http://localhost:3000", apiKey: "test"))
}

