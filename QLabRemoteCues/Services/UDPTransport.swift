import Foundation
import Network

protocol OSCTransporting: Sendable {
    func start(host: String, port: UInt16, localPort: UInt16) async throws
    func send(_ message: OSCMessage) async throws
    func messages() async -> AsyncStream<OSCTransportEvent>
    func stop() async
}

enum OSCTransportEvent: Sendable {
    case message(OSCMessage)
    case failure(String)
}

actor UDPOSCTransport: OSCTransporting {
    private var connection: NWConnection?
    private var listener: NWListener?
    private var continuation: AsyncStream<OSCTransportEvent>.Continuation?

    func messages() async -> AsyncStream<OSCTransportEvent> {
        AsyncStream { continuation = $0 }
    }

    func start(host: String, port: UInt16, localPort: UInt16) async throws {
        await stop()
        guard let remotePort = NWEndpoint.Port(rawValue: port),
              let replyPort = NWEndpoint.Port(rawValue: localPort) else {
            throw URLError(.badURL)
        }
        let listener = try NWListener(using: .udp, on: replyPort)
        listener.newConnectionHandler = { [weak self] incoming in
            incoming.start(queue: .global(qos: .userInitiated))
            self?.receive(on: incoming)
        }
        listener.stateUpdateHandler = { [weak self] state in
            if case .failed(let error) = state {
                Task { await self?.yield(.failure(error.localizedDescription)) }
            }
        }
        listener.start(queue: .global(qos: .userInitiated))
        self.listener = listener

        let connection = NWConnection(host: NWEndpoint.Host(host), port: remotePort, using: .udp)
        self.connection = connection
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let gate = ContinuationGate()
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    gate.resumeOnce { continuation.resume() }
                case .failed(let error):
                    gate.resumeOnce { continuation.resume(throwing: error) }
                default: break
                }
            }
            connection.start(queue: .global(qos: .userInitiated))
        }
    }

    func send(_ message: OSCMessage) async throws {
        guard let connection else { throw URLError(.notConnectedToInternet) }
        let data = try OSCCodec.encode(message)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume() }
            })
        }
    }

    func stop() async {
        connection?.cancel()
        listener?.cancel()
        connection = nil
        listener = nil
    }

    private nonisolated func receive(on connection: NWConnection) {
        connection.receiveMessage { [weak self] data, _, _, error in
            if let data {
                do {
                    let message = try OSCCodec.decode(data)
                    Task { [weak self] in
                        guard let self else { return }
                        await self.yield(.message(message))
                    }
                } catch {
                    let description = error.localizedDescription
                    Task { [weak self] in
                        guard let self else { return }
                        await self.yield(.failure(description))
                    }
                }
            }
            if let error {
                let description = error.localizedDescription
                Task { [weak self] in
                    guard let self else { return }
                    await self.yield(.failure(description))
                }
            }
            else { self?.receive(on: connection) }
        }
    }

    private func yield(_ event: OSCTransportEvent) { continuation?.yield(event) }
}

private final class ContinuationGate: @unchecked Sendable {
    private let lock = NSLock()
    private var completed = false
    func resumeOnce(_ operation: () -> Void) {
        lock.lock(); defer { lock.unlock() }
        guard !completed else { return }
        completed = true
        operation()
    }
}
