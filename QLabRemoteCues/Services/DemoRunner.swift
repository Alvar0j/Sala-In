import Foundation

@MainActor
final class DemoRunner: ObservableObject {
    @Published private(set) var states: [UUID: DemoRunState] = [:]
    @Published private(set) var currentStep: DemoStep?
    @Published var confirmationStep: DemoStep?
    @Published var instructionStep: DemoStep?

    private let qlab: QLabService
    private var task: Task<Void, Never>?
    private var continuation: CheckedContinuation<Bool, Never>?

    init(qlab: QLabService) { self.qlab = qlab }

    func state(for demo: Demo) -> DemoRunState { states[demo.id] ?? .idle }

    func prepare(_ demo: Demo) {
        run(demo, phase: .preparation, runningState: .preparing, successState: .ready)
    }

    func launch(_ demo: Demo) {
        run(demo, phase: .launch, runningState: .launching, successState: .running)
    }

    func finish(_ demo: Demo) {
        run(demo, phase: .finish, runningState: .finishing, successState: .completed)
    }

    func runLiveControl(_ control: DemoLiveControl) {
        guard control.oscAddress.first == "/" else {
            return
        }
        Task {
            do { try await qlab.execute(.custom(control.oscAddress)); Haptics.success() }
            catch { Haptics.error() }
        }
    }

    func test(_ step: DemoStep) {
        task?.cancel()
        task = Task {
            do { try await execute(step) }
            catch is CancellationError {}
            catch { Haptics.error() }
        }
    }

    func cancel(demoID: UUID) {
        continuation?.resume(returning: false)
        continuation = nil
        task?.cancel()
        task = nil
        currentStep = nil
        confirmationStep = nil
        instructionStep = nil
        states[demoID] = .cancelled
    }

    func answerPrompt(continueRun: Bool) {
        confirmationStep = nil
        instructionStep = nil
        continuation?.resume(returning: continueRun)
        continuation = nil
    }

    private func run(_ demo: Demo, phase: DemoPhase, runningState: DemoRunState, successState: DemoRunState) {
        continuation?.resume(returning: false)
        continuation = nil
        task?.cancel()
        states[demo.id] = runningState
        task = Task { [weak self] in
            guard let self else { return }
            do {
                for step in demo.steps(for: phase).filter(\.isEnabled).sorted(by: { $0.order < $1.order }) {
                    try Task.checkCancellation()
                    currentStep = step
                    do {
                        try await execute(step)
                    } catch {
                        if !step.continueOnError { throw error }
                    }
                }
                currentStep = nil
                states[demo.id] = successState
                Haptics.success()
            } catch is CancellationError {
                currentStep = nil
                states[demo.id] = .cancelled
            } catch {
                currentStep = nil
                states[demo.id] = .failed(error.localizedDescription)
                Haptics.error()
            }
        }
    }

    private func execute(_ step: DemoStep) async throws {
        switch step.kind {
        case .osc:
            guard step.value.first == "/" else { throw DemoRunnerError.invalidOSC(step.value) }
            try await qlab.execute(.custom(step.value))
        case .wait:
            try await Task.sleep(for: .seconds(max(0, step.delaySeconds)))
        case .confirmation:
            confirmationStep = step
            guard await waitForUser() else { throw CancellationError() }
        case .instruction:
            instructionStep = step
            guard await waitForUser() else { throw CancellationError() }
        }
    }

    private func waitForUser() async -> Bool {
        await withCheckedContinuation { continuation = $0 }
    }
}

enum DemoRunnerError: LocalizedError {
    case invalidOSC(String)
    var errorDescription: String? {
        switch self {
        case .invalidOSC(let value): "Comando OSC no válido: \(value.isEmpty ? "vacío" : value)"
        }
    }
}
