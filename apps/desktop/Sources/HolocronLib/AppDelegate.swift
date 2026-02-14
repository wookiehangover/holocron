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
    private var preferencesWindow: PreferencesWindow?

    // SF Symbol names for menubar icon states
    private enum Icon {
        static let synced = "tray.fill"
        static let syncing = "tray.and.arrow.up.fill"
        static let error = "tray.full.fill"
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

        startServices()

        // Re-initialize services when preferences change
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(preferencesDidChange),
            name: PreferencesWindow.didSaveNotification,
            object: nil
        )
    }

    public func applicationWillTerminate(_ notification: Notification) {
        stopServices()
        logger.notice("Holocron terminated")
    }

    // MARK: - Service Lifecycle

    private func startServices() {
        let apiClient = APIClient()
        syncEngine = SyncEngine(apiClient: apiClient)

        let vaultPath = FileWatcher.defaultVaultPath
        fileWatcher = FileWatcher(
            watchPath: vaultPath,
            onChange: { [weak self] in
                self?.logger.info("Vault changed, scheduling sync")
                Task { await self?.syncEngine?.syncNow() }
            }
        )
        fileWatcher?.start()
        logger.info("Watching vault at: \(vaultPath, privacy: .public)")
    }

    private func stopServices() {
        fileWatcher?.stop()
        fileWatcher = nil
        syncEngine?.stop()
        syncEngine = nil
    }

    @objc private func preferencesDidChange() {
        logger.info("Preferences changed, restarting services")
        stopServices()
        startServices()
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

        Task {
            await syncEngine?.syncNow()
            await MainActor.run {
                syncNowMenuItem.isEnabled = true
                refreshStatus()
            }
        }
    }

    @objc private func openVaultFolder() {
        let path = FileWatcher.defaultVaultPath
        let vaultURL = URL(fileURLWithPath: path)

        // Create the vault directory if it doesn't exist yet
        if !FileManager.default.fileExists(atPath: path) {
            do {
                try FileManager.default.createDirectory(at: vaultURL, withIntermediateDirectories: true)
                logger.info("Created vault directory at \(path, privacy: .public)")
            } catch {
                logger.error("Failed to create vault directory: \(error.localizedDescription, privacy: .public)")
                return
            }
        }

        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: path)
    }

    @objc private func openPreferences() {
        if preferencesWindow == nil {
            preferencesWindow = PreferencesWindow()
        }
        preferencesWindow?.showWindow()
    }
}

