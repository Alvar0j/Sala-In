import XCTest

@MainActor
final class QLabRemoteCuesUITests: XCTestCase {
    func testAppLaunchesAndShowsConnection() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["Demos"].waitForExistence(timeout: 3))
    }
}
