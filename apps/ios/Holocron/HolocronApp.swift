import SwiftUI

@main
struct HolocronApp: App {
    @StateObject private var settingsStore = SettingsStore()

    var body: some Scene {
        WindowGroup {
            if settingsStore.isConfigured {
                FileBrowserView()
                    .environmentObject(settingsStore)
            } else {
                SettingsView()
                    .environmentObject(settingsStore)
            }
        }
    }
}

