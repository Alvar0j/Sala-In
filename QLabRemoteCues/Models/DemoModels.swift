import Foundation

enum DemoPhase: String, Codable, CaseIterable, Identifiable, Sendable {
    case preparation, launch, finish
    var id: Self { self }
    var title: String {
        switch self {
        case .preparation: "Preparación"
        case .launch: "Lanzamiento"
        case .finish: "Finalización"
        }
    }
}

enum DemoStepKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case osc, wait, confirmation, instruction
    var id: Self { self }
    var title: String {
        switch self {
        case .osc: "Comando OSC"
        case .wait: "Espera"
        case .confirmation: "Confirmación"
        case .instruction: "Instrucción"
        }
    }
    var symbol: String {
        switch self {
        case .osc: "dot.radiowaves.left.and.right"
        case .wait: "timer"
        case .confirmation: "checkmark.circle"
        case .instruction: "text.bubble"
        }
    }
}

struct DemoStep: Identifiable, Codable, Hashable, Sendable {
    var id = UUID()
    var kind: DemoStepKind = .osc
    var title = "Comando OSC"
    var value = ""
    var delaySeconds: Double = 1
    var isEnabled = true
    var continueOnError = false
    var order = 0

    var detail: String {
        switch kind {
        case .osc: value.isEmpty ? "Sin configurar" : value
        case .wait: "\(delaySeconds.formatted()) segundos"
        case .confirmation, .instruction: value.isEmpty ? "Sin texto" : value
        }
    }
}

struct DemoLiveControl: Identifiable, Codable, Hashable, Sendable {
    var id = UUID()
    var title = "Control"
    var oscAddress = ""
    var colorHex = "#3478F6"
    var symbol = "play.fill"
    var requiresConfirmation = false
    var order = 0
}

struct Demo: Identifiable, Codable, Hashable, Sendable {
    var id = UUID()
    var name = "Nueva demo"
    var summary = ""
    var symbol = "sparkles.rectangle.stack"
    var colorHex = "#3478F6"
    var estimatedMinutes = 5
    var requiresLaunchConfirmation = true
    var roomConfigurationCommand: String?
    var preparation: [DemoStep] = []
    var launch: [DemoStep] = []
    var finish: [DemoStep] = []
    var liveControls: [DemoLiveControl] = []
    var order = 0

    func steps(for phase: DemoPhase) -> [DemoStep] {
        switch phase {
        case .preparation: preparation
        case .launch: launch
        case .finish: finish
        }
    }
}

enum DemoRunState: Equatable, Sendable {
    case idle
    case preparing
    case ready
    case launching
    case running
    case finishing
    case completed
    case cancelled
    case failed(String)

    var label: String {
        switch self {
        case .idle: "Sin preparar"
        case .preparing: "Preparando"
        case .ready: "Lista"
        case .launching: "Lanzando"
        case .running: "En ejecución"
        case .finishing: "Finalizando"
        case .completed: "Finalizada"
        case .cancelled: "Cancelada"
        case .failed(let error): "Error: \(error)"
        }
    }

    var symbol: String {
        switch self {
        case .idle: "circle"
        case .preparing, .launching, .finishing: "hourglass"
        case .ready: "checkmark.circle.fill"
        case .running: "play.circle.fill"
        case .completed: "checkmark.seal.fill"
        case .cancelled: "xmark.circle"
        case .failed: "exclamationmark.triangle.fill"
        }
    }
}

struct AppConfigurationPackage: Codable, Sendable {
    var format = "QLabRemoteCues"
    var version = 1
    var exportedAt = Date()
    var profiles: [ConnectionProfile]
    var panels: [ControlPanel]
    var demos: [Demo]
    var constellationButtons: [DemoLiveControl]?
    var powerOnCommand: String?
    var powerOffCommand: String?
    var checkSpeakersCommand: String?
    var stopCheckSpeakersCommand: String?
    var resetAVBCommand: String?
}
