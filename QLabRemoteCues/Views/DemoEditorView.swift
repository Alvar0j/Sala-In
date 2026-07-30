import SwiftUI

struct DemoEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var demo: Demo
    @State private var stepTarget: DemoStepEditorTarget?
    @State private var controlTarget: DemoControlEditorTarget?
    let onSave: (Demo) -> Void

    init(demo: Demo, onSave: @escaping (Demo) -> Void) {
        _demo = State(initialValue: demo)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Demo") {
                    TextField("Nombre", text: $demo.name)
                }

                Section("Icono") {
                    DemoSymbolPicker(selection: $demo.symbol, tintHex: demo.colorHex)
                }

                Section("Color") {
                    DemoColorPicker(selection: $demo.colorHex)
                }

                Section {
                    TextField(
                        "Comando OSC, por ejemplo /cue/configuracion/start",
                        text: Binding(
                            get: { demo.roomConfigurationCommand ?? "" },
                            set: { demo.roomConfigurationCommand = $0.isEmpty ? nil : $0 }
                        )
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                    if let command = demo.roomConfigurationCommand,
                       !command.isEmpty, command.first != "/" {
                        Label("El comando debe comenzar por /", systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                } header: {
                    Label("Botón Configurar sala", systemImage: "gearshape.fill")
                } footer: {
                    Text("Se enviará exactamente este comando al pulsar “Configurar sala”.")
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Configurar demo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        demo.colorHex = Color.normalizedHex(demo.colorHex)
                        onSave(demo)
                        dismiss()
                    }
                    .disabled(demo.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .sheet(item: $stepTarget) { target in
                DemoStepEditorView(step: target.step) { save($0, in: target.phase, isNew: target.isNew) }
            }
            .sheet(item: $controlTarget) { target in
                DemoControlEditorView(control: target.control) { save($0, isNew: target.isNew) }
            }
        }
    }

    private func phaseSection(_ phase: DemoPhase) -> some View {
        Section {
            let steps = demo.steps(for: phase).sorted(by: { $0.order < $1.order })
            if steps.isEmpty {
                Text("Sin pasos configurados").foregroundStyle(.secondary)
            }
            ForEach(steps) { step in
                StepEditorRow(step: step) {
                    stepTarget = DemoStepEditorTarget(phase: phase, step: step)
                } test: {
                } delete: {
                    delete(step.id, from: phase)
                }
            }
            .onMove { source, destination in move(in: phase, from: source, to: destination) }
            Menu {
                ForEach(DemoStepKind.allCases) { kind in
                    Button(kind.title, systemImage: kind.symbol) { add(kind, to: phase) }
                }
            } label: {
                Label("Añadir paso", systemImage: "plus.circle")
            }
        } header: {
            Text(phase.title)
        } footer: {
            Text(footer(for: phase))
        }
    }

    private var controlSection: some View {
        Section {
            if demo.liveControls.isEmpty {
                Text("Sin botones configurados").foregroundStyle(.secondary)
            }
            ForEach(demo.liveControls.sorted(by: { $0.order < $1.order })) { control in
                HStack {
                    Image(systemName: control.symbol).foregroundStyle(Color(hex: control.colorHex))
                    VStack(alignment: .leading) {
                        Text(control.title)
                        Text(control.oscAddress.isEmpty ? "Sin configurar" : control.oscAddress)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { controlTarget = DemoControlEditorTarget(control: control) } label: {
                        Image(systemName: "pencil")
                    }
                    Button(role: .destructive) {
                        demo.liveControls.removeAll { $0.id == control.id }
                        normalizeControls()
                    } label: {
                        Image(systemName: "trash")
                    }
                }
            }
            .onMove { source, destination in
                demo.liveControls.sort { $0.order < $1.order }
                demo.liveControls.move(fromOffsets: source, toOffset: destination)
                normalizeControls()
            }
            Button {
                controlTarget = DemoControlEditorTarget(
                    control: DemoLiveControl(title: "Nuevo botón", order: demo.liveControls.count),
                    isNew: true
                )
            } label: {
                Label("Añadir botón", systemImage: "plus.circle")
            }
        } header: {
            Text("Botones del mando")
        } footer: {
            Text("Añade tantos botones como necesite esta demo. Cada botón enviará exactamente la dirección OSC que configures.")
        }
    }

    private func footer(for phase: DemoPhase) -> String {
        switch phase {
        case .preparation: "Se ejecuta al pulsar PREPARAR."
        case .launch: "Se ejecuta al pulsar LANZAR DEMO."
        case .finish: "Se ejecuta al pulsar FINALIZAR."
        }
    }

    private func add(_ kind: DemoStepKind, to phase: DemoPhase) {
        let count = demo.steps(for: phase).count
        let step = DemoStep(kind: kind, title: kind.title, value: "", delaySeconds: 1, order: count)
        stepTarget = DemoStepEditorTarget(phase: phase, step: step, isNew: true)
    }

    private func save(_ step: DemoStep, in phase: DemoPhase, isNew: Bool) {
        updateSteps(for: phase) { steps in
            if !isNew, let index = steps.firstIndex(where: { $0.id == step.id }) { steps[index] = step }
            else { steps.append(step) }
        }
    }

    private func delete(_ id: UUID, from phase: DemoPhase) {
        updateSteps(for: phase) { $0.removeAll { $0.id == id } }
    }

    private func move(in phase: DemoPhase, from source: IndexSet, to destination: Int) {
        updateSteps(for: phase) {
            $0.sort { $0.order < $1.order }
            $0.move(fromOffsets: source, toOffset: destination)
        }
    }

    private func updateSteps(for phase: DemoPhase, operation: (inout [DemoStep]) -> Void) {
        switch phase {
        case .preparation: operation(&demo.preparation); normalize(&demo.preparation)
        case .launch: operation(&demo.launch); normalize(&demo.launch)
        case .finish: operation(&demo.finish); normalize(&demo.finish)
        }
    }

    private func normalize(_ steps: inout [DemoStep]) {
        steps.sort { $0.order < $1.order }
        for index in steps.indices { steps[index].order = index }
    }

    private func normalizeAll() {
        normalize(&demo.preparation); normalize(&demo.launch); normalize(&demo.finish); normalizeControls()
    }

    private func save(_ control: DemoLiveControl, isNew: Bool) {
        if !isNew, let index = demo.liveControls.firstIndex(where: { $0.id == control.id }) {
            demo.liveControls[index] = control
        } else {
            demo.liveControls.append(control)
        }
        normalizeControls()
    }

    private func normalizeControls() {
        demo.liveControls.sort { $0.order < $1.order }
        for index in demo.liveControls.indices { demo.liveControls[index].order = index }
    }
}

struct DemoButtonsEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var demo: Demo
    @State private var controlTarget: DemoControlEditorTarget?
    let onSave: (Demo) -> Void

    init(demo: Demo, onSave: @escaping (Demo) -> Void) {
        _demo = State(initialValue: demo)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if demo.liveControls.isEmpty {
                        ContentUnavailableView(
                            "Sin botones",
                            systemImage: "rectangle.grid.2x2",
                            description: Text("Añade el primer botón del mando.")
                        )
                        .listRowBackground(Color.clear)
                    }
                    ForEach(demo.liveControls.sorted(by: { $0.order < $1.order })) { control in
                        HStack(spacing: 12) {
                            RoundedRectangle(cornerRadius: 9)
                                .fill(Color(hex: control.colorHex))
                                .frame(width: 48, height: 48)
                                .overlay {
                                    Image(systemName: control.symbol).foregroundStyle(.white)
                                }
                            Button {
                                controlTarget = DemoControlEditorTarget(control: control)
                            } label: {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(control.title).font(.headline)
                                    Text(control.oscAddress.isEmpty ? "Sin comando OSC" : control.oscAddress)
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Button {
                                controlTarget = DemoControlEditorTarget(control: control)
                            } label: {
                                Image(systemName: "pencil").frame(width: 38, height: 38)
                            }
                        }
                        .swipeActions {
                            Button("Eliminar", role: .destructive) { delete(control.id) }
                            Button("Editar") { controlTarget = DemoControlEditorTarget(control: control) }
                                .tint(.blue)
                        }
                    }
                    .onMove(perform: move)
                } header: {
                    Text("Botones de \(demo.name)")
                } footer: {
                    Text("Mantén pulsado el control de reordenación y arrastra para cambiar la posición.")
                }

                Button {
                    controlTarget = DemoControlEditorTarget(
                        control: DemoLiveControl(title: "Nuevo botón", order: demo.liveControls.count),
                        isNew: true
                    )
                } label: {
                    Label("Añadir botón", systemImage: "plus.circle.fill")
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Editar botones")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        normalize()
                        onSave(demo)
                        dismiss()
                    }
                }
            }
            .sheet(item: $controlTarget) { target in
                DemoControlEditorView(control: target.control) {
                    save($0, isNew: target.isNew)
                }
            }
        }
    }

    private func save(_ control: DemoLiveControl, isNew: Bool) {
        if !isNew, let index = demo.liveControls.firstIndex(where: { $0.id == control.id }) {
            demo.liveControls[index] = control
        } else {
            var newControl = control
            newControl.order = demo.liveControls.count
            demo.liveControls.append(newControl)
        }
        normalize()
    }

    private func delete(_ id: UUID) {
        demo.liveControls.removeAll { $0.id == id }
        normalize()
    }

    private func move(from source: IndexSet, to destination: Int) {
        demo.liveControls.sort { $0.order < $1.order }
        demo.liveControls.move(fromOffsets: source, toOffset: destination)
        normalize()
    }

    private func normalize() {
        demo.liveControls.sort { $0.order < $1.order }
        for index in demo.liveControls.indices { demo.liveControls[index].order = index }
    }
}

