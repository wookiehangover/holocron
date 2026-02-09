import AppKit
import os

public class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let logger = Logger(subsystem: "com.sambreed.Holocron", category: "app")

    private var statusItem: NSStatusItem!
    private var menu: NSMenu!

    // Menu items updated dynamically
    private var statusMenuItem: NSMenuItem!
    private var syncNowMenuItem: NSMenuItem!

    // Core services
    private var syncEngine: SyncEngine?
    private var fileWatcher: FileWatcher?

    // SF Symbol names for menubar icon states
    private enum Icon {
        static let synced = "externaldrive.fill.badge.checkmark"
        static let syncing = "arrow.triangle.2.circlepath"
        static let error = "externaldrive.fill.badge.xmark"
    }

    // MARK: - Lifecycle

    public func applicationDidFinishLaunching(_ notification: Notification) {
        logger.notice("Holocron launched")

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(
                systemSymbolName: Icon.synced,
                accessibilityDescription: "Holocron"
            )
        }

        buildMenu()
        statusItem.menu = menu

        // Initialize sync engine
        syncEngine = SyncEngine()

        // Start watching the vault for changes
        let vaultPath = FileWatcher.defaultVaultPath
        fileWatcher = FileWatcher(
            watchPath: vaultPath,
            onChange: { [weak self] in
                self?.logger.info("Vault changed, scheduling sync")
                self?.syncEngine?.syncNow()
            }
        )
        fileWatcher?.start()

        logger.info("Watching vault at: \(vaultPath, privacy: .public)")
    }

    public func applicationWillTerminate(_ notification: Notification) {
        fileWatcher?.stop()
        syncEngine?.stop()
        logger.notice("Holocron terminated")
    }

    // MARK: - Menu Construction

    private func buildMenu() {
        menu = NSMenu()
        menu.delegate = self

        // App title (disabled, just a label)
        let titleItem = NSMenuItem(title: "Holocron", action: nil, keyEquivalent: "")
        titleItem.isEnabled = false
        if let font = NSFont.boldSystemFont(ofSize: 13) as NSFont? {
            titleItem.attributedTitle = NSAttributedString(
                string: "Holocron",
                attributes: [.font: font]
            )
        }
        menu.addItem(titleItem)
        menu.addItem(.separator())

        // Status display
        statusMenuItem = NSMenuItem(
            title: "Status: Idle", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)

        menu.addItem(.separator())

        // Sync Now
        syncNowMenuItem = NSMenuItem(
            title: "Sync Now",
            action: #selector(syncNowAction),
            keyEquivalent: "s"
        )
        syncNowMenuItem.keyEquivalentModifierMask = [.command]
        syncNowMenuItem.target = self
        menu.addItem(syncNowMenuItem)

        // Open Vault Folder
        let openVaultItem = NSMenuItem(
            title: "Open Vault Folder",
            action: #selector(openVaultFolder),
            keyEquivalent: "o"
        )
        openVaultItem.keyEquivalentModifierMask = [.command]
        openVaultItem.target = self
        menu.addItem(openVaultItem)

        // Preferences
        let prefsItem = NSMenuItem(
            title: "Preferences...",
            action: #selector(openPreferences),
            keyEquivalent: ","
        )
        prefsItem.keyEquivalentModifierMask = [.command]
        prefsItem.target = self
        menu.addItem(prefsItem)

        menu.addItem(.separator())

        // Quit
        let quitItem = NSMenuItem(
            title: "Quit Holocron",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        menu.addItem(quitItem)
    }

    // MARK: - NSMenuDelegate

    public func menuWillOpen(_ menu: NSMenu) {
        refreshStatus()
    }

    // MARK: - Status

    private func refreshStatus() {
        guard let engine = syncEngine else { return }
        let state = engine.state

        switch state {
        case .idle:
            statusMenuItem.title = "Status: Idle"
            setIcon(Icon.synced)
        case .syncing:
            statusMenuItem.title = "Status: Syncing..."
            setIcon(Icon.syncing)
        case .error(let message):
            statusMenuItem.title = "Status: Error — \(message)"
            setIcon(Icon.error)
        }
    }

    private func setIcon(_ symbolName: String) {
        statusItem.button?.image = NSImage(
            systemSymbolName: symbolName,
            accessibilityDescription: "Holocron"
        )
    }

    // MARK: - Actions

    @objc private func syncNowAction() {
        logger.info("Manual sync requested")
        statusMenuItem.title = "Status: Syncing..."
        setIcon(Icon.syncing)
        syncNowMenuItem.isEnabled = false

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.syncEngine?.syncNow()
            DispatchQueue.main.async {
                self?.syncNowMenuItem.isEnabled = true
                self?.refreshStatus()
            }
        }
    }

    @objc private func openVaultFolder() {
        let vaultURL = URL(fileURLWithPath: FileWatcher.defaultVaultPath)
        NSWorkspace.shared.open(vaultURL)
    }

    @objc private func openPreferences() {
        logger.info("Preferences requested (not yet implemented)")
    }
}

