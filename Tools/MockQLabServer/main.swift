import Foundation
import Network

// Minimal standalone QLab-like UDP server for local diagnostics.
// Usage: swift run MockQLabServer
let listener = try NWListener(using: .udp, on: 53_000)
print("Mock QLab listening on UDP 53000")
listener.newConnectionHandler = { connection in
    connection.start(queue: .global())
    @Sendable func receive() {
        connection.receiveMessage { data, context, _, error in
            if let data, let address = decodeAddress(data) {
                print("← \(address)")
                let payload: String
                if address.contains("cueLists") {
                    payload = #"{"status":"ok","data":[{"uniqueID":"MOCK-1","number":"1","name":"Mock GO","type":"Audio","colorName":"green","armed":true}]}"#
                } else if address == "/version" {
                    payload = #"{"status":"ok","data":"5.mock"}"#
                } else {
                    payload = #"{"status":"ok","data":null}"#
                }
                let reply = encode(address: "/reply\(address)", string: payload)
                connection.send(content: reply, contentContext: context ?? .defaultMessage, isComplete: true, completion: .idempotent)
            }
            if error == nil { receive() }
        }
    }
    receive()
}
listener.start(queue: .main)
dispatchMain()

func decodeAddress(_ data: Data) -> String? {
    guard let end = data.firstIndex(of: 0) else { return nil }
    return String(data: data[..<end], encoding: .utf8)
}

func encode(address: String, string: String) -> Data {
    func padded(_ value: String) -> Data {
        var data = Data(value.utf8); data.append(0)
        data.append(contentsOf: repeatElement(0, count: (4 - data.count % 4) % 4))
        return data
    }
    var data = padded(address); data.append(padded(",s")); data.append(padded(string)); return data
}
