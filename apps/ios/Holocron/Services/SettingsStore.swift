import Foundation
import Combine
import os

/// Observable settings store that persists server configuration.
/// Tasks 2 and 3 will flesh out persistence (Keychain for API key, UserDefaults for URL).
final class SettingsStore: ObservableObject {
    private static let logger = Logger(subsystem: "com.sambreed.Holocron.iOS", category: "settings")

    // MARK: - Published Properties

    @Published var serverURL: String {
        didSet { Self.logger.info("Server URL updated") }
    }

    @Published var apiKey: String {
        didSet { Self.logger.info("API key updated") }
    }

    /// Returns `true` when both server URL and API key have been configured.
    var isConfigured: Bool {
        let url = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        return !url.isEmpty && !key.isEmpty
    }

    // MARK: - Initialization

    init(serverURL: String = "", apiKey: String = "") {
        self.serverURL = serverURL
        self.apiKey = apiKey
    }
}