private enum DemoAppearanceOptions {
    struct Symbol: Identifiable {
        let name: String
        let title: String
        var id: String { name }
    }

    struct SymbolCategory: Identifiable {
        let title: String
        let symbols: [Symbol]
        var id: String { title }
    }

    static let symbolCategories = [
        SymbolCategory(title: "Temáticas escénicas y musicales", symbols: [
            Symbol(name: "circle.slash", title: "None"),
            Symbol(name: "theatermasks.fill", title: "Drama"),
            Symbol(name: "music.note.house.fill", title: "Musical Theater"),
            Symbol(name: "music.quarternote.3", title: "Chamber"),
            Symbol(name: "music.mic", title: "Recital"),
            Symbol(name: "person.wave.2.fill", title: "Opera"),
            Symbol(name: "metronome", title: "Symphony – Percussive"),
            Symbol(name: "heart.fill", title: "Symphony – Romantic"),
            Symbol(name: "person.3.fill", title: "Symphony and chorus"),
            Symbol(name: "pianokeys", title: "Organ Choral")
        ]),
        SymbolCategory(title: "Reproducción y acciones", symbols: [
            Symbol(name: "sparkles.rectangle.stack", title: "Demo"),
            Symbol(name: "play.rectangle.fill", title: "Reproducir vídeo"),
            Symbol(name: "play.circle.fill", title: "Reproducir"),
            Symbol(name: "play.fill", title: "Play"),
            Symbol(name: "stop.fill", title: "Stop"),
            Symbol(name: "playpause.fill", title: "Play / pausa"),
            Symbol(name: "pause.fill", title: "Pausa"),
            Symbol(name: "checkmark.circle.fill", title: "Completado"),
            Symbol(name: "arrow.counterclockwise", title: "Reiniciar"),
            Symbol(name: "gearshape.2.fill", title: "Configurar"),
            Symbol(name: "power.circle.fill", title: "Encender"),
            Symbol(name: "power.circle", title: "Alimentación")
        ]),
        SymbolCategory(title: "Escena y espectáculo", symbols: [
            Symbol(name: "curtains.closed", title: "Telón"),
            Symbol(name: "film.fill", title: "Cine"),
            Symbol(name: "video.fill", title: "Vídeo"),
            Symbol(name: "tv.fill", title: "Pantalla"),
            Symbol(name: "figure.walk", title: "Entrada"),
            Symbol(name: "figure.dance", title: "Danza"),
            Symbol(name: "person.2.fill", title: "Reparto"),
            Symbol(name: "star.fill", title: "Estrella"),
            Symbol(name: "wand.and.stars", title: "Efecto")
        ]),
        SymbolCategory(title: "Audio", symbols: [
            Symbol(name: "music.note", title: "Música"),
            Symbol(name: "music.note.list", title: "Lista musical"),
            Symbol(name: "speaker.wave.3.fill", title: "Altavoz"),
            Symbol(name: "waveform", title: "Onda"),
            Symbol(name: "waveform.path.ecg", title: "Señal"),
            Symbol(name: "headphones", title: "Auriculares")
        ]),
        SymbolCategory(title: "Iluminación y efectos", symbols: [
            Symbol(name: "lightbulb.fill", title: "Luz"),
            Symbol(name: "flashlight.on.fill", title: "Foco"),
            Symbol(name: "sun.max.fill", title: "Brillo"),
            Symbol(name: "bolt.fill", title: "Electricidad"),
            Symbol(name: "flame.fill", title: "Fuego"),
            Symbol(name: "drop.fill", title: "Agua")
        ]),
        SymbolCategory(title: "Vídeo, dispositivos y objetos", symbols: [
            Symbol(name: "iphone", title: "iPhone"),
            Symbol(name: "ipad", title: "iPad"),
            Symbol(name: "laptopcomputer", title: "Ordenador"),
            Symbol(name: "camera.fill", title: "Cámara"),
            Symbol(name: "viewfinder", title: "Encuadre"),
            Symbol(name: "arkit", title: "Realidad aumentada"),
            Symbol(name: "cube.fill", title: "Objeto"),
            Symbol(name: "shippingbox.fill", title: "Caja"),
            Symbol(name: "square.3.layers.3d", title: "Capas")
        ]),
        SymbolCategory(title: "Red, espacio y estado", symbols: [
            Symbol(name: "globe", title: "Global"),
            Symbol(name: "network", title: "Red"),
            Symbol(name: "dot.radiowaves.left.and.right", title: "Radio"),
            Symbol(name: "location.fill", title: "Ubicación"),
            Symbol(name: "map.fill", title: "Mapa"),
            Symbol(name: "point.3.filled.connected.trianglepath.dotted", title: "Espacio"),
            Symbol(name: "checkmark.seal.fill", title: "Verificado"),
            Symbol(name: "flag.fill", title: "Marca"),
            Symbol(name: "target", title: "Objetivo")
        ])
    ]

