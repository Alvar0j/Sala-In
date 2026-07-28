import XCTest
@testable import QLabRemoteCues

actor MockTransport: OSCTransporting {
    private(set) var sent: [OSCMessage] = []
    func start(host: String, port: UInt16, localPort: UInt16) async throws {}
    func send(_ message: OSCMessage) async throws { sent.append(message) }
    func messages() async -> AsyncStream<OSCTransportEvent> { AsyncStream { _ in } }
    func stop() async {}
}

@MainActor
final class QLabServiceTests: XCTestCase {
    func testConnectAndGoUseCentralRoutes() async throws {
        let transport = MockTransport()
        let service = QLabService(transport: transport)
        let profile = ConnectionProfile(name: "Test", host: "127.0.0.1", workspace: "SHOW")
        try await service.connect(profile: profile, passcode: "secret")
        try await service.execute(.go)
        let sent = await transport.sent
        XCTAssertTrue(sent.contains { $0.address == "/workspace/SHOW/connect" && $0.arguments == [.string("secret")] })
        XCTAssertEqual(sent.last?.address, "/workspace/SHOW/go")
    }

    func testInvalidCustomPath() async throws {
        let service = QLabService(transport: MockTransport())
        try await service.connect(profile: ConnectionProfile(name: "T", host: "localhost", workspace: "W"), passcode: "")
        do {
            try await service.execute(.custom("panic"))
            XCTFail("Should reject invalid path")
        } catch {}
    }
}
