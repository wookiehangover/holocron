import CoreServices
import Foundation
import os

/// Watches the vault directory for filesystem changes using FSEvents,
/// with debouncing to coalesce rapid bursts of changes.
public final class FileWatcher {
    private static let logger = Logger(subsystem: "com.sambreed.Holocron", category: "watcher")

    /// UserDefaults key for the configured vault path.
    public static let vaultPathKey = "vaultPath"

    /// Hardcoded fallback when no custom path is configured.
    public static let fallbackVaultPath: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/Holocron"
    }()

    /// Resolved vault path — reads from UserDefaults, falls back to ~/Holocron.
    public static var defaultVaultPath: String {
        UserDefaults.standard.string(forKey: vaultPathKey) ?? fallbackVaultPath
    }

    private let watchPath: String
    private var fsEventStream: FSEventStreamRef?
    private let onChange: () -> Void

    /// How long to wait after an FS event before firing the callback.
    /// Coalesces rapid bursts of changes.
    private let debounceInterval: TimeInterval
    private var debounceWorkItem: DispatchWorkItem?

    public init(
        watchPath: String,
        debounceInterval: TimeInterval = 2.0,
        onChange: @escaping () -> Void
    ) {
        self.watchPath = watchPath
        self.debounceInterval = debounceInterval
        self.onChange = onChange
    }

    deinit {
        stop()
    }

    // MARK: - Public

    public func start() {
        Self.logger.info("FileWatcher starting for path: \(self.watchPath, privacy: .public)")
        startFSEvents()
    }

    public func stop() {
        Self.logger.info("FileWatcher stopping")
        stopFSEvents()
    }

    /// Determines whether a set of changed paths contains at least one
    /// relevant vault content change (i.e. not inside hidden directories
    /// like .git/ or .obsidian/).
    /// Exposed as a static function for testability.
    public static func hasRelevantChange(in paths: [String]) -> Bool {
        paths.contains { path in
            // Ignore changes inside hidden directories (e.g. .git/, .obsidian/)
            // but allow hidden files at the leaf (e.g. .gitignore)
            let components = path.split(separator: "/")
            guard components.count > 1 else { return true }
            // Check only intermediate directory components, not the leaf filename
            let directories = components.dropLast()
            return !directories.contains { component in
                component.hasPrefix(".") && component.count > 1
            }
        }
    }

    // MARK: - FSEvents

    private func startFSEvents() {
        let paths = [watchPath] as CFArray

        var context = FSEventStreamContext()
        context.info = Unmanaged.passUnretained(self).toOpaque()

        let flags: FSEventStreamCreateFlags =
            UInt32(kFSEventStreamCreateFlagUseCFTypes)
            | UInt32(kFSEventStreamCreateFlagFileEvents)
            | UInt32(kFSEventStreamCreateFlagIgnoreSelf)

        guard
            let stream = FSEventStreamCreate(
                nil,
                fsEventsCallback,
                &context,
                paths,
                FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
                1.0,
                flags
            )
        else { return }

        fsEventStream = stream
        FSEventStreamSetDispatchQueue(stream, DispatchQueue.global(qos: .utility))
        FSEventStreamStart(stream)
    }

    private func stopFSEvents() {
        guard let stream = fsEventStream else { return }
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
        fsEventStream = nil
    }

    /// Called by FSEvents on every file change in the vault.
    fileprivate func handleFSEvent(paths: [String]) {
        let relevant = FileWatcher.hasRelevantChange(in: paths)
        Self.logger.debug(
            "FSEvent: \(paths.count, privacy: .public) paths changed, relevant: \(relevant, privacy: .public)"
        )
        guard relevant else { return }

        debounceWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.onChange()
        }
        debounceWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + debounceInterval, execute: work)
    }
}

// MARK: - FSEvents C callback

private func fsEventsCallback(
    streamRef: ConstFSEventStreamRef,
    clientCallBackInfo: UnsafeMutableRawPointer?,
    numEvents: Int,
    eventPaths: UnsafeMutableRawPointer,
    eventFlags: UnsafePointer<FSEventStreamEventFlags>,
    eventIds: UnsafePointer<FSEventStreamEventId>
) {
    guard let info = clientCallBackInfo else { return }
    let watcher = Unmanaged<FileWatcher>.fromOpaque(info).takeUnretainedValue()

    let cfPaths = Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue()
    var paths: [String] = []
    for i in 0..<numEvents {
        if let path = CFArrayGetValueAtIndex(cfPaths, i) {
            let cfStr = Unmanaged<CFString>.fromOpaque(path).takeUnretainedValue()
            paths.append(cfStr as String)
        }
    }

    watcher.handleFSEvent(paths: paths)
}