    static let colors = [
        "#E53935", "#D81B60", "#8E24AA", "#5E35B1", "#3949AB",
        "#1E88E5", "#039BE5", "#00ACC1", "#00897B", "#43A047",
        "#7CB342", "#C0CA33", "#FDD835", "#FFB300", "#FB8C00",
        "#F4511E", "#6D4C41", "#757575", "#546E7A", "#212121"
    ]
}

private struct DemoSymbolPicker: View {
    @Binding var selection: String
    let tintHex: String
    @State private var isExpanded = false
    private let columns = [GridItem(.adaptive(minimum: 92, maximum: 140), spacing: 8)]

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            ForEach(DemoAppearanceOptions.symbolCategories) { category in
                VStack(alignment: .leading, spacing: 8) {
                    Text(category.title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.top, 8)

                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(category.symbols) { symbol in
                            Button {
                                selection = symbol.name
                                isExpanded = false
                            } label: {
                                VStack(spacing: 5) {
                                    Image(systemName: symbol.name)
                                        .font(.title3)
                                        .frame(height: 24)
                                    Text(symbol.title)
                                        .font(.caption2)
                                        .lineLimit(2)
                                        .minimumScaleFactor(0.75)
                                        .multilineTextAlignment(.center)
                                }
                                .foregroundStyle(selection == symbol.name ? .white : Color(hex: tintHex))
                                .frame(maxWidth: .infinity, minHeight: 58)
                                .padding(.horizontal, 4)
                                .background {
                                    RoundedRectangle(cornerRadius: 9)
                                        .fill(selection == symbol.name ? Color(hex: tintHex) : Color.secondary.opacity(0.10))
                                }
                                .overlay {
                                    if selection == symbol.name {
                                        RoundedRectangle(cornerRadius: 9)
                                            .stroke(.primary.opacity(0.25), lineWidth: 2)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(symbol.title)
                            .accessibilityValue(selection == symbol.name ? "Seleccionado" : "")
                        }
                    }
                }
            }
            .padding(.top, 12)
        } label: {
            HStack {
                Text("Seleccionar icono")
                Spacer()
                Image(systemName: selection)
                    .font(.title2)
                    .foregroundStyle(Color(hex: tintHex))
                    .frame(width: 38, height: 38)
                    .background(Color(hex: tintHex).opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(.vertical, 4)
    }
}

private struct DemoColorPicker: View {
    @Binding var selection: String
    @State private var isExpanded = false
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 5)

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(Array(DemoAppearanceOptions.colors.enumerated()), id: \.offset) { index, hex in
                    Button {
                        selection = hex
                        isExpanded = false
                    } label: {
                        Circle()
                            .fill(Color(hex: hex))
                            .frame(width: 44, height: 44)
                            .overlay {
                                if selection.caseInsensitiveCompare(hex) == .orderedSame {
                                    Image(systemName: "checkmark")
                                        .font(.headline.bold())
                                        .foregroundStyle(.white)
                                        .shadow(radius: 1)
                                }
                            }
                            .overlay {
                                Circle()
                                    .stroke(selection.caseInsensitiveCompare(hex) == .orderedSame ? Color.primary : .clear,
                                            lineWidth: 3)
                                    .padding(-3)
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Color \(index + 1)")
                    .accessibilityValue(selection.caseInsensitiveCompare(hex) == .orderedSame ? "Seleccionado" : "")
                }
            }
            .padding(.top, 14)
        } label: {
            HStack {
                Text("Seleccionar color")
                Spacer()
                Circle()
                    .fill(Color(hex: selection))
                    .frame(width: 34, height: 34)
                    .overlay {
                        Circle().stroke(.primary.opacity(0.2), lineWidth: 1)
                    }
            }
        }
        .padding(.vertical, 6)
    }
}

private struct StepEditorRow: View {
    let step: DemoStep
    let edit: () -> Void
    let test: () -> Void
    let delete: () -> Void

