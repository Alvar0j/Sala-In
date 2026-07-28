import Foundation

enum OSCArgument: Equatable, Sendable {
    case int(Int32), float(Float32), string(String), blob(Data)
    case bool(Bool), null, impulse
}

struct OSCMessage: Equatable, Sendable {
    var address: String
    var arguments: [OSCArgument] = []
}

enum OSCCodecError: Error, LocalizedError, Equatable {
    case invalidAddress, invalidUTF8, truncated, unsupportedType(Character), oversized

    var errorDescription: String? {
        switch self {
        case .invalidAddress: "Dirección OSC no válida."
        case .invalidUTF8: "Texto OSC no válido."
        case .truncated: "Paquete OSC incompleto."
        case .unsupportedType(let type): "Tipo OSC no soportado: \(type)."
        case .oversized: "Paquete OSC demasiado grande."
        }
    }
}

enum OSCCodec {
    static let maximumPacketSize = 65_507

    static func encode(_ message: OSCMessage) throws -> Data {
        guard message.address.first == "/", !message.address.contains("\0") else {
            throw OSCCodecError.invalidAddress
        }
        var result = padded(message.address)
        let tags = "," + message.arguments.map(\.typeTag).joined()
        result.append(padded(tags))
        for argument in message.arguments {
            switch argument {
            case .int(let value):
                append(UInt32(bitPattern: value), to: &result)
            case .float(let value):
                append(value.bitPattern, to: &result)
            case .string(let value):
                guard !value.contains("\0") else { throw OSCCodecError.invalidUTF8 }
                result.append(padded(value))
            case .blob(let data):
                guard data.count <= Int(Int32.max) else { throw OSCCodecError.oversized }
                append(UInt32(data.count), to: &result)
                result.append(data)
                result.append(contentsOf: repeatElement(0, count: padding(for: data.count)))
            case .bool, .null, .impulse:
                break
            }
        }
        guard result.count <= maximumPacketSize else { throw OSCCodecError.oversized }
        return result
    }

    static func decode(_ data: Data) throws -> OSCMessage {
        guard !data.isEmpty, data.count <= maximumPacketSize else { throw OSCCodecError.oversized }
        var cursor = 0
        let address = try readString(data, cursor: &cursor)
        guard address.first == "/" else { throw OSCCodecError.invalidAddress }
        let tags = try readString(data, cursor: &cursor)
        guard tags.first == "," else { throw OSCCodecError.truncated }
        var arguments: [OSCArgument] = []
        for tag in tags.dropFirst() {
            switch tag {
            case "i": arguments.append(.int(Int32(bitPattern: try readUInt32(data, cursor: &cursor))))
            case "f": arguments.append(.float(Float32(bitPattern: try readUInt32(data, cursor: &cursor))))
            case "s": arguments.append(.string(try readString(data, cursor: &cursor)))
            case "b":
                let count = Int(try readUInt32(data, cursor: &cursor))
                guard count >= 0, cursor + count <= data.count else { throw OSCCodecError.truncated }
                arguments.append(.blob(data.subdata(in: cursor..<(cursor + count))))
                cursor += count + padding(for: count)
                guard cursor <= data.count else { throw OSCCodecError.truncated }
            case "T": arguments.append(.bool(true))
            case "F": arguments.append(.bool(false))
            case "N": arguments.append(.null)
            case "I": arguments.append(.impulse)
            default: throw OSCCodecError.unsupportedType(tag)
            }
        }
        return OSCMessage(address: address, arguments: arguments)
    }

    private static func padded(_ string: String) -> Data {
        var data = Data(string.utf8)
        data.append(0)
        data.append(contentsOf: repeatElement(0, count: padding(for: data.count)))
        return data
    }

    private static func padding(for count: Int) -> Int { (4 - count % 4) % 4 }

    private static func append(_ value: UInt32, to data: inout Data) {
        var bigEndian = value.bigEndian
        withUnsafeBytes(of: &bigEndian) { data.append(contentsOf: $0) }
    }

    private static func readUInt32(_ data: Data, cursor: inout Int) throws -> UInt32 {
        guard cursor + 4 <= data.count else { throw OSCCodecError.truncated }
        let value = data[cursor..<(cursor + 4)].reduce(UInt32.zero) { ($0 << 8) | UInt32($1) }
        cursor += 4
        return value
    }

    private static func readString(_ data: Data, cursor: inout Int) throws -> String {
        guard cursor < data.count,
              let end = data[cursor...].firstIndex(of: 0),
              let string = String(data: data[cursor..<end], encoding: .utf8)
        else { throw OSCCodecError.invalidUTF8 }
        let length = end - cursor + 1
        cursor += length + padding(for: length)
        guard cursor <= data.count else { throw OSCCodecError.truncated }
        return string
    }
}

private extension OSCArgument {
    var typeTag: String {
        switch self {
        case .int: "i"; case .float: "f"; case .string: "s"; case .blob: "b"
        case .bool(true): "T"; case .bool(false): "F"; case .null: "N"; case .impulse: "I"
        }
    }
}
