import SwiftUI
import UniformTypeIdentifiers

struct DemosView: View {
    @EnvironmentObject private var model: AppViewModel
    @ObservedObject private var runner: DemoRunner
    @ObservedObject private var qlab: QLabService
    @AppStorage("roomPowerOnOSCCommand") private var powerOnCommand = "/go/104"
    @AppStorage("roomPowerOffOSCCommand") private var powerOffCommand = "/go/103"
    @State private var editingDemo: DemoEditorTarget?
    @State private var confirmPowerOn = false
    @State private var confirmPowerOff = false
    @State private var editingPowerCommands = false
    @State private var importingConfiguration = false

    init(runner: DemoRunner, qlab: QLabService) {
        _runner = ObservedObject(wrappedValue: runner)
        _qlab = ObservedObject(wrappedValue: qlab)
    }

    var body: some View {
        List {
            Section {
                ProductBrandHeader(
                    logoName: "SpacemapLogo",
                    logoAccessibilityLabel: "SpaceMap Go",
                    logoHeight: 46,
                    state: qlab.state
                )
                .padding(.vertical, 2)
            }
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            .listRowBackground(Color.clear)
            Section {
                HStack(spacing: 12) {
                    Button {
                        confirmPowerOn = true
                    } label: {
                        VStack(spacing: 8) {
                            Image(systemName: "power.circle.fill")
                                .font(.system(size: 34, weight: .bold))
                            Text("ON").font(.title2.bold())
                        }
                        .frame(maxWidth: .infinity, minHeight: 86)
                    }
                    .buttonStyle(ControlButtonStyle(color: .green))
                    .accessibilityLabel("Encender sala")
                    .disabled(!qlab.canControl || powerOnCommand.first != "/")

                    Button {
                        confirmPowerOff = true
                    } label: {
                        VStack(spacing: 8) {
                            Image(systemName: "power.circle")
                                .font(.system(size: 34, weight: .bold))
                            Text("OFF").font(.title2.bold())
                        }
                        .frame(maxWidth: .infinity, minHeight: 86)
                    }
                    .buttonStyle(ControlButtonStyle(color: .red))
                    .accessibilityLabel("Apagar sala")
                    .disabled(!qlab.canControl || powerOffCommand.first != "/")
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                .listRowBackground(Color.clear)
            } header: {
                HStack {
                    Text("Sala")
                    Spacer()
                    Button {
                        editingPowerCommands = true
                    } label: {
                        Label("Configurar ON y OFF", systemImage: "gearshape")
                            .labelStyle(.iconOnly)
                    }
                    .accessibilityLabel("Configurar comandos ON y OFF")
                }
            }
            Section("Demos") {
                if model.demos.isEmpty {
                    ContentUnavailableView {
                        Label("No hay demos", systemImage: "sparkles.rectangle.stack")
                    } description: {
                        Text("Crea una demo y configura sus comandos OSC.")
                    } actions: {
                        Button("Crear primera demo") { editingDemo = .new(order: 0) }
                            .buttonStyle(.borderedProminent)
                    }
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(model.demos.sorted(by: { $0.order < $1.order })) { demo in
                        NavigationLink {
                            DemoDetailView(demoID: demo.id, runner: runner, qlab: qlab)
                        } label: {
                            DemoCard(demo: demo, state: runner.state(for: demo))
                        }
                        .swipeActions(edge: .trailing) {
                            Button("Eliminar", role: .destructive) { delete(demo.id) }
                            Button("Editar") { editingDemo = DemoEditorTarget(demo: demo) }
                                .tint(.blue)
                        }
                        .contextMenu {
                            Button("Editar", systemImage: "pencil") { editingDemo = DemoEditorTarget(demo: demo) }
                            Button("Duplicar", systemImage: "plus.square.on.square") { duplicate(demo) }
                            Button("Eliminar", systemImage: "trash", role: .destructive) { delete(demo.id) }
                        }
                    }
                    .onMove(perform: move)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .secondaryAction) {
                Button {
                    importingConfiguration = true
                } label: {
                    Label("Importar configuración", systemImage: "square.and.arrow.down")
                }
            }
            ToolbarItem(placement: .secondaryAction) {
                if let url = model.exportConfiguration() {
                    ShareLink(item: url) {
                        Label("Exportar configuración", systemImage: "square.and.arrow.up")
                    }
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button { editingDemo = .new(order: model.demos.count) } label: {
                    Label("Nueva demo", systemImage: "plus")
                }
            }
        }
        .sheet(item: $editingDemo) { target in
            DemoEditorView(demo: target.demo) { demo in save(demo, isNew: target.isNew) }
        }
        .sheet(isPresented: $editingPowerCommands) {
            RoomPowerCommandsEditor(
                powerOnCommand: $powerOnCommand,
                powerOffCommand: $powerOffCommand
            )
        }
        .fileImporter(
            isPresented: $importingConfiguration,
            allowedContentTypes: [.json],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                if let url = urls.first { model.importConfiguration(from: url) }
            case .failure(let error):
                model.lastError = "No se pudo abrir la configuración: \(error.localizedDescription)"
            }
        }
        .confirmationDialog("¿Encender la sala?", isPresented: $confirmPowerOn, titleVisibility: .visible) {
            Button("Encender") { model.execute(.custom(powerOnCommand)) }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Se enviará \(powerOnCommand)")
        }
        .confirmationDialog("¿Apagar la sala?", isPresented: $confirmPowerOff, titleVisibility: .visible) {
            Button("Apagar", role: .destructive) { model.execute(.custom(powerOffCommand)) }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Se enviará \(powerOffCommand)")
        }
        .demoRunnerPrompts(runner)
    }

    private func save(_ demo: Demo, isNew: Bool) {
        if !isNew, let index = model.demos.firstIndex(where: { $0.id == demo.id }) {
            model.demos[index] = demo
        } else {
            model.demos.append(demo)
        }
        model.saveDemos()
    }

    private func delete(_ id: UUID) {
        model.demos.removeAll { $0.id == id }
        model.saveDemos()
    }

    private func duplicate(_ demo: Demo) {
        var copy = demo
        copy.id = UUID()
        copy.name += " (copia)"
        copy.order = model.demos.count
        model.demos.append(copy)
        model.saveDemos()
    }

    private func move(from source: IndexSet, to destination: Int) {
        model.demos.sort { $0.order < $1.order }
        model.demos.move(fromOffsets: source, toOffset: destination)
        model.saveDemos()
    }
}

struct ProductBrandHeader: View {
    let logoName: String
    let logoAccessibilityLabel: String
    let logoHeight: CGFloat
    let state: ConnectionState

    var body: some View {
        VStack(spacing: 12) {
            Image(logoName)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .foregroundStyle(.primary)
                .frame(maxWidth: 270, maxHeight: logoHeight)
                .accessibilityLabel(logoAccessibilityLabel)
            PartnerLogosView()
            ConnectionBadge(state: state)
        }
        .frame(maxWidth: .infinity)
    }
}

struct PartnerLogosView: View {
    var body: some View {
        HStack(spacing: 22) {
            Image("MeyerSoundLogo")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .foregroundStyle(.primary)
                .frame(width: 150, height: 68)
                .accessibilityLabel("Meyer Sound")

            Image("RMSProaudioLogo")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .foregroundStyle(.primary)
                .frame(width: 100, height: 37)
                .accessibilityLabel("RMS Proaudio")
        }
        .opacity(0.72)
        .accessibilityElement(children: .contain)
    }
}

private struct RoomPowerCommandsEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Binding private var powerOnCommand: String
    @Binding private var powerOffCommand: String
    @State private var draftOn: String
    @State private var draftOff: String

    init(powerOnCommand: Binding<String>, powerOffCommand: Binding<String>) {
        _powerOnCommand = powerOnCommand
        _powerOffCommand = powerOffCommand
        _draftOn = State(initialValue: powerOnCommand.wrappedValue)
        _draftOff = State(initialValue: powerOffCommand.wrappedValue)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Comando OSC de encendido", text: $draftOn)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    commandValidation(draftOn)
                } header: {
                    Label("ON", systemImage: "power.circle.fill")
                } footer: {
                    Text("Se enviará después de confirmar el encendido.")
                }

                Section {
                    TextField("Comando OSC de apagado", text: $draftOff)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    commandValidation(draftOff)
                } header: {
                    Label("OFF", systemImage: "power.circle")
                } footer: {
                    Text("Se enviará después de confirmar el apagado.")
                }
            }
            .navigationTitle("Comandos de sala")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        powerOnCommand = draftOn
                        powerOffCommand = draftOff
                        dismiss()
                    }
                    .disabled(!commandsAreValid)
                }
            }
        }
    }

    @ViewBuilder
    private func commandValidation(_ command: String) -> some View {
        if command.first != "/" {
            Label("El comando debe comenzar por /", systemImage: "exclamationmark.triangle.fill")
                .font(.footnote)
                .foregroundStyle(.red)
        }
    }

    private var commandsAreValid: Bool {
        draftOn.first == "/" && draftOff.first == "/"
    }
}

