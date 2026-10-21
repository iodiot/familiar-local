// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "AppleFMChat",
    platforms: [.macOS(.v26)],
    products: [.executable(name: "apple-fm-chat", targets: ["AppleFMChat"])],
    targets: [
        .executableTarget(
            name: "AppleFMChat",
            resources: [.copy("web")]
        )
    ]
)
