import SwiftUI

/// Settings screen for configuring server URL and API key.
struct SettingsView: View {
    @EnvironmentObject var settingsStore: SettingsStore

    @State private var isTesting = false
    @State private var testResult: TestResult?

    private enum TestResult {
        case success
        case failure(String)
    }

    /// Both fields must be non-empty to enable Save / Test.
    private var canSave: Bool {
        let url = settingsStore.serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = settingsStore.apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        return !url.isEmpty && !key.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Server URL", text: $settingsStore.serverURL)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)

                    SecureField("API Key", text: $settingsStore.apiKey)
                        .textContentType(.password)
                } header: {
                    Text("Server Configuration")
                } footer: {
                    Text("Enter the URL of your Holocron server and your API key.")
                }

                Section {
                    Button {
                        testConnection()
                    } label: {
                        HStack {
                            Text("Test Connection")
                            Spacer()
                            if isTesting {
                                ProgressView()
                            } else if let result = testResult {
                                switch result {
                                case .success:
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                case .failure:
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.red)
                                }
                            }
                        }
                    }
                    .disabled(!canSave || isTesting)

                    if case .failure(let message) = testResult {
                        Text(message)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button("Save") {
                        settingsStore.save()
                    }
                    .disabled(!canSave)
                    .frame(maxWidth: .infinity)
                    .fontWeight(.semibold)
                }
            }
            .navigationTitle("Settings")
        }
    }

    // MARK: - Connection Test

    private func testConnection() {
        isTesting = true
        testResult = nil

        Task {
            do {
                let client = APIClient(
                    serverURL: settingsStore.serverURL,
                    apiKey: settingsStore.apiKey
                )
                _ = try await client.health()
                testResult = .success
            } catch {
                testResult = .failure(error.localizedDescription)
            }
            isTesting = false
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(SettingsStore())
}

