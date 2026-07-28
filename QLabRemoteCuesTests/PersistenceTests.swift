import XCTest
@testable import QLabRemoteCues

final class PersistenceTests: XCTestCase {
    func testPanelRoundTrip() {
        let suite = "PersistenceTests-\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsPersistence(defaults: defaults)
        let expected = [ControlPanel(name: "Función", columns: 4)]
        store.savePanels(expected)
        XCTAssertEqual(store.loadPanels(), expected)
    }

    func testProfileRoundTrip() {
        let suite = "ProfileTests-\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsPersistence(defaults: defaults)
        let expected = [ConnectionProfile(name: "Mac FOH", host: "192.168.1.10", workspace: "show")]
        store.saveProfiles(expected)
        XCTAssertEqual(store.loadProfiles(), expected)
    }

    func testDemoRoundTripPreservesSequence() {
        let suite = "DemoTests-\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsPersistence(defaults: defaults)
        var demo = Demo(name: "Tracking")
        demo.preparation = [
            DemoStep(kind: .osc, title: "Reset", value: "/panic", order: 0),
            DemoStep(kind: .wait, title: "Espera", delaySeconds: 0.5, order: 1)
        ]
        demo.launch = [DemoStep(kind: .osc, title: "GO", value: "/go")]
        store.saveDemos([demo])
        XCTAssertEqual(store.loadDemos(), [demo])
    }
}
