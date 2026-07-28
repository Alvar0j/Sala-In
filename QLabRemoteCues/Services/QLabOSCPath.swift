import Foundation

/// QLab 5 OSC routes. This is the only source of route strings.
enum QLabOSCPath {
    static let version = "/version"
    static let workspaces = "/workspaces"
    static let updates = "/updates"
    static let alwaysReply = "/alwaysReply"
    static let udpReplyPort = "/udpReplyPort"
    static let disconnect = "/disconnect"

    static func workspace(_ id: String, _ command: String) -> String {
        "/workspace/\(escape(id))/\(command)"
    }

    static func connect(_ workspace: String) -> String { Self.workspace(workspace, "connect") }
    static func go(_ workspace: String) -> String { Self.workspace(workspace, "go") }
    static func panic(_ workspace: String) -> String { Self.workspace(workspace, "panic") }
    static func stop(_ workspace: String) -> String { Self.workspace(workspace, "stop") }
    static func pause(_ workspace: String) -> String { Self.workspace(workspace, "pause") }
    static func resume(_ workspace: String) -> String { Self.workspace(workspace, "resume") }
    static func previous(_ workspace: String) -> String { Self.workspace(workspace, "previous") }
    static func next(_ workspace: String) -> String { Self.workspace(workspace, "next") }
    static func cueLists(_ workspace: String) -> String { Self.workspace(workspace, "cueLists/shallow") }
    static func running(_ workspace: String) -> String { Self.workspace(workspace, "runningOrPausedCues/shallow") }
    static func cue(_ id: String, _ action: String, workspace: String?) -> String {
        let route = "/cue_id/\(escape(id))/\(action)"
        guard let workspace, !workspace.isEmpty else { return route }
        return "/workspace/\(escape(workspace))\(route)"
    }

    static func escape(_ component: String) -> String {
        component.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")) ?? component
    }
}
