import Foundation
import SwiftUI

@MainActor
final class AppViewModel: ObservableObject {
    @Published var profiles: [ConnectionProfile]
    @Published var panels: [ControlPanel]
    @Published var demos: [Demo]
    @Published var constellationButtons: [DemoLiveControl]
    @Published var selectedProfileID: UUID?
    @Published var showMode = false
    @Published var keepAwake = false {
        didSet { UIApplication.shared.isIdleTimerDisabled = keepAwake }
    }
    @Published var lastError: String?

    let qlab: QLabService
    let demoRunner: DemoRunner
    let discovery = BonjourDiscoveryService()
    private let persistence: SettingsPersisting

    init(persistence: SettingsPersisting = UserDefaultsPersistence(), qlab: QLabService = QLabService()) {
        self.persistence = persistence
        self.qlab = qlab
        self.demoRunner = DemoRunner(qlab: qlab)
        profiles = persistence.loadProfiles()
        panels = persistence.loadPanels()
        demos = persistence.loadDemos()
        constellationButtons = persistence.loadConstellationButtons()
        removeErroneousStandardDemoControlsIfNeeded()
        selectedProfileID = profiles.first?.id
    }

    var selectedProfile: ConnectionProfile? {
        get { profiles.first { $0.id == selectedProfileID } }
        set { selectedProfileID = newValue?.id }
    }

    func start() async { discovery.start() }

    func save(profile: ConnectionProfile, passcode: String) {
        if let index = profiles.firstIndex(where: { $0.id == profile.id }) { profiles[index] = profile }
        else { profiles.append(profile) }
        selectedProfileID = profile.id
        persistence.saveProfiles(profiles)
        do { try KeychainStore.save(passcode: passcode, profileID: profile.id) }
        catch { lastError = "No se pudo guardar el passcode: \(error.localizedDescription)" }
    }

    func connect() async {
        guard let profile = selectedProfile else { return }
        do { try await qlab.connect(profile: profile, passcode: KeychainStore.load(profileID: profile.id)) }
        catch { lastError = error.localizedDescription }
    }

    func execute(_ command: PanelCommand) {
        Task {
            do { try await qlab.execute(command); Haptics.success() }
            catch { lastError = error.localizedDescription; Haptics.error() }
        }
    }

    func savePanels() { persistence.savePanels(panels) }
    func saveDemos() {
        for index in demos.indices { demos[index].order = index }
        persistence.saveDemos(demos)
    }
    func saveConstellationButtons() {
        constellationButtons.sort { $0.order < $1.order }
        for index in constellationButtons.indices { constellationButtons[index].order = index }
        persistence.saveConstellationButtons(constellationButtons)
    }

    private func removeErroneousStandardDemoControlsIfNeeded() {
        let migrationKey = "didRemoveStandardDemoControlsV2"
        guard !UserDefaults.standard.bool(forKey: migrationKey) else { return }
        let generatedCommands: Set<String> = [
            "/go", "/stop", "/resume", "/pause", "/cue/check/start",
            "/reset", "/cue/cortinas/start", "/cue/configuracion/start"
        ]
        let generatedNames: Set<String> = [
            "play", "stop", "reanudar", "pause", "check", "reset", "cortinas", "configuración"
        ]
        for demoIndex in demos.indices {
            demos[demoIndex].liveControls.removeAll {
                generatedNames.contains($0.title.lowercased()) &&
                generatedCommands.contains($0.oscAddress)
            }
            for index in demos[demoIndex].liveControls.indices {
                demos[demoIndex].liveControls[index].order = index
            }
        }
        persistence.saveDemos(demos)
        UserDefaults.standard.set(true, forKey: migrationKey)
    }

    func exportPanel(_ panel: ControlPanel) -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(panel.name).qlabpanel.json")
        do {
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(panel).write(to: url, options: .atomic)
            return url
        } catch { lastError = error.localizedDescription; return nil }
    }

    func exportConfiguration() -> URL? {
        let package = AppConfigurationPackage(
            profiles: profiles,
            panels: panels,
            demos: demos,
            constellationButtons: constellationButtons,
            powerOnCommand: UserDefaults.standard.string(forKey: "roomPowerOnOSCCommand"),
            powerOffCommand: UserDefaults.standard.string(forKey: "roomPowerOffOSCCommand")
        )
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("QLab-Remote-Cues.qlabremote.json")
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            try encoder.encode(package).write(to: url, options: .atomic)
            return url
        } catch {
            lastError = "No se pudo exportar: \(error.localizedDescription)"
            return nil
        }
    }

    func importConfiguration(from url: URL) {
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            if let package = try? decoder.decode(AppConfigurationPackage.self, from: data),
               package.format == "QLabRemoteCues" {
                profiles = package.profiles
                panels = package.panels
                demos = package.demos
                constellationButtons = package.constellationButtons ?? []
                if let command = package.powerOnCommand {
                    UserDefaults.standard.set(command, forKey: "roomPowerOnOSCCommand")
                }
                if let command = package.powerOffCommand {
                    UserDefaults.standard.set(command, forKey: "roomPowerOffOSCCommand")
                }
                selectedProfileID = profiles.first?.id
                persistence.saveProfiles(profiles)
                savePanels()
                saveDemos()
                saveConstellationButtons()
            } else if let demo = try? decoder.decode(Demo.self, from: data) {
                demos.append(demo)
                saveDemos()
            } else {
                panels.append(try decoder.decode(ControlPanel.self, from: data))
                savePanels()
            }
        } catch { lastError = "Configuración no válida: \(error.localizedDescription)" }
    }

    func importPanels(from url: URL) {
        importConfiguration(from: url)
    }
}

enum Haptics {
    @MainActor static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    @MainActor static func error() { UINotificationFeedbackGenerator().notificationOccurred(.error) }
}