    var body: some View {
        Button(action: edit) {
            HStack {
                Image(systemName: step.kind.symbol)
                    .foregroundStyle(step.isEnabled ? .blue : .secondary)
                VStack(alignment: .leading) {
                    Text(step.title)
                    Text(step.detail).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer()
                if !step.isEnabled { Text("Desactivado").font(.caption).foregroundStyle(.secondary) }
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .swipeActions {
            Button("Eliminar", role: .destructive, action: delete)
            Button("Editar", action: edit).tint(.blue)
        }
    }
}

private struct DemoStepEditorTarget: Identifiable {
    let id = UUID()
    let phase: DemoPhase
    let step: DemoStep
    var isNew = false
}

private struct DemoControlEditorTarget: Identifiable {
    let id = UUID()
    let control: DemoLiveControl
    var isNew = false
}

private struct DemoStepEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State var step: DemoStep
    let onSave: (DemoStep) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Paso") {
                    Picker("Tipo", selection: $step.kind) {
                        ForEach(DemoStepKind.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                    }
                    TextField("Nombre", text: $step.title)
                    switch step.kind {
                    case .osc:
                        TextField("Dirección OSC, por ejemplo /go", text: $step.value)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                    case .wait:
                        LabeledContent("Segundos") {
                            TextField("1", value: $step.delaySeconds, format: .number)
                                .keyboardType(.decimalPad)
                        }
                    case .confirmation:
                        TextField("Pregunta para el operador", text: $step.value, axis: .vertical)
                    case .instruction:
                        TextField("Instrucción para el operador", text: $step.value, axis: .vertical)
                    }
                    Toggle("Paso activo", isOn: $step.isEnabled)
                    Toggle("Continuar si falla", isOn: $step.continueOnError)
                }
                if step.kind == .osc {
                    Text("La dirección se envía exactamente como la escribas. La aplicación no añade el workspace ni sustituye el comando.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Editar paso")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { onSave(step); dismiss() }.disabled(!valid)
                }
            }
        }
    }

    private var valid: Bool {
        guard !step.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        switch step.kind {
        case .osc: return step.value.first == "/"
        case .wait: return step.delaySeconds >= 0
        case .confirmation, .instruction:
            return !step.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }
}

private struct DemoControlEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State var control: DemoLiveControl
    let onSave: (DemoLiveControl) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Botón") {
                    TextField("Nombre", text: $control.title)
                    TextField("Comando OSC", text: $control.oscAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Toggle("Pedir confirmación", isOn: $control.requiresConfirmation)
                }
                Section("Icono") {
                    DemoSymbolPicker(selection: $control.symbol, tintHex: control.colorHex)
                }
                Section("Color") {
                    DemoColorPicker(selection: $control.colorHex)
                }
                Section {
                    Text("El comando OSC se enviará exactamente como aparezca en este campo.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Control de demo")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        control.colorHex = Color.normalizedHex(control.colorHex)
                        onSave(control)
                        dismiss()
                    }
                    .disabled(control.title.isEmpty || control.oscAddress.first != "/")
                }
            }
        }
    }
}
