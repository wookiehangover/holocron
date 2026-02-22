import SwiftUI

/// Main file browser view with virtual folder navigation.
struct FileBrowserView: View {
    @EnvironmentObject var settingsStore: SettingsStore
    @State private var nodes: [FileNode] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

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
                    fileListView(nodes: nodes)
                }
            }
            .navigationTitle("Files")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Image(systemName: "gear")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        // Upload placeholder
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .task {
                await loadFiles()
            }
        }
    }

    // MARK: - Subviews

    private func fileListView(nodes: [FileNode]) -> some View {
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
        .refreshable {
            await loadFiles()
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

    // MARK: - Data Loading

    private func loadFiles() async {
        isLoading = true
        errorMessage = nil
        do {
            let client = APIClient(
                serverURL: settingsStore.serverURL,
                apiKey: settingsStore.apiKey
            )
            let files = try await client.listFiles()
            nodes = FileNode.buildTree(from: files)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Folder Subview

/// Displays the contents of a virtual folder.
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

