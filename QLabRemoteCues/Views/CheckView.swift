import SwiftUI

struct CheckView: View {
    @EnvironmentObject private var model: AppViewModel
    @ObservedObject private var qlab: QLabService
    @AppStorage("checkSpeakersOSCCommand") private var checkSpeakersCommand = "/cue/check/start"
    @AppStorage("stopCheckSpeakersOSCCommand") private var stopCheckSpeakersCommand = "/cue/check/stop"
    @AppStorage("resetAVBOSCCommand") private var resetAVBCommand = "/reset"
    @State private var editingCommands = false
    @State private var confirmingReset = false

    init(qlab: QLabService) {
        _qlab = ObservedObject(wrappedValue: qlab)
    }

    var body: some View {
        ScrollView {
            LazyVGrid(
                columns: [
                    GridItem(.flexible(minimum: 140), spacing: 18),
                    GridItem(.flexible(minimum: 140), spacing: 18)
                ],
                spacing: 18
            ) {
                commandButton(
                    title: "Check Altavoces",
                    subtitle: checkSpeakersCommand,
                    symbol: "speaker.wave.3.fill",
                    color: .blue
                ) {
                    model.execute(.custom(checkSpeakersCommand))
                }

                commandButton(
                    title: "Stop Check Altavoces",
                    subtitle: stopCheckSpeakersCommand,
                    symbol: "speaker.slash.fill",
                    color: .red
                ) {
                    model.execute(.custom(stopCheckSpeakersCommand))
                }

                commandButton(
                    title: "Reset AVB",
                    subtitle: resetAVBCommand,
                    symbol: "arrow.counterclockwise.circle.fill",
                    color: .orange
                ) {
                    confirmingReset = true
                }
            }
            .padding()
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Check")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { editingCommands = true } label: {
                    Label("Configurar comandos", systemImage: "gearshape.fill")
                }
            }
        }
        .sheet(isPresented: $editingCommands) {
            CheckCommandsEditor(
                checkSpeakersCommand: $checkSpeakersCommand,
                stopCheckSpeakersCommand: $stopCheckSpeakersCommand,
                resetAVBCommand: $resetAVBCommand
            )
        }
        .confirmationDialog(
            "¿Resetear AVB?",
            isPresented: $confirmingReset,
            titleVisibility: .visible
        ) {
            Button("Reset AVB", role: .destructive) {
                model.execute(.custom(resetAVBCommand))
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Se enviará \(resetAVBCommand)")
        }
    }

    private func commandButton(
        title: String,
        subtitle: String,
        symbol: String,
        color: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 14) {
                Image(systemName: symbol)
                    .font(.system(size: 42, weight: .semibold))
                Text(title)
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Text(subtitle)
                    .font(.caption.monospaced())
                    .lineLimit(1)
                    .opacity(0.8)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 170)
        }
        .buttonStyle(CheckCommandButtonStyle(color: color))
        .disabled(!qlab.canControl || subtitle.first != "/")
        .opacity(qlab.canControl && subtitle.first == "/" ? 1 : 0.45)
        .accessibilityHint("Envía el comando OSC \(subtitle)")
    }
}

private struct CheckCommandButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.white)
            .background(
                color.opacity(configuration.isPressed ? 0.72 : 1),
                in: RoundedRectangle(cornerRadius: 22)
            )
            .shadow(color: color.opacity(0.25), radius: 10, y: 5)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private struct CheckCommandsEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var checkSpeakersCommand: String
    @Binding var stopCheckSpeakersCommand: String
    @Binding var resetAVBCommand: String
    @State private var draftCheck: String
    @State private var draftStopCheck: String
    @State private var draftReset: String

    init(
        checkSpeakersCommand: Binding<String>,
        stopCheckSpeakersCommand: Binding<String>,
        resetAVBCommand: Binding<String>
    ) {
        _checkSpeakersCommand = checkSpeakersCommand
        _stopCheckSpeakersCommand = stopCheckSpeakersCommand
        _resetAVBCommand = resetAVBCommand
        _draftCheck = State(initialValue: checkSpeakersCommand.wrappedValue)
        _draftStopCheck = State(initialValue: stopCheckSpeakersCommand.wrappedValue)
        _draftReset = State(initialValue: resetAVBCommand.wrappedValue)
    }

    var body: some View {
        NavigationStack {
            Form {
                commandSection(
                    title: "Check Altavoces",
                    symbol: "speaker.wave.3.fill",
                    prompt: "Comando OSC del check",
                    command: $draftCheck
                )
                commandSection(
                    title: "Stop Check Altavoces",
                    symbol: "speaker.slash.fill",
                    prompt: "Comando OSC para detener el check",
                    command: $draftStopCheck
                )
                commandSection(
                    title: "Reset AVB",
                    symbol: "arrow.counterclockwise.circle.fill",
                    prompt: "Comando OSC del reset",
                    command: $draftReset
                )
            }
            .navigationTitle("Configurar Check")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        checkSpeakersCommand = draftCheck
                        stopCheckSpeakersCommand = draftStopCheck
                        resetAVBCommand = draftReset
                        dismiss()
                    }
                    .disabled(!commandsAreValid)
                }
            }
        }
    }

    private func commandSection(
        title: String,
        symbol: String,
        prompt: String,
        command: Binding<String>
    ) -> some View {
        Section {
            TextField(prompt, text: command)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if command.wrappedValue.first != "/" {
                Label("El comando debe comenzar por /", systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        } header: {
            Label(title, systemImage: symbol)
        }
    }

    private var commandsAreValid: Bool {
        draftCheck.first == "/" &&
        draftStopCheck.first == "/" &&
        draftReset.first == "/"
    }
}
