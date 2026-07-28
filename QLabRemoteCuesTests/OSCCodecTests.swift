import XCTest
@testable import QLabRemoteCues

final class OSCCodecTests: XCTestCase {
    func testRoundTripAllSupportedTypes() throws {
        let message = OSCMessage(address: "/test", arguments: [
            .int(-42), .float(3.5), .string("teatro"), .blob(Data([1, 2, 3])),
            .bool(true), .bool(false), .null, .impulse
        ])
        XCTAssertEqual(try OSCCodec.decode(OSCCodec.encode(message)), message)
    }

    func testKnownGoPacket() throws {
        let data = try OSCCodec.encode(OSCMessage(address: "/go"))
        XCTAssertEqual(data, Data([47, 103, 111, 0, 44, 0, 0, 0]))
    }

    func testMalformedPacketIsRejected() {
        XCTAssertThrowsError(try OSCCodec.decode(Data([47, 103, 111])))
        XCTAssertThrowsError(try OSCCodec.decode(Data(repeating: 1, count: OSCCodec.maximumPacketSize + 1)))
    }
}
