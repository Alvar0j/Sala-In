import SwiftUI

struct CueListView: View {
    @EnvironmentObject private var model: AppViewModel
    @ObservedObject private var qlab: QLabService
    @State private var search = ""

    init(qlab: QLabService) { _qlab = ObservedObject(wrappedValue: qlab) }

    var body: some View {
        List(filtered) { cue in
            Button { model.execute(.cueStart(cue.id)) } label: {
                HStack(spacing: 12) {
                    Image(systemName: cue.isRunning ? "waveform.circle.fill" : "circle")
                        .foregroundStyle(cue.isRunning ? .green : .secondary)
                    VStack(alignment: .leading) {
                        Text("\(cue.number)  \(cue.name)").font(.headline)
                        Text("\(cue.type)\(cue.armed ? "" : " · Desarmado")").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if cue.isActive { Text("ACTIVO").font(.caption.bold()).accessibilityLabel("Cue activo") }
                }.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .contextMenu {
                Button("Lanzar") { model.execute(.cueStart(cue.id)) }
                Button("Pausar") { model.execute(.cuePause(cue.id)) }
                Button("Reanudar") { model.execute(.cueResume(cue.id)) }
                Button("Detener", role: .destructive) { model.execute(.cueStop(cue.id)) }
            }
        }
        .overlay { if qlab.cues.isEmpty { ContentUnavailableView("Sin cues", systemImage: "list.bullet", description: Text("Conecta con QLab y actualiza la lista.")) } }
        .searchable(text: $search, prompt: "Nombre o número")
        .refreshable { try? await qlab.refreshCues() }
        .navigationTitle("Cues")
        .toolbar { Button { Task { try? await qlab.refreshCues() } } label: { Image(systemName: "arrow.clockwise") } }
    }

    private var filtered: [QLabCue] {
        search.isEmpty ? qlab.cues : qlab.cues.filter {
            $0.name.localizedCaseInsensitiveContains(search) || $0.number.localizedCaseInsensitiveContains(search)
        }
    }
}
