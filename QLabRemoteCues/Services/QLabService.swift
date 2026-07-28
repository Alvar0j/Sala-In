import Foundation

protocol QLabServicing: Sendable {
    func connect(profile: ConnectionProfile, passcode: String) async throws
    func disconnect() async
    func execute(_ command: PanelCommand) async throws
    func refreshCues() async throws
}

@MainActor
final class QLabService: ObservableObject, QLabServicing {
    @Published private(set) var state: ConnectionState = .disconnected
    @Published private(set) var cues: [QLabCue] = []
    @Published private(set) var activity: [ActivityEntry] = []
    @Published private(set) var version = ""
    @Published private(set) var isWorkspaceReady = false

    var canControl: Bool { state == .connected && isWorkspaceReady }

    private let transport: OSCTransporting
    private var profile: ConnectionProfile?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var passcode = ""

    init(transport: OSCTransporting = UDPOSCTransport()) { self.transport = transport }

    func connect(profile: ConnectionProfile, passcode: String) async throws {
        guard profile.isValid else { throw ValidationError.invalidProfile }
        reconnectTask?.cancel()
        self.profile = profile
        self.passcode = passcode
        isWorkspaceReady = false
        state = .connecting
        log("•", "Conexión", "Intentando \(profile.host):\(profile.port), respuestas UDP \(profile.localReplyPort)")
        do {
            try await transport.start(host: profile.host, port: profile.port, localPort: profile.localReplyPort)
            receiveTask?.cancel()
            receiveTask = Task { [weak self] in
                guard let stream = await self?.transport.messages() else { return }
                for await result in stream {
                    guard !Task.isCancelled else { return }
                    self?.handle(result)
                }
            }
            try await send(.init(address: QLabOSCPath.udpReplyPort, arguments: [.int(Int32(profile.localReplyPort))]))
            try await send(.init(address: QLabOSCPath.connect(profile.workspace),
                                 arguments: passcode.isEmpty ? [] : [.string(passcode)]))
            try await send(.init(address: QLabOSCPath.alwaysReply, arguments: [.int(1)]))
            try await send(.init(address: QLabOSCPath.updates, arguments: [.int(1)]))
            try await send(.init(address: QLabOSCPath.version))
            state = .connected
            try await refreshCues()
        } catch {
            log("!", "Conexión", error.localizedDescription)
            state = .error(error.localizedDescription)
            scheduleReconnect()
            throw error
        }
    }

    func disconnect() async {
        reconnectTask?.cancel(); receiveTask?.cancel()
        try? await send(.init(address: QLabOSCPath.disconnect))
        await transport.stop()
        isWorkspaceReady = false
        state = .disconnected
    }

    func execute(_ command: PanelCommand) async throws {
        guard let profile, canControl else { throw QLabConnectionError.notAuthorized }
        let workspace = profile.workspace
        let address: String
        switch command {
        case .go: address = QLabOSCPath.go(workspace)
        case .panic: address = QLabOSCPath.panic(workspace)
        case .stop: address = QLabOSCPath.stop(workspace)
        case .pause: address = QLabOSCPath.pause(workspace)
        case .resume: address = QLabOSCPath.resume(workspace)
        case .previous: address = QLabOSCPath.previous(workspace)
        case .next: address = QLabOSCPath.next(workspace)
        case .cueStart(let id): address = QLabOSCPath.cue(id, "start", workspace: workspace)
        case .cueStop(let id): address = QLabOSCPath.cue(id, "stop", workspace: workspace)
        case .cuePause(let id): address = QLabOSCPath.cue(id, "pause", workspace: workspace)
        case .cueResume(let id): address = QLabOSCPath.cue(id, "resume", workspace: workspace)
        case .custom(let route):
            guard route.first == "/" else { throw ValidationError.invalidOSCPath }
            address = route
        }
        try await send(.init(address: address))
    }

