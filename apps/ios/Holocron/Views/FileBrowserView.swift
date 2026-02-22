import SwiftUI

/// Placeholder file browser view — will be populated by Task 4.
struct FileBrowserView: View {
    @EnvironmentObject var settingsStore: SettingsStore

    var body: some View {
        NavigationStack {
            List {
                Text("Files will appear here")
                    .foregroundStyle(.secondary)
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
            }
        }
    }
}

#Preview {
    FileBrowserView()
        .environmentObject(SettingsStore())
}

