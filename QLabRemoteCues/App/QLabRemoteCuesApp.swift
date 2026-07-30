import SwiftUI

@main
struct QLabRemoteCuesApp: App {
    @StateObject private var model = AppViewModel()
    @State private var showingLoadingScreen = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                RootView()
                    .environmentObject(model)

                if showingLoadingScreen {
                    LoadingScreen()
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
                .task {
                    await model.start()
                    try? await Task.sleep(for: .seconds(1.6))
                    withAnimation(.easeInOut(duration: 0.4)) {
                        showingLoadingScreen = false
                    }
                }
                .onOpenURL { model.importConfiguration(from: $0) }
        }
    }
}

private struct LoadingScreen: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isAnimating = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.04, green: 0.08, blue: 0.16),
                    Color(red: 0.08, green: 0.24, blue: 0.40)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(.blue.opacity(0.20))
                .frame(width: 320, height: 320)
                .blur(radius: 45)
                .scaleEffect(isAnimating && !reduceMotion ? 1.15 : 0.9)

            VStack(spacing: 28) {
                ZStack {
                    Circle()
                        .stroke(.white.opacity(0.16), lineWidth: 7)
                        .frame(width: 116, height: 116)

                    Circle()
                        .trim(from: 0.08, to: 0.72)
                        .stroke(
                            AngularGradient(
                                colors: [.cyan, .blue, .white.opacity(0.25)],
                                center: .center
                            ),
                            style: StrokeStyle(lineWidth: 7, lineCap: .round)
                        )
                        .frame(width: 116, height: 116)
                        .rotationEffect(.degrees(isAnimating && !reduceMotion ? 360 : 0))

                    Image(systemName: "waveform")
                        .font(.system(size: 42, weight: .semibold))
                        .foregroundStyle(.white)
                        .symbolEffect(.variableColor.iterative, options: .repeating, isActive: !reduceMotion)
                        .scaleEffect(isAnimating && !reduceMotion ? 1.08 : 0.92)
                }

                VStack(spacing: 8) {
                    Text("Sala IN")
                        .font(.largeTitle.bold())
                    Text("Cargando…")
                        .font(.headline)
                        .foregroundStyle(.white.opacity(0.72))
                }
                .foregroundStyle(.white)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sala IN, cargando")
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 1.15).repeatForever(autoreverses: false)) {
                isAnimating = true
            }
        }
    }
}
