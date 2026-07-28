import SwiftUI

struct ConstellationView: View {
    @EnvironmentObject private var model: AppViewModel
    @ObservedObject private var qlab: QLabService
    @State private var editingButtons = false
    @State private var pendingControl: DemoLiveControl?

    init(qlab: QLabService) {
        _qlab = ObservedObject(wrappedValue: qlab)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                ProductBrandHeader(
                    logoName: "ConstellationLogo",
                    logoAccessibilityLabel: "Constellation",
                    logoHeight: 72,
                    state: qlab.state
                )

                HStack {
                    Text("Controles OSC").font(.title3.bold())
                    Spacer()
                    Button("Editar botones") { editingButtons = true }
                }

                if model.constellationButtons.isEmpty {
                    ContentUnavailableView {
                        Label("Sin botones", systemImage: "rectangle.grid.2x2")
                    } description: {
                        Text("Añade botones OSC específicos para Constellation.")
                    } actions: {
                        Button("Añadir botones") { editingButtons = true }
                            .buttonStyle(.borderedProminent)
                    }
                    .frame(maxWidth: .infinity, minHeight: 240)
                    .background(
                        Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 18)
                    )
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 145))], spacing: 12) {
                        ForEach(model.constellationButtons.sorted(by: { $0.order < $1.order })) { control in
                            Button {
                                if control.requiresConfirmation {
                                    pendingControl = control
                                } else {
                                    execute(control)
                                }
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
                    .disabled(!qlab.canControl)
                    .opacity(qlab.canControl ? 1 : 0.45)
                }
            }
            .padding()
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .sheet(isPresented: $editingButtons) {
            DemoButtonsEditorView(demo: editorDemo) { edited in
                model.constellationButtons = edited.liveControls
                model.saveConstellationButtons()
            }
        }
        .confirmationDialog(
            "¿Ejecutar \(pendingControl?.title ?? "este comando")?",
            isPresented: Binding(
                get: { pendingControl != nil },
                set: { if !$0 { pendingControl = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Ejecutar") {
                if let pendingControl { execute(pendingControl) }
                pendingControl = nil
            }
            Button("Cancelar", role: .cancel) { pendingControl = nil }
        }
    }

    private var editorDemo: Demo {
        var demo = Demo(name: "Constellation")
        demo.liveControls = model.constellationButtons
        return demo
    }

    private func execute(_ control: DemoLiveControl) {
        model.execute(.custom(control.oscAddress))
    }
}
