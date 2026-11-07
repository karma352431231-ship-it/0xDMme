import Foundation
import UIKit
import WebKit

/** Main-thread owner of one explicit packaged-page Blob export. Owns download,
 * deadline, protected temporary copy and picker disposal. It has no network
 * session, cookies, product keys or access to a chosen destination's contents.
 */
@MainActor
final class NativeFileExport: NSObject, WKDownloadDelegate, UIDocumentPickerDelegate {
    private final class Export {
        let download: WKDownload
        var stage: NativeFileExportStorage.Stage?
        var picker: UIDocumentPickerViewController?
        var timer: DispatchWorkItem?
        var finishing = false
        init(_ download: WKDownload) { self.download = download }
    }
    private weak var view: WKWebView?
    private weak var presenter: UIViewController?
    private let storage = NativeFileExportStorage()
    private var active: Export?
    private var closed = false
    private var cleanupFailed = false

    init(_ view: WKWebView, presenter: UIViewController) {
        self.view = view; self.presenter = presenter
        super.init()
        do { try storage.prepare() }
        catch { cleanupFailed = true }
    }

    static func localBlob(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "blob" && url.absoluteString.hasPrefix("blob:capacitor://localhost/") &&
            !url.absoluteString.contains("#") && !url.absoluteString.contains("?")
    }

    private func authorized(_ frame: WKFrameInfo) -> Bool {
        let origin = frame.securityOrigin
        return frame.isMainFrame && origin.protocol == "capacitor" && origin.host == "localhost" && origin.port == 0 &&
            view?.url?.scheme == "capacitor" && view?.url?.host == "localhost" && view?.url?.port == nil
    }

    func policy(_ action: WKNavigationAction) -> WKNavigationActionPolicy? {
        guard action.shouldPerformDownload else { return nil }
        guard !closed, !cleanupFailed, active == nil, authorized(action.sourceFrame), Self.localBlob(action.request.url) else {
            notice("The file cannot be saved right now. Close any open file picker and try again.")
            return .cancel
        }
        return .download
    }

    func begin(_ download: WKDownload, action: WKNavigationAction) {
        guard !closed, !cleanupFailed, active == nil, download.webView === view,
              authorized(action.sourceFrame), Self.localBlob(action.request.url),
              download.originalRequest?.url == action.request.url else {
            download.cancel { _ in }
            return
        }
        let value = Export(download)
        active = value
        download.delegate = self
        deadline(value, seconds: 180)
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        guard let value = active, value.download === download, !value.finishing, value.stage == nil else { completionHandler(nil); return }
        do {
            let stage = try storage.create(suggestedFilename: suggestedFilename)
            value.stage = stage
            completionHandler(stage.file)
        } catch {
            completionHandler(nil)
            cancel()
            notice("The app could not prepare private temporary storage for this file.")
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let value = active, value.download === download, !value.finishing, let stage = value.stage else { return }
        do {
            try stage.protectCompletedFile()
            guard let presenter, presenter.presentedViewController == nil, presenter.view.window != nil else { throw NativeFailure.unavailable }
            let picker = UIDocumentPickerViewController(forExporting: [stage.file], asCopy: true)
            value.picker = picker
            picker.delegate = self
            deadline(value, seconds: 600)
            presenter.present(picker, animated: true)
        } catch {
            finish(value)
            notice("The file could not be offered for saving. Please try again.")
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        guard let value = active, value.download === download, !value.finishing else { return }
        finish(value)
        notice("The file download failed. Please try again.")
    }

    func download(_ download: WKDownload, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, decisionHandler: @escaping (WKDownload.RedirectPolicy) -> Void) { decisionHandler(.cancel) }
    func download(_ download: WKDownload, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) { completionHandler(.cancelAuthenticationChallenge, nil) }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let value = active, value.picker === controller else { return }
        finish(value)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let value = active, value.picker === controller else { return }
        // The provider owns the selected external copy. Do not inspect its URL,
        // read the saved data, or remove that user-selected copy.
        finish(value)
    }

    private func deadline(_ value: Export, seconds: Double) {
        value.timer?.cancel()
        let timer = DispatchWorkItem { [weak self, weak value] in
            guard let self, let value, self.active === value else { return }
            self.cancel()
            self.notice("The file-saving operation expired. Please try again.")
        }
        value.timer = timer
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: timer)
    }

    func cancel() {
        guard let value = active, !value.finishing else { return }
        value.finishing = true
        value.timer?.cancel(); value.timer = nil
        value.picker?.dismiss(animated: false)
        if value.picker != nil { finish(value); return }
        value.download.cancel { [weak self] _ in
            DispatchQueue.main.async {
                if let self { self.finish(value) }
                else {
                    do { try value.stage?.remove() }
                    catch { NSLog("0xDMme could not remove a temporary file export.") }
                }
            }
        }
    }

    private func finish(_ value: Export) {
        guard active === value else { return }
        value.timer?.cancel(); value.timer = nil
        value.picker?.delegate = nil
        do { try value.stage?.remove() }
        catch {
            cleanupFailed = true
            notice("Temporary file cleanup failed. Close and reopen the app before saving another file.")
        }
        active = nil
    }

    func close() { closed = true; cancel() }

    private func notice(_ message: String) {
        guard !closed, let presenter, presenter.presentedViewController == nil, presenter.view.window != nil else { return }
        let alert = UIAlertController(title: "Save file", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        presenter.present(alert, animated: true)
    }
}
