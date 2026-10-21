import Darwin
import Foundation
import FoundationModels

private struct ChatRequest: Decodable {
    let chatId: String
    let message: String
}

private struct APIError: Encodable {
    let error: String
}

private struct ChatResponse: Encodable {
    let reply: String
}

private actor LocalModel {
    private var sessions: [String: LanguageModelSession] = [:]

    func status() -> (available: Bool, message: String) {
        switch SystemLanguageModel.default.availability {
        case .available:
            return (true, "Apple Foundation Model is ready")
        case .unavailable(.appleIntelligenceNotEnabled):
            return (false, "Turn on Apple Intelligence in macOS Settings")
        case .unavailable(.deviceNotEligible):
            return (false, "This device does not support Apple Intelligence")
        case .unavailable(.modelNotReady):
            return (false, "The model is still downloading or is not ready yet")
        case .unavailable:
            return (false, "The local model is currently unavailable")
        }
    }

    func reply(chatId: String, message: String) async throws -> String {
        let state = status()
        guard state.available else { throw LocalModelError.unavailable(state.message) }

        let session = sessions[chatId] ?? LanguageModelSession(instructions: """
            You are a helpful local assistant. Reply in the user's language, clearly and directly.
            If you are unsure, say so. Do not claim to have internet access.
            """)
        sessions[chatId] = session
        return try await session.respond(to: message).content
    }
}

private enum LocalModelError: Error, LocalizedError {
    case unavailable(String)
    var errorDescription: String? {
        if case let .unavailable(message) = self { return message }
        return "Could not get a response from the local model"
    }
}

private struct HTTPRequest {
    let method: String
    let path: String
    let body: Data
}

private let model = LocalModel()
private let maxRequestBytes = 1_000_000

private func sendAll(_ data: Data, to fd: Int32) {
    data.withUnsafeBytes { rawBuffer in
        guard let base = rawBuffer.baseAddress else { return }
        var sent = 0
        while sent < rawBuffer.count {
            let count = Darwin.send(fd, base.advanced(by: sent), rawBuffer.count - sent, 0)
            if count <= 0 { break }
            sent += count
        }
    }
}

private func response(status: String, type: String, body: Data) -> Data {
    var head = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n"
    var result = Data(head.utf8)
    result.append(body)
    head = ""
    return result
}

private func jsonResponse<T: Encodable>(status: String = "200 OK", value: T) -> Data {
    let body = (try? JSONEncoder().encode(value)) ?? Data("{}".utf8)
    return response(status: status, type: "application/json; charset=utf-8", body: body)
}

private func readRequest(from fd: Int32) -> HTTPRequest? {
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 8192)
    var headerEnd: Range<Data.Index>?
    var contentLength = 0

    while data.count < maxRequestBytes {
        let count = Darwin.recv(fd, &buffer, buffer.count, 0)
        if count <= 0 { return nil }
        data.append(contentsOf: buffer[..<count])

        if headerEnd == nil,
           let range = data.range(of: Data("\r\n\r\n".utf8)) {
            headerEnd = range
            let header = String(decoding: data[..<range.lowerBound], as: UTF8.self)
            let lines = header.components(separatedBy: "\r\n")
            let lengthLine = lines.first { $0.lowercased().hasPrefix("content-length:") }
            contentLength = lengthLine.flatMap { Int($0.split(separator: ":", maxSplits: 1).last?.trimmingCharacters(in: .whitespaces) ?? "") } ?? 0
            if contentLength < 0 || contentLength > maxRequestBytes { return nil }
        }

        if let headerEnd, data.count >= headerEnd.upperBound + contentLength {
            let header = String(decoding: data[..<headerEnd.lowerBound], as: UTF8.self)
            guard let firstLine = header.components(separatedBy: "\r\n").first else { return nil }
            let parts = firstLine.split(separator: " ")
            guard parts.count >= 2 else { return nil }
            let bodyStart = headerEnd.upperBound
            return HTTPRequest(method: String(parts[0]), path: String(parts[1]), body: Data(data[bodyStart..<(bodyStart + contentLength)]))
        }
    }
    return nil
}

private func staticFile(_ path: String) -> (String, Data)? {
    let allowed: [String: (String, String)] = [
        "/": ("index.html", "text/html; charset=utf-8"),
        "/styles.css": ("styles.css", "text/css; charset=utf-8"),
        "/app.js": ("app.js", "text/javascript; charset=utf-8")
    ]
    guard let (name, type) = allowed[path],
          let url = Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "web"),
          let content = try? Data(contentsOf: url) else { return nil }
    return (type, content)
}

private func handle(_ fd: Int32) async {
    defer { Darwin.close(fd) }
    guard let request = readRequest(from: fd) else { return }

    if request.method == "GET", request.path == "/api/status" {
        let state = await model.status()
        let payload: [String: String] = ["status": state.available ? "ready" : "unavailable", "message": state.message]
        sendAll(jsonResponse(value: payload), to: fd)
        return
    }

    if request.method == "POST", request.path == "/api/chat" {
        guard let input = try? JSONDecoder().decode(ChatRequest.self, from: request.body),
              !input.chatId.isEmpty, !input.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            sendAll(jsonResponse(status: "400 Bad Request", value: APIError(error: "Provide a chatId and message text")), to: fd)
            return
        }
        do {
            let reply = try await model.reply(chatId: input.chatId, message: input.message)
            sendAll(jsonResponse(value: ChatResponse(reply: reply)), to: fd)
        } catch {
            sendAll(jsonResponse(status: "503 Service Unavailable", value: APIError(error: error.localizedDescription)), to: fd)
        }
        return
    }

    if request.method == "GET", let (type, content) = staticFile(request.path) {
        sendAll(response(status: "200 OK", type: type, body: content), to: fd)
        return
    }
    sendAll(response(status: "404 Not Found", type: "text/plain; charset=utf-8", body: Data("Not found".utf8)), to: fd)
}

private func startServer(port: UInt16 = 8787) throws -> Never {
    let server = Darwin.socket(AF_INET, SOCK_STREAM, 0)
    guard server >= 0 else { throw POSIXError(.EIO) }

    var reuse: Int32 = 1
    _ = setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
    var noPipe: Int32 = 1
    _ = setsockopt(server, SOL_SOCKET, SO_NOSIGPIPE, &noPipe, socklen_t(MemoryLayout<Int32>.size))

    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = port.bigEndian
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let bound = withUnsafePointer(to: &address) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            Darwin.bind(server, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
    }
    guard bound == 0, Darwin.listen(server, 32) == 0 else {
        let code = errno
        Darwin.close(server)
        throw POSIXError(POSIXErrorCode(rawValue: code) ?? .EIO)
    }

    print("Apple FM Chat is available at http://127.0.0.1:\(port)")
    while true {
        let client = Darwin.accept(server, nil, nil)
        if client < 0 { continue }
        var clientNoPipe: Int32 = 1
        _ = setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &clientNoPipe, socklen_t(MemoryLayout<Int32>.size))
        Task.detached { await handle(client) }
    }
}

do {
    try startServer()
} catch {
    fputs("Could not start server: \(error.localizedDescription)\n", stderr)
    exit(EXIT_FAILURE)
}
