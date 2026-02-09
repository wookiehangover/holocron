// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "Holocron",
    platforms: [.macOS(.v14)],
    targets: [
        // Core logic — importable by tests
        .target(
            name: "HolocronLib",
            path: "Sources/HolocronLib"
        ),
        // Thin executable — just launches the app
        .executableTarget(
            name: "Holocron",
            dependencies: ["HolocronLib"],
            path: "Sources/Holocron",
            exclude: ["Info.plist"]
        ),
        // Tests
        .testTarget(
            name: "HolocronTests",
            dependencies: ["HolocronLib"],
            path: "Tests/HolocronTests"
        ),
    ]
)

