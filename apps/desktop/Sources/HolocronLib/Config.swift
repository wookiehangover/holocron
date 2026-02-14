import Foundation
import os

/// Manages app configuration stored at ~/.config/holocron/config.json.
public struct Config: Codable {
    private static let logger = Logger(subsystem: "com.sambreed.Holocron", category: "config")

    public var apiURL: String?
    public var vaultPath: String?
    public var apiKey: String?

    // MARK: - Defaults

    public static let defaultAPIURL = "http://localhost:3000"

    public static var defaultVaultPath: String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/Holocron"
    }

    // MARK: - Resolved values

    /// API URL from config, falling back to localhost.
    public var resolvedAPIURL: String {
        let value = apiURL?.trimmingCharacters(in: .whitespaces) ?? ""
        return value.isEmpty ? Self.defaultAPIURL : value
    }

    /// Vault path from config, falling back to ~/Holocron.
    public var resolvedVaultPath: String {
        let value = vaultPath?.trimmingCharacters(in: .whitespaces) ?? ""
        return value.isEmpty ? Self.defaultVaultPath : value
    }

    /// API key from config, falling back to empty string.
    public var resolvedAPIKey: String {
        apiKey ?? ""
    }

    // MARK: - File I/O

    private static var configDir: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config/holocron")
    }

    private static var configFile: URL {
        configDir.appendingPathComponent("config.json")
    }

    /// Load config from disk. Returns default config if file doesn't exist.
    public static func load() -> Config {
        let path = configFile.path
        guard FileManager.default.fileExists(atPath: path) else {
            logger.info("No config file at \(path, privacy: .public), using defaults")
            return Config()
        }

        do {
            let data = try Data(contentsOf: configFile)
            let config = try JSONDecoder().decode(Config.self, from: data)
            logger.info("Config loaded from \(path, privacy: .public)")
            return config
        } catch {
            logger.error("Failed to load config: \(error.localizedDescription, privacy: .public)")
            return Config()
        }
    }

    /// Save config to disk, creating the directory if needed.
    public func save() {
        do {
            if !FileManager.default.fileExists(atPath: Self.configDir.path) {
                try FileManager.default.createDirectory(
                    at: Self.configDir, withIntermediateDirectories: true
                )
            }

            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(self)
            try data.write(to: Self.configFile, options: .atomic)
            Self.logger.info("Config saved to \(Self.configFile.path, privacy: .public)")
        } catch {
            Self.logger.error("Failed to save config: \(error.localizedDescription, privacy: .public)")
        }
    }
}