private struct DemoCard: View {
    let demo: Demo
    let state: DemoRunState

    var body: some View {
        HStack(spacing: 16) {
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(hex: demo.colorHex))
                .frame(width: 68, height: 68)
                .overlay {
                    Image(systemName: demo.symbol)
                        .font(.title)
                        .foregroundStyle(.white)
                }
            VStack(alignment: .leading, spacing: 5) {
                Text(demo.name).font(.title3.bold())
                if !demo.summary.isEmpty {
                    Text(demo.summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                }
                HStack {
                    Label("\(demo.estimatedMinutes) min", systemImage: "clock")
                    Label(state.label, systemImage: state.symbol)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}

struct DemoDetailView: View {
    @EnvironmentObject private var model: AppViewModel
    let demoID: UUID
    @ObservedObject var runner: DemoRunner
    @ObservedObject var qlab: QLabService
    @State private var editingDemo: DemoEditorTarget?
    @State private var editingButtons = false
    @State private var pendingControl: DemoLiveControl?
    @State private var roomConfigured = false
    @State private var configurationSecondsRemaining = 0
    @State private var roomConfigurationTask: Task<Void, Never>?

    private var demo: Demo? { model.demos.first { $0.id == demoID } }

    var body: some View {
        Group {
            if let demo {
                ScrollView {
                    VStack(spacing: 20) {
                        header(demo)
                        liveControls(demo)
                    }
                    .padding()
                }
                .toolbar {
                    Button("Editar") { editingDemo = DemoEditorTarget(demo: demo) }
                }
                .sheet(item: $editingDemo) { target in
                    DemoEditorView(demo: target.demo) { edited in
                        guard let index = model.demos.firstIndex(where: { $0.id == edited.id }) else { return }
                        model.demos[index] = edited
                        model.saveDemos()
                    }
                }
                .sheet(isPresented: $editingButtons) {
                    DemoButtonsEditorView(demo: demo) { edited in
                        guard let index = model.demos.firstIndex(where: { $0.id == edited.id }) else { return }
                        model.demos[index] = edited
                        model.saveDemos()
                    }
                }
                .confirmationDialog("¿Ejecutar \(pendingControl?.title ?? "el control")?",
                                    isPresented: Binding(get: { pendingControl != nil },
                                                         set: { if !$0 { pendingControl = nil } }),
                                    titleVisibility: .visible) {
                    Button("Ejecutar") {
                        if let pendingControl { runner.runLiveControl(pendingControl) }
                        pendingControl = nil
                    }
                    Button("Cancelar", role: .cancel) { pendingControl = nil }
                }
            } else {
                ContentUnavailableView("Demo no disponible", systemImage: "exclamationmark.triangle")
            }
        }
        .demoRunnerPrompts(runner)
        .onChange(of: qlab.state) { _, _ in
            if !qlab.canControl { resetRoomConfiguration() }
        }
        .onDisappear { roomConfigurationTask?.cancel() }
    }

    private func header(_ demo: Demo) -> some View {
        VStack(spacing: 12) {
            Image(systemName: demo.symbol)
                .font(.system(size: 54))
                .foregroundStyle(Color(hex: demo.colorHex))
            Text(demo.name).font(.largeTitle.bold()).multilineTextAlignment(.center)
            ConnectionBadge(state: qlab.state)
            Button {
                configureRoom(demo)
            } label: {
                Label(configurationButtonTitle,
                      systemImage: roomConfigured ? "checkmark.circle.fill" :
                        (configurationSecondsRemaining > 0 ? "timer" : "gearshape.fill"))
            }
            .buttonStyle(.borderedProminent)
            .accessibilityHint(demo.roomConfigurationCommand ?? "Comando OSC sin configurar")
            if configurationSecondsRemaining > 0 {
                VStack(spacing: 5) {
                    ProgressView(value: Double(10 - configurationSecondsRemaining), total: 10)
                    Text("Preparando la sala · \(configurationSecondsRemaining) s")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: 280)
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func liveControls(_ demo: Demo) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Mando de la demo", systemImage: "rectangle.grid.2x2.fill")
                    .font(.title3.bold())
                Spacer()
                Button("Editar botones") { editingButtons = true }
                    .font(.subheadline)
            }
            if demo.liveControls.isEmpty {
                ContentUnavailableView {
                    Label("Sin botones", systemImage: "rectangle.grid.2x2")
                } description: {
                    Text("Pulsa “Editar botones” para crear el mando específico de esta demo.")
                }
                .frame(maxWidth: .infinity, minHeight: 150)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 145))], spacing: 12) {
                    ForEach(demo.liveControls.sorted(by: { $0.order < $1.order })) { control in
                        Button {
                            if control.requiresConfirmation { pendingControl = control }
                            else { runner.runLiveControl(control) }
                        } label: {
                            VStack(spacing: 9) {
                                Image(systemName: control.symbol).font(.title)
                                Text(control.title)
                                    .font(.headline)
                                    .multilineTextAlignment(.center)
                                    .lineLimit(2)
                            }
                            .frame(maxWidth: .infinity, minHeight: 82)
                        }
                        .buttonStyle(ControlButtonStyle(color: Color(hex: control.colorHex)))
                        .accessibilityHint("Envía \(control.oscAddress)")
                    }
                }
                .disabled(!qlab.canControl || !roomConfigured)
                .opacity(qlab.canControl && roomConfigured ? 1 : 0.45)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
    }

    private func configureRoom(_ demo: Demo) {
        guard let command = demo.roomConfigurationCommand, command.first == "/" else {
            editingDemo = DemoEditorTarget(demo: demo)
            return
        }
        guard qlab.canControl else {
            model.lastError = "Conecta primero con QLab. El botón Configurar sala seguirá disponible."
            return
        }
        resetRoomConfiguration()
        roomConfigurationTask = Task {
            do {
                try await qlab.execute(.custom(command))
                configurationSecondsRemaining = 10
                for remaining in stride(from: 10, through: 1, by: -1) {
                    guard qlab.canControl else { throw QLabConnectionError.notAuthorized }
                    configurationSecondsRemaining = remaining
                    try await Task.sleep(for: .seconds(1))
                }
                guard qlab.canControl else { throw QLabConnectionError.notAuthorized }
                configurationSecondsRemaining = 0
                roomConfigured = true
                Haptics.success()
            } catch {
                let wasCancelled = Task.isCancelled
                roomConfigurationTask = nil
                configurationSecondsRemaining = 0
                roomConfigured = false
                if !wasCancelled {
                    model.lastError = "No se pudo configurar la sala: \(error.localizedDescription)"
                    Haptics.error()
                }
            }
        }
    }

    private var configurationButtonTitle: String {
        if roomConfigured { return "Sala configurada" }
        if configurationSecondsRemaining > 0 {
            return "Configurando sala · \(configurationSecondsRemaining) s"
        }
        return "Configurar sala"
    }

    private func resetRoomConfiguration() {
        roomConfigurationTask?.cancel()
        roomConfigurationTask = nil
        configurationSecondsRemaining = 0
        roomConfigured = false
    }

}

private struct DemoEditorTarget: Identifiable {
    let id = UUID()
    let demo: Demo
    var isNew = false

    static func new(order: Int) -> Self {
        var demo = Demo()
        demo.order = order
        return Self(demo: demo, isNew: true)
    }
}

private extension View {
    func demoRunnerPrompts(_ runner: DemoRunner) -> some View {
        self
            .alert("Confirmación", isPresented: Binding(
                get: { runner.confirmationStep != nil },
                set: { if !$0 { runner.answerPrompt(continueRun: false) } }
            )) {
                Button("Continuar") { runner.answerPrompt(continueRun: true) }
                Button("Cancelar", role: .cancel) { runner.answerPrompt(continueRun: false) }
            } message: {
                Text(runner.confirmationStep?.value ?? "")
            }
            .alert("Instrucción", isPresented: Binding(
                get: { runner.instructionStep != nil },
                set: { if !$0 { runner.answerPrompt(continueRun: false) } }
            )) {
                Button("Hecho") { runner.answerPrompt(continueRun: true) }
                Button("Cancelar", role: .cancel) { runner.answerPrompt(continueRun: false) }
            } message: {
                Text(runner.instructionStep?.value ?? "")
            }
    }
}
