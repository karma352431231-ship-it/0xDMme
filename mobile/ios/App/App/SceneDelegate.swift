import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        do {
            try NativeDataProtection.prepare()
            window?.rootViewController = NativeBridgeViewController()
        } catch {
            let unavailable = UIViewController()
            let message = UILabel()
            message.text = "The app's private storage is unavailable. Close and reopen the app."
            message.numberOfLines = 0
            message.textAlignment = .center
            message.textColor = .label
            message.backgroundColor = .systemBackground
            unavailable.view = message
            window?.rootViewController = unavailable
        }
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        (window?.rootViewController as? NativeBridgeViewController)?.closeSession()
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        (window?.rootViewController as? NativeBridgeViewController)?.cancelFileExport()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
