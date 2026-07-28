import SwiftUI

struct ActivityLogView: View {
    @EnvironmentObject private var model: AppViewModel
    @ObservedObject private var qlab: QLabService
    private let formatter = DateFormatter()

    init(qlab: QLabService) {
        _qlab = ObservedObject(wrappedValue: qlab)
        formatter.dateFormat = "HH:mm:ss.SSS"
    }

    var body: some View {
        List(qlab.activity) { entry in
            HStack(alignment: .top) {
                Text(formatter.string(from: entry.date)).monospacedDigit().foregroundStyle(.secondary)
                Text(entry.direction).bold()
                VStack(alignment: .leading) { Text(entry.message).textSelection(.enabled); Text(entry.result).font(.caption).foregroundStyle(.secondary) }
            }.font(.caption)
        }
        .navigationTitle("Registro")
        .toolbar {
            Button {
                UIPasteboard.general.string = qlab.activity.map {
                    "\(formatter.string(from: $0.date)) \($0.direction) \($0.message) \($0.result)"
                }.joined(separator: "\n")
            } label: { Label("Copiar", systemImage: "doc.on.doc") }
        }
    }
}
