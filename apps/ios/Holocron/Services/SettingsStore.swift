import Foundation
import Combine
import Security
import os

/// Observable settings store that persists server configuration.
/// Server URL is stored in UserDefaults; API key is stored in the iOS Keychain.
@MainActor
final class SettingsStore: ObservableObject {
    private static let logger = Logger(subsystem: "com.sambreed.Holocron.iOS", category: "settings")

    // MARK: - Persistence Keys

    private static let serverURLKey = "holocron_server_url"
    private static let keychainService = "com.sambreed.Holocron.iOS"
    private static let keychainAccount = "holocron_api_key"

    // MARK: - Published Properties

    @Published var serverURL: String = ""
    @Published var apiKey: String = ""

    /// Returns `true` when both server URL and API key have been configured.
    var isConfigured: Bool {
        let url = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        return !url.isEmpty && !key.isEmpty
    }

    // MARK: - Initialization

    init() {
        load()
    }

    /// Test-only initializer with explicit values (does not persist).
    init(serverURL: String, apiKey: String) {
        self.serverURL = serverURL
        self.apiKey = apiKey
    }

    // MARK: - Persistence

    /// Persist server URL to UserDefaults and API key to Keychain.
    func save() {
        Self.logger.info("Saving settings")
        UserDefaults.standard.set(serverURL, forKey: Self.serverURLKey)
        saveAPIKeyToKeychain(apiKey)
        // Re-read to trigger @Published updates (ensures isConfigured refreshes)
        load()
    }

    /// Load persisted values from UserDefaults and Keychain.
    func load() {
        serverURL = UserDefaults.standard.string(forKey: Self.serverURLKey) ?? ""
        apiKey = loadAPIKeyFromKeychain() ?? ""
        Self.logger.info("Settings loaded, configured: \(self.isConfigured)")
    }

    // MARK: - Keychain Helpers

    private func saveAPIKeyToKeychain(_ key: String) {
        let data = Data(key.utf8)

        // Try to update existing item first
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: Self.keychainAccount,
        ]

        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]

        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)

        if updateStatus == errSecItemNotFound {
            // Item doesn't exist yet — add it
            var addQuery = query
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            if addStatus != errSecSuccess {
                Self.logger.error("Keychain add failed: \(addStatus)")
            }
        } else if updateStatus != errSecSuccess {
            Self.logger.error("Keychain update failed: \(updateStatus)")
        }
    }

    private func loadAPIKeyFromKeychain() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: Self.keychainAccount,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            if status != errSecItemNotFound {
                Self.logger.error("Keychain read failed: \(status)")
            }
            return nil
        }

        return String(data: data, encoding: .utf8)
    }
}

