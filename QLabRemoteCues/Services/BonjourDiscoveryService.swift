import Foundation
import Network

@MainActor
final class BonjourDiscoveryService: ObservableObject {
    static let serviceType = "_qlab._tcp"
    @Published private(set) var devices: [DiscoveredQLab] = []
    private var browser: NWBrowser?

    func start() {
        guard browser == nil else { return }
        let browser = NWBrowser(for: .bonjour(type: Self.serviceType, domain: nil), using: .tcp)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            Task { @MainActor in
                self?.devices = results.compactMap { result in
                    guard case .service(let name, _, _, _) = result.endpoint else { return nil }
                    return DiscoveredQLab(id: String(describing: result.endpoint), name: name,
                                          endpointDescription: String(describing: result.endpoint))
                }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            }
        }
        browser.start(queue: .global(qos: .utility))
        self.browser = browser
    }

    func stop() { browser?.cancel(); browser = nil }
}
