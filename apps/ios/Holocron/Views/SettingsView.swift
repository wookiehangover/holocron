import SwiftUI

/// Settings screen for configuring server URL and API key.
struct SettingsView: View {
    @EnvironmentObject var settingsStore: SettingsStore

    var body: some View {
        NavigationStack {
            Form {
                Section("Server Configuration") {
                    TextField("Server URL", text: $settingsStore.serverURL)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .autocapitalization(.none)

                    SecureField("API Key", text: $settingsStore.apiKey)
                        .textContentType(.password)
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(SettingsStore())
}

