import SwiftUI

struct ShowModeView: View {
    @EnvironmentObject private var model: AppViewModel
    @State private var confirmExit = false
    @State private var confirmPanic = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 18) {
                HStack {
                    ConnectionBadge(state: model.qlab.state).foregroundStyle(.white)
                    Spacer()
                    Button { confirmExit = true } label: { Image(systemName: "lock.fill").font(.title2) }
                }
                Button { model.execute(.go) } label: {
                    Label("GO", systemImage: "play.fill").font(.system(size: 60, weight: .black))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }.buttonStyle(ControlButtonStyle(color: .green))
                HStack {
                    Button { model.execute(.stop) } label: { Label("STOP", systemImage: "stop.fill").frame(maxWidth: .infinity, minHeight: 100) }
                        .buttonStyle(ControlButtonStyle(color: .orange))
                    Button { confirmPanic = true } label: { Label("PANIC", systemImage: "exclamationmark.octagon.fill").frame(maxWidth: .infinity, minHeight: 100) }
                        .buttonStyle(ControlButtonStyle(color: .red))
                }
            }.padding()
        }
        .persistentSystemOverlays(.hidden)
        .confirmationDialog("Salir del modo espectáculo", isPresented: $confirmExit) {
            Button("Desbloquear y salir") { model.showMode = false }
            Button("Cancelar", role: .cancel) {}
        }
        .confirmationDialog("¿PANIC?", isPresented: $confirmPanic) {
            Button("Detener todo", role: .destructive) { model.execute(.panic) }
            Button("Cancelar", role: .cancel) {}
        }
        .onAppear { model.keepAwake = true }
        .onDisappear { model.keepAwake = false }
    }
}
