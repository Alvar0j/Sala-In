import SwiftUI

struct PanelsView: View {
    @EnvironmentObject private var model: AppViewModel
    @State private var editorTarget: PanelButtonEditorTarget?
    @State private var pendingExecution: PanelButton?
    @State private var panelToDelete: ControlPanel?

    var body: some View {
        List {
            ForEach(model.panels) { panel in
                Section {
                    if panel.buttons.isEmpty {
                        ContentUnavailableView(
                            "Panel vacío",
                            systemImage: "square.grid.2x2",
                            description: Text("Añade un botón para comenzar.")
                        )
                    } else {
                        ForEach(panel.buttons.sorted(by: { $0.order < $1.order })) { button in
                            ButtonRow(button: button) {
                                editorTarget = PanelButtonEditorTarget(panelID: panel.id, button: button)
                            } execute: {
                                execute(button)
                            } delete: {
                                delete(buttonID: button.id, from: panel.id)
                            }
                        }
                        .onMove { source, destination in
                            moveButtons(in: panel.id, from: source, to: destination)
                        }
                    }
                } header: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(panel.name)
                            Text("\(panel.buttons.count) botones · \(panel.columns) columnas")
                                .font(.caption)
                        }
                        Spacer()
                        Button {
                            let button = PanelButton(
                                title: "Nuevo botón",
                                colorHex: "#3478F6",
                                symbol: "circle.fill",
                                order: panel.buttons.count
                            )
                            editorTarget = PanelButtonEditorTarget(panelID: panel.id, button: button, isNew: true)
                        } label: {
                            Label("Añadir botón", systemImage: "plus.circle.fill")
                                .labelStyle(.iconOnly)
                        }
                        .accessibilityLabel("Añadir botón a \(panel.name)")
                    }
                } footer: {
                    HStack {
                        Spacer()
                        Button("Eliminar panel", role: .destructive) { panelToDelete = panel }
                    }
                    .textCase(nil)
                }
            }

            Button {
                let nextNumber = model.panels.count + 1
                model.panels.append(ControlPanel(name: "Panel \(nextNumber)", buttons: []))
                model.savePanels()
            } label: {
                Label("Añadir panel", systemImage: "plus.rectangle.on.rectangle")
            }
        }
        .navigationTitle("Paneles")
        .environment(\.editMode, .constant(.active))
        .sheet(item: $editorTarget) { target in
            PanelButtonEditor(button: target.button) { editedButton in
                save(editedButton, in: target.panelID, isNew: target.isNew)
            }
        }
        .confirmationDialog(
            "¿Ejecutar \(pendingExecution?.title ?? "este botón")?",
            isPresented: Binding(
                get: { pendingExecution != nil },
                set: { if !$0 { pendingExecution = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Ejecutar") {
                if let button = pendingExecution { run(button) }
                pendingExecution = nil
            }
            Button("Cancelar", role: .cancel) { pendingExecution = nil }
        }
        .confirmationDialog(
            "¿Eliminar el panel \(panelToDelete?.name ?? "")?",
            isPresented: Binding(
                get: { panelToDelete != nil },
                set: { if !$0 { panelToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Eliminar panel", role: .destructive) {
                if let panelToDelete {
                    model.panels.removeAll { $0.id == panelToDelete.id }
                    model.savePanels()
                }
                panelToDelete = nil
            }
            Button("Cancelar", role: .cancel) { panelToDelete = nil }
        }
        .toolbar {
            if let panel = model.panels.first, let url = model.exportPanel(panel) {
                ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
            }
        }
    }

    private func execute(_ button: PanelButton) {
        if button.requiresConfirmation { pendingExecution = button }
        else { run(button) }
    }

    private func run(_ button: PanelButton) {
        if button.haptics { Haptics.success() }
        model.execute(button.command)
    }

    private func save(_ button: PanelButton, in panelID: UUID, isNew: Bool) {
        guard let panelIndex = model.panels.firstIndex(where: { $0.id == panelID }) else { return }
        if !isNew, let buttonIndex = model.panels[panelIndex].buttons.firstIndex(where: { $0.id == button.id }) {
            model.panels[panelIndex].buttons[buttonIndex] = button
        } else {
            var newButton = button
            newButton.order = model.panels[panelIndex].buttons.count
            model.panels[panelIndex].buttons.append(newButton)
        }
        normalizeOrder(in: panelIndex)
        model.savePanels()
    }

    private func delete(buttonID: UUID, from panelID: UUID) {
        guard let panelIndex = model.panels.firstIndex(where: { $0.id == panelID }) else { return }
        model.panels[panelIndex].buttons.removeAll { $0.id == buttonID }
        normalizeOrder(in: panelIndex)
        model.savePanels()
    }

    private func moveButtons(in panelID: UUID, from source: IndexSet, to destination: Int) {
        guard let panelIndex = model.panels.firstIndex(where: { $0.id == panelID }) else { return }
        model.panels[panelIndex].buttons.sort { $0.order < $1.order }
        model.panels[panelIndex].buttons.move(fromOffsets: source, toOffset: destination)
        normalizeOrder(in: panelIndex)
        model.savePanels()
    }

    private func normalizeOrder(in panelIndex: Int) {
        model.panels[panelIndex].buttons.sort { $0.order < $1.order }
        for index in model.panels[panelIndex].buttons.indices {
            model.panels[panelIndex].buttons[index].order = index
        }
    }

}

private struct ButtonRow: View {
    let button: PanelButton
    let edit: () -> Void
    let execute: () -> Void
    let delete: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(hex: button.colorHex))
                .frame(width: 54, height: 54)
                .overlay {
                    Image(systemName: button.symbol)
                        .font(.title2)
                        .foregroundStyle(.white)
                }
                .accessibilityHidden(true)

            Button(action: edit) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(button.title).font(.headline)
                    Text(button.command.summary)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("\(button.width)×\(button.height) · \(button.colorHex.uppercased())")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button(action: execute) {
                Image(systemName: "play.fill")
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(hex: button.colorHex))
            .accessibilityLabel("Ejecutar \(button.title)")

            Menu {
                Button("Editar", systemImage: "pencil", action: edit)
                Button("Eliminar", systemImage: "trash", role: .destructive, action: delete)
            } label: {
                Image(systemName: "ellipsis.circle")
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Más acciones para \(button.title)")
        }
        .swipeActions(edge: .trailing) {
            Button("Eliminar", role: .destructive, action: delete)
            Button("Editar", action: edit).tint(.blue)
        }
    }
}