    func refreshCues() async throws {
        guard let profile else { return }
        try await send(.init(address: QLabOSCPath.cueLists(profile.workspace)))
        try await send(.init(address: QLabOSCPath.running(profile.workspace)))
    }

    private func send(_ message: OSCMessage) async throws {
        try await transport.send(message)
        log("→", message.address, "Enviado")
    }

    private func handle(_ event: OSCTransportEvent) {
        switch event {
        case .failure(let error):
            log("!", "UDP", error)
            if state == .connected { state = .error(error); scheduleReconnect() }
        case .message(let message):
            log("←", message.address, "Recibido")
            parse(message)
        }
    }

    private func parse(_ message: OSCMessage) {
        guard case .string(let json)? = message.arguments.first else { return }
        if message.address.contains("/connect") {
            let status = decodeEnvelope(json)?.status ?? ""
            if status == "ok" {
                isWorkspaceReady = true
                state = .connected
                log("✓", "QLab", "Workspace autenticado y listo")
            } else {
                isWorkspaceReady = false
                let reason = status == "badpass" ? "Passcode incorrecto" : "Workspace o permisos no válidos"
                state = .error(reason)
                log("!", "Autenticación", reason)
            }
        } else if message.address.contains("/version") {
            version = decodeEnvelope(json).flatMap { $0.data as? String } ?? json
        } else if message.address.contains("cueLists") {
            cues = decodeCues(json).map { cue in
                var value = cue
                if let old = cues.first(where: { $0.id == cue.id }) {
                    value.isRunning = old.isRunning; value.isPaused = old.isPaused; value.isActive = old.isActive
                }
                return value
            }
        } else if message.address.contains("runningOrPausedCues") {
            let runningIDs = Set(decodeCues(json).map(\.id))
            cues = cues.map { cue in var copy = cue; copy.isRunning = runningIDs.contains(cue.id); return copy }
        } else if message.address.hasPrefix("/update/") {
            Task { try? await refreshCues() }
        }
    }

    private func decodeCues(_ json: String) -> [QLabCue] {
        guard let data = json.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let items = root["data"] as? [[String: Any]] else { return [] }
        return items.compactMap {
            guard let id = $0["uniqueID"] as? String else { return nil }
            return QLabCue(id: id, number: $0["number"] as? String ?? "",
                           name: $0["name"] as? String ?? "Sin nombre",
                           type: $0["type"] as? String ?? "",
                           colorName: $0["colorName/live"] as? String ?? $0["colorName"] as? String ?? "",
                           armed: ($0["armed"] as? Bool) ?? true)
        }
    }

    private func decodeEnvelope(_ json: String) -> (status: String, data: Any)? {
        guard let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return (object["status"] as? String ?? "", object["data"] as Any)
    }

    private func log(_ direction: String, _ message: String, _ result: String) {
        activity.insert(ActivityEntry(date: .now, direction: direction, message: message, result: result), at: 0)
        if activity.count > 500 { activity.removeLast(activity.count - 500) }
    }

    private func scheduleReconnect() {
        guard reconnectTask == nil, let profile else { return }
        reconnectTask = Task { [weak self] in
            for attempt in 1...6 {
                guard !Task.isCancelled else { return }
                await MainActor.run { self?.state = .reconnecting(attempt: attempt) }
                try? await Task.sleep(for: .seconds(min(pow(2.0, Double(attempt - 1)), 30)))
                do {
                    try await self?.connect(profile: profile, passcode: self?.passcode ?? "")
                    return
                } catch {}
            }
            await MainActor.run { self?.reconnectTask = nil }
        }
    }
}

enum ValidationError: LocalizedError {
    case invalidProfile, invalidOSCPath
    var errorDescription: String? {
        switch self {
        case .invalidProfile: "Revisa el nombre, host, workspace y puertos."
        case .invalidOSCPath: "La ruta OSC debe comenzar por /."
        }
    }
}

enum QLabConnectionError: LocalizedError {
    case notAuthorized
    var errorDescription: String? {
        "Configura la sala y espera a que QLab confirme la conexión."
    }
}
