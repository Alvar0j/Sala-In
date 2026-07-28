import Foundation
import SwiftUI

struct ConnectionProfile: Identifiable, Codable, Hashable, Sendable {
    var id = UUID()
    var name = "QLab"
    var host = ""
    var port: UInt16 = 53_000
    var workspace = ""
    var localReplyPort: UInt16 = 53_001

    var isValid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        !host.trimmingCharacters(in: .whitespaces).isEmpty &&
        port > 0 && localReplyPort > 0 &&
        !workspace.contains("/")
    }
}

enum ConnectionState: Equatable, Sendable {
    case disconnected, connecting, connected, reconnecting(attempt: Int), error(String)

    var label: String {
        switch self {
        case .disconnected: "Desconectado"
        case .connecting: "Conectando"
        case .connected: "Conectado"
        case .reconnecting(let attempt): "Reconectando (\(attempt))"
        case .error(let message): "Error: \(message)"
        }
    }
}

struct QLabCue: Identifiable, Codable, Hashable, Sendable {
    let id: String
    var number: String
    var name: String
    var type: String
    var colorName: String
    var armed: Bool
    var isRunning = false
    var isPaused = false
    var isActive = false
}

enum PanelCommand: Codable, Hashable, Sendable {
    case go, panic, stop, pause, resume, previous, next
    case cueStart(String), cueStop(String), cuePause(String), cueResume(String)
    case custom(String)
}

struct PanelButton: Identifiable, Codable, Hashable, Sendable {
    var id = UUID()
    var title = "GO"
    var command: PanelCommand = .go
    var colorHex = "#2ECC71"
    var symbol = "play.fill"
    var width = 1
    var height = 1
    var order = 0
    var requiresConfirmation = false
    var haptics = true
    var longPressCommand: PanelCommand?
}

struct ControlPanel: Identifiable, Codable, Hashable, Sendable {
    var id = UUID()
    var name = "Principal"
    var columns = 3
    var buttons: [PanelButton] = [
        PanelButton(title: "GO", command: .go, colorHex: "#2ECC71", symbol: "play.fill", width: 2),
        PanelButton(title: "STOP", command: .stop, colorHex: "#E67E22", symbol: "stop.fill", order: 1),
        PanelButton(title: "PANIC", command: .panic, colorHex: "#E74C3C", symbol: "exclamationmark.octagon.fill", order: 2, requiresConfirmation: true)
    ]
}

struct ActivityEntry: Identifiable, Sendable {
    let id = UUID()
    let date: Date
    let direction: String
    let message: String
    let result: String
}

struct DiscoveredQLab: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let endpointDescription: String
}
