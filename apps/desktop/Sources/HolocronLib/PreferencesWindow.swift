import AppKit
import os

/// A simple preferences window for configuring vault path and API key.
public final class PreferencesWindow: NSWindowController {
    private static let logger = Logger(subsystem: "com.sambreed.Holocron", category: "preferences")

    /// Posted after preferences are saved so other components can react.
    public static let didSaveNotification = Notification.Name("HolocronPreferencesDidSave")

    private var vaultPathField: NSTextField!
    private var apiKeyField: NSSecureTextField!

    public convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 480, height: 200),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Holocron Preferences"
        window.center()
        window.isReleasedWhenClosed = false

        self.init(window: window)
        setupUI()
        loadCurrentValues()
    }

    private func setupUI() {
        guard let window = self.window else { return }

        let contentView = NSView(frame: window.contentView!.bounds)
        contentView.autoresizingMask = [.width, .height]
        window.contentView = contentView

        let margin: CGFloat = 20
        let labelWidth: CGFloat = 90
        let fieldHeight: CGFloat = 24
        let rowSpacing: CGFloat = 16

        // --- Vault Path ---
        let vaultLabel = NSTextField(labelWithString: "Vault Path:")
        vaultLabel.frame = NSRect(x: margin, y: 140, width: labelWidth, height: fieldHeight)
        vaultLabel.alignment = .right
        contentView.addSubview(vaultLabel)

        vaultPathField = NSTextField()
        vaultPathField.frame = NSRect(
            x: margin + labelWidth + 8, y: 140,
            width: 340, height: fieldHeight
        )
        vaultPathField.placeholderString = FileWatcher.fallbackVaultPath
        contentView.addSubview(vaultPathField)

        // --- API Key ---
        let apiLabel = NSTextField(labelWithString: "API Key:")
        apiLabel.frame = NSRect(x: margin, y: 140 - fieldHeight - rowSpacing, width: labelWidth, height: fieldHeight)
        apiLabel.alignment = .right
        contentView.addSubview(apiLabel)

        apiKeyField = NSSecureTextField()
        apiKeyField.frame = NSRect(
            x: margin + labelWidth + 8, y: 140 - fieldHeight - rowSpacing,
            width: 340, height: fieldHeight
        )
        apiKeyField.placeholderString = "Enter API key"
        contentView.addSubview(apiKeyField)

        // --- Buttons ---
        let saveButton = NSButton(title: "Save", target: self, action: #selector(savePreferences))
        saveButton.bezelStyle = .rounded
        saveButton.keyEquivalent = "\r"
        saveButton.frame = NSRect(x: 380, y: margin, width: 80, height: 32)
        contentView.addSubview(saveButton)

        let cancelButton = NSButton(title: "Cancel", target: self, action: #selector(cancelPreferences))
        cancelButton.bezelStyle = .rounded
        cancelButton.keyEquivalent = "\u{1b}"
        cancelButton.frame = NSRect(x: 290, y: margin, width: 80, height: 32)
        contentView.addSubview(cancelButton)
    }

    private func loadCurrentValues() {
        // Load vault path from UserDefaults, falling back to the default
        let savedPath = FileWatcher.defaultVaultPath
        vaultPathField.stringValue = savedPath

        // Load API key from Keychain
        if let existingKey = APIClient.loadApiKey(), !existingKey.isEmpty {
            apiKeyField.placeholderString = "••••••••  (saved in Keychain)"
        }
    }

    @objc private func savePreferences() {
        let vaultPath = vaultPathField.stringValue.trimmingCharacters(in: .whitespaces)
        if !vaultPath.isEmpty {
            UserDefaults.standard.set(vaultPath, forKey: FileWatcher.vaultPathKey)
            Self.logger.info("Vault path updated to: \(vaultPath, privacy: .public)")
        }

        let apiKey = apiKeyField.stringValue.trimmingCharacters(in: .whitespaces)
        if !apiKey.isEmpty {
            APIClient.saveApiKey(apiKey)
            Self.logger.info("API key saved to Keychain")
        }

        NotificationCenter.default.post(name: Self.didSaveNotification, object: nil)

        self.window?.close()
        restoreMenuBar()
    }

    @objc private func cancelPreferences() {
        self.window?.close()
        restoreMenuBar()
    }

    private var previousMainMenu: NSMenu?

    public func showWindow() {
        // Temporarily become a regular app so the window can receive focus
        NSApp.setActivationPolicy(.regular)

        // Install a basic main menu with Edit so ⌘V/⌘C/⌘X/⌘A work in text fields
        previousMainMenu = NSApp.mainMenu
        NSApp.mainMenu = Self.buildEditMenu()

        self.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func restoreMenuBar() {
        NSApp.mainMenu = previousMainMenu
        previousMainMenu = nil
        NSApp.setActivationPolicy(.accessory)
    }

    /// Builds a minimal main menu containing an Edit menu with standard text actions.
    private static func buildEditMenu() -> NSMenu {
        let mainMenu = NSMenu()

        let editMenuItem = NSMenuItem()
        editMenuItem.submenu = {
            let menu = NSMenu(title: "Edit")
            menu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
            menu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
            menu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
            menu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
            return menu
        }()
        mainMenu.addItem(editMenuItem)

        return mainMenu
    }
}

