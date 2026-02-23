import AppKit
import os
import ServiceManagement

/// A simple preferences window for configuring vault path and API key.
public final class PreferencesWindow: NSWindowController {
    private static let logger = Logger(subsystem: "com.sambreed.Holocron", category: "preferences")

    /// Posted after preferences are saved so other components can react.
    public static let didSaveNotification = Notification.Name("HolocronPreferencesDidSave")

    private var apiURLField: NSTextField!
    private var vaultPathField: NSTextField!
    private var apiKeyField: NSSecureTextField!
    private var launchAtLoginCheckbox: NSButton!

    public convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 480, height: 280),
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

        let row1Y: CGFloat = 220
        let row2Y: CGFloat = row1Y - fieldHeight - rowSpacing
        let row3Y: CGFloat = row2Y - fieldHeight - rowSpacing
        let row4Y: CGFloat = row3Y - fieldHeight - rowSpacing
        let fieldX: CGFloat = margin + labelWidth + 8
        let fieldWidth: CGFloat = 340

        // --- API URL ---
        let urlLabel = NSTextField(labelWithString: "API URL:")
        urlLabel.frame = NSRect(x: margin, y: row1Y, width: labelWidth, height: fieldHeight)
        urlLabel.alignment = .right
        contentView.addSubview(urlLabel)

        apiURLField = NSTextField()
        apiURLField.frame = NSRect(x: fieldX, y: row1Y, width: fieldWidth, height: fieldHeight)
        apiURLField.placeholderString = Config.defaultAPIURL
        contentView.addSubview(apiURLField)

        // --- Vault Path ---
        let vaultLabel = NSTextField(labelWithString: "Vault Path:")
        vaultLabel.frame = NSRect(x: margin, y: row2Y, width: labelWidth, height: fieldHeight)
        vaultLabel.alignment = .right
        contentView.addSubview(vaultLabel)

        vaultPathField = NSTextField()
        vaultPathField.frame = NSRect(x: fieldX, y: row2Y, width: fieldWidth, height: fieldHeight)
        vaultPathField.placeholderString = Config.defaultVaultPath
        contentView.addSubview(vaultPathField)

        // --- API Key ---
        let apiLabel = NSTextField(labelWithString: "API Key:")
        apiLabel.frame = NSRect(x: margin, y: row3Y, width: labelWidth, height: fieldHeight)
        apiLabel.alignment = .right
        contentView.addSubview(apiLabel)

        apiKeyField = NSSecureTextField()
        apiKeyField.frame = NSRect(x: fieldX, y: row3Y, width: fieldWidth, height: fieldHeight)
        apiKeyField.placeholderString = "Enter API key"
        contentView.addSubview(apiKeyField)

        // --- Launch at Login ---
        launchAtLoginCheckbox = NSButton(checkboxWithTitle: "Launch at Login", target: nil, action: nil)
        launchAtLoginCheckbox.frame = NSRect(x: fieldX, y: row4Y, width: fieldWidth, height: fieldHeight)
        contentView.addSubview(launchAtLoginCheckbox)

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
        let config = Config.load()
        apiURLField.stringValue = config.resolvedAPIURL
        vaultPathField.stringValue = config.resolvedVaultPath

        if !config.resolvedAPIKey.isEmpty {
            apiKeyField.placeholderString = "••••••••  (saved)"
        }

        // Prefer the live system status over the saved config value so the
        // checkbox reflects changes made in System Settings.
        let isEnabled = SMAppService.mainApp.status == .enabled
        launchAtLoginCheckbox.state = isEnabled ? .on : .off
    }

    @objc private func savePreferences() {
        var config = Config.load()

        let apiURL = apiURLField.stringValue.trimmingCharacters(in: .whitespaces)
        if !apiURL.isEmpty {
            config.apiURL = apiURL
        }

        let vaultPath = vaultPathField.stringValue.trimmingCharacters(in: .whitespaces)
        if !vaultPath.isEmpty {
            config.vaultPath = vaultPath
        }

        let apiKey = apiKeyField.stringValue.trimmingCharacters(in: .whitespaces)
        if !apiKey.isEmpty {
            config.apiKey = apiKey
        }

        let wantsLaunchAtLogin = launchAtLoginCheckbox.state == .on
        config.launchAtLogin = wantsLaunchAtLogin

        config.save()
        Self.logger.info("Preferences saved to config file")

        // Register / unregister the login item
        let service = SMAppService.mainApp
        do {
            if wantsLaunchAtLogin {
                try service.register()
                Self.logger.info("Login item registered")
            } else {
                try service.unregister()
                Self.logger.info("Login item unregistered")
            }
        } catch {
            Self.logger.error("Failed to update login item: \(error.localizedDescription, privacy: .public)")
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

