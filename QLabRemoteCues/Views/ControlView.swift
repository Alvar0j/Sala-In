import SwiftUI

struct ControlView: View {
    @EnvironmentObject private var model: AppViewModel
    @ObservedObject private var qlab: QLabService
    @State private var confirmPanic = false

    init(qlab: QLabService) { _qlab = ObservedObject(wrappedValue: qlab) }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                ConnectionBadge(state: qlab.state)
                Button { model.execute(.go) } label: {
                    Label("GO", systemImage: "play.fill")
                        .font(.system(size: 44, weight: .black))
                        .frame(maxWidth: .infinity, minHeight: 150)
                }
                .buttonStyle(ControlButtonStyle(color: .green))
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                    command("STOP", "stop.fill", .orange, .stop)
                    command("PAUSE", "pause.fill", .yellow, .pause)
                    command("RESUME", "playpause.fill", .blue, .resume)
                    command("PREVIOUS", "backward.end.fill", .indigo, .previous)
                    command("NEXT", "forward.end.fill", .indigo, .next)
                    Button { confirmPanic = true } label: {
                        Label("PANIC", systemImage: "exclamationmark.octagon.fill").frame(maxWidth: .infinity, minHeight: 70)
                    }.buttonStyle(ControlButtonStyle(color: .red))
                }
                Button("Entrar en modo espectáculo") { model.showMode = true }
                    .buttonStyle(.borderedProminent)
            }.padding()
        }
        .navigationTitle("Control")
        .confirmationDialog("¿Detener toda la reproducción?", isPresented: $confirmPanic, titleVisibility: .visible) {
            Button("PANIC", role: .destructive) { model.execute(.panic) }
            Button("Cancelar", role: .cancel) {}
        }
    }

    private func command(_ title: String, _ symbol: String, _ color: Color, _ action: PanelCommand) -> some View {
        Button { model.execute(action) } label: {
            Label(title, systemImage: symbol).frame(maxWidth: .infinity, minHeight: 70)
        }.buttonStyle(ControlButtonStyle(color: color))
    }
}

struct ConnectionBadge: View {
    let state: ConnectionState
    var body: some View {
        Label(state.label, systemImage: state == .connected ? "checkmark.circle.fill" : "wifi.exclamationmark")
            .padding(.horizontal, 12).padding(.vertical, 7)
            .foregroundStyle(.black)
            .background(Color.white, in: Capsule())
            .overlay {
                Capsule().stroke(Color.black.opacity(0.08), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
    }
}

struct ControlButtonStyle: ButtonStyle {
    let color: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.headline).foregroundStyle(.white)
            .background(color.opacity(configuration.isPressed ? 0.65 : 1), in: RoundedRectangle(cornerRadius: 16))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}
