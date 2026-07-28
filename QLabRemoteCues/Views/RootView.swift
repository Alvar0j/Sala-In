import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case demos = "Demos", constellation = "Constellation", connection = "Conexión", log = "Registro"
    var id: Self { self }
    var symbol: String {
        switch self {
        case .demos: "sparkles.rectangle.stack"
        case .constellation: "point.3.connected.trianglepath.dotted"
        case .connection: "network"
        case .log: "text.alignleft"
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppViewModel
    @State private var section: AppSection? = .demos

    var body: some View {
        Group {
            if model.showMode {
                ShowModeView()
            } else if UIDevice.current.userInterfaceIdiom == .pad {
                NavigationSplitView {
                    List(AppSection.allCases, selection: $section) { item in
                        Label(item.rawValue, systemImage: item.symbol).tag(item)
                    }
                    .navigationTitle("QLab Remote Cues")
                } detail: { destination(section ?? .demos) }
            } else {
                TabView {
                    ForEach(AppSection.allCases) { item in
                        NavigationStack { destination(item) }
                            .tabItem { Label(item.rawValue, systemImage: item.symbol) }
                    }
                }
            }
        }
        .alert("Aviso", isPresented: Binding(get: { model.lastError != nil },
                                             set: { if !$0 { model.lastError = nil } })) {
            Button("Aceptar") { model.lastError = nil }
        } message: { Text(model.lastError ?? "") }
    }

    @ViewBuilder private func destination(_ item: AppSection) -> some View {
        switch item {
        case .demos: DemosView(runner: model.demoRunner, qlab: model.qlab)
        case .constellation: ConstellationView(qlab: model.qlab)
        case .connection: ConnectionView(discovery: model.discovery, qlab: model.qlab)
        case .log: ActivityLogView(qlab: model.qlab)
        }
    }
}
