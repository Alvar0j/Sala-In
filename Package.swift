// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "QLabRemoteCuesTools",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "MockQLabServer", targets: ["MockQLabServer"])],
    targets: [.executableTarget(name: "MockQLabServer", path: "Tools/MockQLabServer")]
)
