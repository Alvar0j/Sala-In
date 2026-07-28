import SwiftUI

struct ConnectionView: View {
    @EnvironmentObject private var model: AppViewModel
    @ObservedObject private var discovery: BonjourDiscoveryService
    @ObservedObject private var qlab: QLabService
    @State private var draft = ConnectionProfile()
    @State private var passcode = ""

    init(discovery: BonjourDiscoveryService, qlab: QLabService) {
        _discovery = ObservedObject(wrappedValue: discovery)
        _qlab = ObservedObject(wrappedValue: qlab)
    }

    var body: some View {
        Form {
            Section("Estado") {
                Label(qlab.state.label, systemImage: stateIcon)
                    .foregroundStyle(stateColor)
                    .accessibilityLabel("Estado de conexión: \(qlab.state.label)")
                if !qlab.version.isEmpty { LabeledContent("QLab", value: qlab.version) }
            }
            Section("Perfiles guardados") {
                Picker("Perfil", selection: $model.selectedProfileID) {
                    Text("Ninguno").tag(UUID?.none)
                    ForEach(model.profiles) { Text($0.name).tag(Optional($0.id)) }
                }
                Button("Cargar perfil") { loadSelected() }
            }
            Section("Detección Bonjour") {
                if discovery.devices.isEmpty { Text("Buscando QLab en la red local…").foregroundStyle(.secondary) }
                ForEach(discovery.devices) { device in
                    Button { draft.host = device.name } label: {
                        VStack(alignment: .leading) {
                            Text(device.name)
                            Text(device.endpointDescription).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Section("Conexión manual") {
                TextField("Nombre del perfil", text: $draft.name)
                TextField("IP o hostname del Mac", text: $draft.host)
                    .textInputAutocapitalization(.never).keyboardType(.URL)
                TextField("Workspace (nombre o ID)", text: $draft.workspace)
                    .textInputAutocapitalization(.never)
                LabeledContent("Puerto OSC") { TextField("53000", value: $draft.port, format: .number).keyboardType(.numberPad) }
                LabeledContent("Puerto de respuesta") { TextField("53001", value: $draft.localReplyPort, format: .number).keyboardType(.numberPad) }
                SecureField("Passcode (Keychain)", text: $passcode)
            }
            Section {
                Button("Guardar") { model.save(profile: draft, passcode: passcode) }
                    .disabled(!draft.isValid)
                Button(qlab.state == .connected ? "Desconectar" : "Probar y conectar") {
                    model.save(profile: draft, passcode: passcode)
                    Task { qlab.state == .connected ? await qlab.disconnect() : await model.connect() }
                }
                .disabled(!draft.isValid)
            }
        }
        .navigationTitle("Conexión")
        .onAppear { rebindAndLoad() }
    }

    private var stateIcon: String {
        switch qlab.state { case .connected: "checkmark.circle.fill"; case .error: "exclamationmark.triangle.fill"; default: "network" }
    }
    private var stateColor: Color {
        switch qlab.state { case .connected: .green; case .error: .red; default: .secondary }
    }
    private func rebindAndLoad() { loadSelected() }
    private func loadSelected() {
        guard let profile = model.selectedProfile else { return }
        draft = profile; passcode = KeychainStore.load(profileID: profile.id)
    }
}
