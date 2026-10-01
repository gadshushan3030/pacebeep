import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

/// Sign-in against the PaceBeep server: the same OAuth server ChatGPT connects to. The app
/// registers itself once as a native client, signs in with PKCE in a system browser sheet, and
/// keeps the refresh token in the Keychain. The dashboard lists it under connected assistants;
/// Disconnect there signs the phone out.
@MainActor
final class Auth: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let server = URL(string: Bundle.main.object(forInfoDictionaryKey: "PaceBeepServer") as! String)!
    private static let redirect = "app.vercel.pacebeep:/oauth/callback"
    private static let resource = server.appending(path: "mcp").absoluteString

    private var accessToken: String?
    private var expiresAt = Date.distantPast
    private var session: ASWebAuthenticationSession? // kept alive while the sheet is up

    var isSignedIn: Bool { Keychain.read("refresh") != nil }

    func signIn() async throws {
        let clientId = try await registeredClient()
        let verifier = Self.randomString()
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        let state = Self.randomString()
        var url = URLComponents(url: Self.server.appending(path: "api/auth/oauth2/authorize"), resolvingAgainstBaseURL: false)!
        url.queryItems = [
            .init(name: "response_type", value: "code"), .init(name: "client_id", value: clientId),
            .init(name: "redirect_uri", value: Self.redirect), .init(name: "scope", value: "openid offline_access"),
            .init(name: "state", value: state), .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"), .init(name: "resource", value: Self.resource),
        ]
        defer { session = nil }
        let callback = try await withCheckedThrowingContinuation { (done: CheckedContinuation<URL, Error>) in
            let session = ASWebAuthenticationSession(url: url.url!, callbackURLScheme: "app.vercel.pacebeep") { url, error in
                if let url { done.resume(returning: url) } else { done.resume(throwing: error ?? URLError(.cancelled)) }
            }
            session.presentationContextProvider = self
            self.session = session
            session.start()
        }
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value else { throw URLError(.userCancelledAuthentication) }
        try await token(["grant_type": "authorization_code", "code": code, "redirect_uri": Self.redirect,
                         "client_id": clientId, "code_verifier": verifier])
    }

    func signOut() {
        Keychain.delete("refresh")
        accessToken = nil
    }

    /// Sends a request with a fresh access token; refreshes once on 401.
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        for attempt in 0..<2 {
            if accessToken == nil || Date() > expiresAt || attempt == 1 { try await refresh() }
            var r = request
            r.setValue("Bearer \(accessToken!)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await URLSession.shared.data(for: r)
            let http = response as! HTTPURLResponse
            if http.statusCode != 401 { return (data, http) }
        }
        signOut() // token rejected after a refresh: disconnected on the dashboard
        throw URLError(.userAuthenticationRequired)
    }

    private func refresh() async throws {
        guard let refresh = Keychain.read("refresh") else { throw URLError(.userAuthenticationRequired) }
        do {
            try await token(["grant_type": "refresh_token", "refresh_token": refresh, "client_id": try await registeredClient()])
        } catch let error as URLError where error.code == .userAuthenticationRequired {
            signOut()
            throw error
        }
    }

    /// Token endpoint. Refresh tokens rotate, so every response's refresh token replaces the last.
    private func token(_ form: [String: String]) async throws {
        var r = URLRequest(url: Self.server.appending(path: "api/auth/oauth2/token"))
        r.httpMethod = "POST"
        r.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let safe = CharacterSet.alphanumerics.union(.init(charactersIn: "-._~"))
        r.httpBody = form.merging(["resource": Self.resource]) { a, _ in a }
            .map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: safe)!)" }
            .joined(separator: "&").data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: r)
        let status = (response as! HTTPURLResponse).statusCode
        if (400..<500).contains(status) { throw URLError(.userAuthenticationRequired) }
        struct Tokens: Decodable { let access_token: String; let refresh_token: String?; let expires_in: Double }
        let t = try JSONDecoder().decode(Tokens.self, from: data)
        accessToken = t.access_token
        expiresAt = Date().addingTimeInterval(t.expires_in - 60)
        if let rt = t.refresh_token { Keychain.write("refresh", rt) }
    }

    /// Dynamic client registration, once per server.
    private func registeredClient() async throws -> String {
        let key = "clientId:\(Self.server.absoluteString)"
        if let id = UserDefaults.standard.string(forKey: key) { return id }
        var r = URLRequest(url: Self.server.appending(path: "api/auth/oauth2/register"))
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: [
            "client_name": "PaceBeep iPhone", "redirect_uris": [Self.redirect], "application_type": "native",
            "token_endpoint_auth_method": "none", "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
        ])
        let (data, _) = try await URLSession.shared.data(for: r)
        guard let id = (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["client_id"] as? String else {
            throw URLError(.badServerResponse)
        }
        UserDefaults.standard.set(id, forKey: key)
        return id
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }

    private static func randomString() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URL
    }
}

private extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

/// The refresh token, in the Keychain (this device only).
enum Keychain {
    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "PaceBeep", kSecAttrAccount as String: key]
    }

    static func read(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ key: String, _ value: String) {
        delete(key)
        var q = query(key)
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}
