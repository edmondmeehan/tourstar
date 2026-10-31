import Foundation
import Capacitor
import GameKit

/// Game Center for TourStar: sign the player in, report achievements, submit leaderboard scores,
/// and open the Game Center dashboard. Everything is optional: if the player isn't signed in to
/// Game Center, calls resolve quietly and the game carries on.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showDashboard", returnType: CAPPluginReturnPromise)
    ]

    private var pendingAuth: [CAPPluginCall] = []
    private var handlerSet = false

    private func playerInfo() -> [String: Any] {
        let p = GKLocalPlayer.local
        return ["authenticated": p.isAuthenticated, "playerId": p.isAuthenticated ? p.gamePlayerID : "", "alias": p.isAuthenticated ? p.alias : ""]
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(playerInfo())
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        if GKLocalPlayer.local.isAuthenticated { call.resolve(playerInfo()); return }
        pendingAuth.append(call)
        if handlerSet { return }
        handlerSet = true
        DispatchQueue.main.async {
            GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, error in
                guard let self = self else { return }
                if let vc = viewController {
                    // Apple's sign-in sheet. Shown once; if the player cancels, Game Center stays off.
                    self.bridge?.viewController?.present(vc, animated: true)
                    return
                }
                var info = self.playerInfo()
                if let error = error { info["error"] = error.localizedDescription }
                let calls = self.pendingAuth
                self.pendingAuth.removeAll()
                calls.forEach { $0.resolve(info) }
                self.notifyListeners("authChanged", data: info)
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["submitted": false]); return }
        guard let board = call.getString("leaderboardId"), let score = call.getInt("score") else {
            call.reject("leaderboardId and score are required"); return
        }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [board]) { error in
            if let error = error { call.resolve(["submitted": false, "error": error.localizedDescription]) }
            else { call.resolve(["submitted": true]) }
        }
    }

    @objc func reportAchievement(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["reported": false]); return }
        guard let id = call.getString("achievementId") else { call.reject("achievementId is required"); return }
        let a = GKAchievement(identifier: id)
        a.percentComplete = min(100, max(0, call.getDouble("percent") ?? 100))
        a.showsCompletionBanner = true
        GKAchievement.report([a]) { error in
            if let error = error { call.resolve(["reported": false, "error": error.localizedDescription]) }
            else { call.resolve(["reported": true]) }
        }
    }

    @objc func showDashboard(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["shown": false]); return }
        DispatchQueue.main.async {
            let vc: GKGameCenterViewController
            switch call.getString("view") {
            case "achievements": vc = GKGameCenterViewController(state: .achievements)
            case "leaderboards":
                if let id = call.getString("leaderboardId") {
                    vc = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
                } else { vc = GKGameCenterViewController(state: .leaderboards) }
            default: vc = GKGameCenterViewController(state: .dashboard)
            }
            vc.gameCenterDelegate = self
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve(["shown": true])
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
