import SwiftUI

@main
struct QLabRemoteCuesApp: App {
    @StateObject private var model = AppViewModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .task { await model.start() }
                .onOpenURL { model.importConfiguration(from: $0) }
        }
    }
}
