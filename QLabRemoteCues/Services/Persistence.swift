import Foundation
import Security

protocol SettingsPersisting {
    func loadProfiles() -> [ConnectionProfile]
    func saveProfiles(_ profiles: [ConnectionProfile])
    func loadPanels() -> [ControlPanel]
    func savePanels(_ panels: [ControlPanel])
    func loadDemos() -> [Demo]
    func saveDemos(_ demos: [Demo])
    func loadConstellationButtons() -> [DemoLiveControl]
    func saveConstellationButtons(_ buttons: [DemoLiveControl])
}

struct UserDefaultsPersistence: SettingsPersisting {
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func loadProfiles() -> [ConnectionProfile] { decode("profiles") ?? [] }
    func saveProfiles(_ profiles: [ConnectionProfile]) { encode(profiles, key: "profiles") }
    func loadPanels() -> [ControlPanel] { decode("panels") ?? [ControlPanel()] }
    func savePanels(_ panels: [ControlPanel]) { encode(panels, key: "panels") }
    func loadDemos() -> [Demo] { decode("demos") ?? [] }
    func saveDemos(_ demos: [Demo]) { encode(demos, key: "demos") }
    func loadConstellationButtons() -> [DemoLiveControl] { decode("constellationButtons") ?? [] }
    func saveConstellationButtons(_ buttons: [DemoLiveControl]) { encode(buttons, key: "constellationButtons") }

    private func decode<T: Decodable>(_ key: String) -> T? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(T.self, from: $0) }
    }
    private func encode<T: Encodable>(_ value: T, key: String) {
        defaults.set(try? JSONEncoder().encode(value), forKey: key)
    }
}

enum KeychainStore {
    static func save(passcode: String, profileID: UUID) throws {
        let account = profileID.uuidString
        SecItemDelete(query(account) as CFDictionary)
        guard !passcode.isEmpty else { return }
        var item = query(account)
        item[kSecValueData as String] = Data(passcode.utf8)
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }

    static func load(profileID: UUID) -> String {
        var item = query(profileID.uuidString)
        item[kSecReturnData as String] = true
        item[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(item as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return "" }
        return String(decoding: data, as: UTF8.self)
    }

    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.qlabremotecues.passcode",
         kSecAttrAccount as String: account]
    }
}