private struct PanelButtonEditorTarget: Identifiable {
    let id = UUID()
    let panelID: UUID
    let button: PanelButton
    var isNew = false
}

private enum PanelCommandKind: String, CaseIterable, Identifiable {
    case go = "GO"
    case stop = "STOP"
    case pause = "PAUSE"
    case resume = "RESUME"
    case previous = "PREVIOUS"
    case next = "NEXT"
    case panic = "PANIC"
    case cueStart = "Lanzar cue"
    case cueStop = "Detener cue"
    case cuePause = "Pausar cue"
    case cueResume = "Reanudar cue"
    case custom = "Ruta OSC personalizada"

    var id: Self { self }
}

struct PanelButtonEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State private var button: PanelButton
    @State private var commandKind: PanelCommandKind
    @State private var commandValue: String
    @State private var hasLongPress: Bool
    @State private var longPressKind: PanelCommandKind
    @State private var longPressValue: String
    let onSave: (PanelButton) -> Void

    init(button: PanelButton, onSave: @escaping (PanelButton) -> Void) {
        _button = State(initialValue: button)
        let command = Self.parts(for: button.command)
        _commandKind = State(initialValue: command.kind)
        _commandValue = State(initialValue: command.value)
        let longCommand = button.longPressCommand.map(Self.parts)
        _hasLongPress = State(initialValue: longCommand != nil)
        _longPressKind = State(initialValue: longCommand?.kind ?? .stop)
        _longPressValue = State(initialValue: longCommand?.value ?? "")
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Vista previa") {
                    HStack {
                        Spacer()
                        VStack(spacing: 8) {
                            Image(systemName: validSymbol)
                            Text(button.title.isEmpty ? "Sin nombre" : button.title)
                        }
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(width: CGFloat(button.width) * 80, height: CGFloat(button.height) * 58)
                        .background(Color(hex: button.colorHex), in: RoundedRectangle(cornerRadius: 14))
                        Spacer()
                    }
                }

                Section("Apariencia") {
                    TextField("Nombre del botón", text: $button.title)
                    TextField("Icono de SF Symbols", text: $button.symbol)
                        .textInputAutocapitalization(.never)
                    TextField("Color hexadecimal, por ejemplo #3478F6", text: $button.colorHex)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(["#2ECC71", "#3478F6", "#F1C40F", "#E67E22", "#E74C3C", "#8E44AD", "#34495E"], id: \.self) { hex in
                                Button { button.colorHex = hex } label: {
                                    Circle().fill(Color(hex: hex)).frame(width: 38, height: 38)
                                        .overlay {
                                            if button.colorHex.caseInsensitiveCompare(hex) == .orderedSame {
                                                Image(systemName: "checkmark").foregroundStyle(.white).bold()
                                            }
                                        }
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Color \(hex)")
                            }
                        }
                    }
                    Stepper("Ancho: \(button.width) columna\(button.width == 1 ? "" : "s")", value: $button.width, in: 1...4)
                    Stepper("Alto: \(button.height) fila\(button.height == 1 ? "" : "s")", value: $button.height, in: 1...4)
                }

                Section("Comando al pulsar") {
                    Picker("Comando", selection: $commandKind) {
                        ForEach(PanelCommandKind.allCases) { Text($0.rawValue).tag($0) }
                    }
                    commandValueField(kind: commandKind, value: $commandValue)
                }

                Section("Seguridad y respuesta") {
                    Toggle("Pedir confirmación", isOn: $button.requiresConfirmation)
                    Toggle("Feedback háptico", isOn: $button.haptics)
                }

                Section("Pulsación larga") {
                    Toggle("Ejecutar otro comando", isOn: $hasLongPress)
                    if hasLongPress {
                        Picker("Comando mantenido", selection: $longPressKind) {
                            ForEach(PanelCommandKind.allCases) { Text($0.rawValue).tag($0) }
                        }
                        commandValueField(kind: longPressKind, value: $longPressValue)
                    }
                }
            }
            .navigationTitle("Editar botón")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        button.command = makeCommand(kind: commandKind, value: commandValue)
                        button.longPressCommand = hasLongPress
                            ? makeCommand(kind: longPressKind, value: longPressValue)
                            : nil
                        button.colorHex = Color.normalizedHex(button.colorHex)
                        onSave(button)
                        dismiss()
                    }
                    .disabled(!isValid)
                }
            }
        }
    }

    @ViewBuilder
    private func commandValueField(kind: PanelCommandKind, value: Binding<String>) -> some View {
        switch kind {
        case .cueStart, .cueStop, .cuePause, .cueResume:
            TextField("ID único del cue", text: value)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        case .custom:
            TextField("Ruta OSC, por ejemplo /go", text: value)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        default:
            EmptyView()
        }
    }

    private var validSymbol: String {
        UIImage(systemName: button.symbol) == nil ? "questionmark.circle" : button.symbol
    }

    private var isValid: Bool {
        !button.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        Self.valueIsValid(kind: commandKind, value: commandValue) &&
        (!hasLongPress || Self.valueIsValid(kind: longPressKind, value: longPressValue))
    }

    private static func valueIsValid(kind: PanelCommandKind, value: String) -> Bool {
        switch kind {
        case .cueStart, .cueStop, .cuePause, .cueResume:
            return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .custom:
            return value.first == "/"
        default:
            return true
        }
    }

    private func makeCommand(kind: PanelCommandKind, value: String) -> PanelCommand {
        switch kind {
        case .go: .go
        case .stop: .stop
        case .pause: .pause
        case .resume: .resume
        case .previous: .previous
        case .next: .next
        case .panic: .panic
        case .cueStart: .cueStart(value)
        case .cueStop: .cueStop(value)
        case .cuePause: .cuePause(value)
        case .cueResume: .cueResume(value)
        case .custom: .custom(value)
        }
    }

    private static func parts(for command: PanelCommand) -> (kind: PanelCommandKind, value: String) {
        switch command {
        case .go: (.go, "")
        case .stop: (.stop, "")
        case .pause: (.pause, "")
        case .resume: (.resume, "")
        case .previous: (.previous, "")
        case .next: (.next, "")
        case .panic: (.panic, "")
        case .cueStart(let value): (.cueStart, value)
        case .cueStop(let value): (.cueStop, value)
        case .cuePause(let value): (.cuePause, value)
        case .cueResume(let value): (.cueResume, value)
        case .custom(let value): (.custom, value)
        }
    }
}

extension PanelCommand {
    var summary: String {
        switch self {
        case .go: "GO"
        case .panic: "PANIC"
        case .stop: "STOP"
        case .pause: "PAUSE"
        case .resume: "RESUME"
        case .previous: "PREVIOUS"
        case .next: "NEXT"
        case .cueStart(let id): "Lanzar cue · \(id)"
        case .cueStop(let id): "Detener cue · \(id)"
        case .cuePause(let id): "Pausar cue · \(id)"
        case .cueResume(let id): "Reanudar cue · \(id)"
        case .custom(let path): "OSC · \(path)"
        }
    }
}

extension Color {
    init(hex: String) {
        let normalized = Self.normalizedHex(hex)
        let value = UInt64(normalized.dropFirst(), radix: 16) ?? 0x666666
        self.init(
            red: Double((value >> 16) & 255) / 255,
            green: Double((value >> 8) & 255) / 255,
            blue: Double(value & 255) / 255
        )
    }

    static func normalizedHex(_ input: String) -> String {
        let filtered = input.uppercased().filter(\.isHexDigit)
        return filtered.count == 6 ? "#\(filtered)" : "#666666"
    }
}
