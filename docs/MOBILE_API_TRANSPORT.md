# 0xDMme installed API transport contract

Updated: 2026-11-03. The client adapter and guarded Android/iOS HTTPS/private-cookie
owners are implemented locally. Android has observed synthetic session and
policy/custody results; iPhone source compiles but its current simulator execution
is blocked. A signed private full-product artifact is now installed on an
authorized physical iPhone; its functional results are tracked separately.
Full security/flow acceptance, wallet apps, physical coverage and
release readiness remain open. See the flow matrix for the exact tested scope.

The owner clarified that browser flows cannot substitute for installed-app
acceptance. Integration now prepares the complete product UI through a separate
installed entry. `installed-runtime` owns the bounded message channel and entry
lifecycle; `mobile-entry` only composes bootstrap with the existing product.
Recovery has its own entry in its responsible module. Domain modules cannot
initialize this runtime; the dependency rule and quality-gate fixture enforce it.
The shared frontend asset producer owns compilation/source inventory; web/native
publishers own separate directories and manifests. Packaged HTML uses the same
CSP source as web responses, preserving the existing opt-in media destinations.
No PWA worker is registered by the installed product.

Android implementation uses OkHttp **5.5.1**, pinned with dependency locking.
The official upstream README/changelog identifies this release; its Maven Central
POM and upstream license declare Apache-2.0. The artifact POM declares
Kotlin stdlib 2.1.21; Gradle selected 2.2.21 with Okio 3.18.1 and AndroidX
annotation/startup. Their exact POM licenses were inspected. There is no paid
service, external resolver or relay added. Exact resolved native inventory,
notices and runtime checks remain to complete before distribution. Apache-2.0
does not itself require changing the currently effective authored-code GPL-3.0;
the custom source-license draft remains unadopted.

References: [upstream release history](https://github.com/square/okhttp/blob/master/CHANGELOG.md),
[upstream requirements and release](https://github.com/square/okhttp/blob/master/README.md),
[artifact POM](https://repo.maven.apache.org/maven2/com/squareup/okhttp3/okhttp-android/5.5.1/okhttp-android-5.5.1.pom),
[upstream license](https://github.com/square/okhttp/blob/master/LICENSE.txt).

## Ownership and integration

`src/client/api-transport/` owns the single installed-transport registration and
request dispatch. Web builds pass the exact path/options to the existing browser
`fetch`. Installed builds require one native initialization; absence or failure
never falls back to a browser request against the local asset origin. The native
entry must retain its transport instance and close it when its bridge is disposed.
This is entry-point lifecycle work, not account-screen responsibility.

`src/client/native-api/` adapts a narrow `NativeSessionBridge` to ordinary streaming
`Response` objects. Its transport owns admission/shutdown; each exchange owns its
native handle, pending read, timers and abort listeners. Pure protocol validation
stays separate from lifecycle ownership. Domain modules cannot import this native
implementation directly; the restriction is enforced in dependency-cruiser and
its quality-gate tests.

`api-response` retains coarse HTTP/JSON/error diagnostics. Account, messages,
vault, contacts and calls continue to use their existing API/signature contracts.
Public media, public view receipts and the local GIF configuration request now
use the same API dispatch boundary while preserving their original credentials
options. External GIF searches, approved external media, packaged assets, lab
requests and PWA cache fetches keep their existing owners. No global fetch patch,
server admission change, CSRF relaxation or cookie-name migration is included.

### Native owners (local implementation; acceptance in progress)

Android separates `NativePolicy`, `NativeExchange`, `NativeSession`,
`NativeSessionChannel` and `EncryptedCookieStore`/`NativeCookies`. One bounded
process registry owns the cookie jar across overlapping Activity disposal and
creation. It holds only the three token slots; each operation still checks OS
unlock, and all persistent writes use the nonexportable AndroidKeyStore key.
The channel admits only the packaged main frame, verifies the immutable document
nonce in the current WebView and guards navigation generations and late replies.
No legacy JavaScript-interface fallback carries the private API.

iOS uses equivalent validation/response, streaming-exchange, serial-session,
frame-channel and private-cookie owners. Native navigation observation forwards
Capacitor's existing optional delegate methods. Keychain items use
WhenUnlockedThisDeviceOnly without synchronization; an excluded private install
marker prevents adopting orphaned tokens after reinstall. A separate data
protection owner excludes Library/WebKit data from backup and applies Complete
protection before the product WebView is created. These iPhone policies now have targeted physical filesystem and
account/session evidence. Locked-state, reinstall, actual OS backup/restore and
adversarial custody acceptance remain separate.

The JSON wire carries UTF-8 bodies as canonical base64, preserving signed bytes.
The native channel bounds 24 pending replies and 22,420,000 admitted wire
characters; native HTTP bounds eight exchanges and 16,800,000 aggregate request
bytes. Android serializes disposal with socket reads. iOS uses a demand-driven
suspended URLSession task and an explicit 256 KiB delivered-data buffer ceiling;
burst overflow fails explicitly. The native sessions own independent deadlines,
cancellation and cleanup. iOS also retains URLSession's seven-day resource limit;
that connection failure must be handled by the existing live-client reconnect
owner and never expires accepted messages. Large-response/backpressure and
long-running native acceptance remain pending.

Normal builds contain no synthetic signer, fixture CA or endpoint asset. An
explicit private Android debug overlay and iOS `DEBUG && MOBILE_SYNTHETIC_TEST`
build can select an explicit TLS fixture, with a dedicated trusted CA and ordinary
hostname checks. Release composition has no override. All server origin/signature/
CSRF/device checks stay active against the canonical identity. This is test
composition, never a production authentication bypass.

For the owner's authorized physical-device continuation, the explicit iOS test
configuration also accepts a literal RFC1918 IPv4 destination on ports
45111–45119, HTTPS and the root path only. `NativeSyntheticEndpoint` owns this
immutable validation; it performs no DNS, Keychain or network operation. A
physical marker additionally requires an exact 64-hex admission token. The
existing `NativeSession` adds that token to native requests only in the flagged
test build. JavaScript cannot supply it through the request-header allowlist.
Normal builds retain the canonical service with no endpoint/token asset.

The fixture-only `native-physical-admission` module wraps exactly one checked,
owned HTTP handler. It rejects missing/invalid tokens before product handling,
removes the extra token before delegation and retains the existing server's
timeouts, socket budgets and shutdown ownership. The private composition binds
one explicit private Mac address and adapts its admitted authority to the
canonical logical origin. Real challenge/signature, cookies, device
authorization and encryption remain active. The physical fixture uses a pinned
private v3 CA with strict chain/hostname validation, without a device-wide trust
installation. Network coordinates, credentials and detailed evidence stay in
`.local/`.

## Request and response protocol

The bridge exposes only three asynchronous operations:

| Operation | Input                                                                                                                                       | Result and lifetime                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `open`    | A fresh request UUID, canonical relative API path, `GET`/`HEAD`/`POST`, `same-origin`/`omit`, reviewed headers and optional UTF-8 JSON body | Unknown input is validated as HTTP status and a small response-header map. Native work remains owned by that UUID.                  |
| `read`    | The UUID and maximum decoded chunk bytes                                                                                                    | Canonical base64 data plus a boolean `done`. No empty nonterminal chunks. EOF releases the native handle.                           |
| `cancel`  | The UUID                                                                                                                                    | Idempotently stop native work and release its buffers/task. It must be safe before headers and after an already completed exchange. |

The native implementation fixes the TLS service destination to
`https://0xdmme.app`, port 443. It must independently validate every bridge input;
TypeScript types and client validation do not authorize native work. Callers
cannot provide an absolute URL, host, origin, cookie, authorization header,
redirect policy or arbitrary network destination. Relative paths are limited to
the existing account, communities, public profiles and public media namespaces.
Canonicalization rejects traversal, encoded path delimiters, fragments, controls
and ambiguous slashes. Existing percent-encoded query values remain usable.

The allowed caller headers are JSON Content-Type, the existing CSRF value and
the existing attachment/vault UUID headers. Native code must generate the fixed
Host/Origin transport context and maintain the same server-side authorization;
it must not add a trusted-client bypass. HTTP redirects are rejected before
another request is made. Use the platform's normal TLS chain/hostname validation,
without accepting invalid certificates or enabling cleartext transport.

Responses expose only Content-Type, Content-Length, Cache-Control and Retry-After.
Unknown fields, Set-Cookie, Location, URLs, private metadata and malformed values
are rejected by the client adapter. Native code consumes cookies internally and
returns only that safe response schema. Exceptions crossing the bridge are
replaced with a fixed failure message, without a URL, response body or native
exception description. HTTP errors retain status/type and follow existing
diagnostic handling; mutations are never retried by this transport.

The native HTTP owner must preserve decoded byte counts, especially for public
media validation. Request identity encoding or explicitly normalize/review any
decompression; never report a compressed Content-Length for different decoded
bytes. This requirement is still to be exercised against the actual native APIs.

## Budgets, streaming and cancellation

- At most eight exchanges are admitted, including headers pending, unread bodies
  and cancellation awaiting acknowledgment. No unbounded waiting queue is added.
- Request bodies are bounded to 8,400,000 UTF-8 bytes, matching the largest current
  account HTTP body budget. Caller headers and API paths are separately bounded.
- Ordinary reads request at most 32 KiB of decoded data. The existing live-message
  route requests at most 4 KiB, matching `WakeupFrames`' current input contract.
  One read runs at a time, only when a consumer requests it; the stream has no
  speculative chunk queue. The native owner must enforce its own bounded buffers
  and backpressure rather than buffering an entire response behind this API.
- Ordinary responses have a 256 MiB cumulative ceiling, with early rejection of
  larger declared lengths and failure on extra or missing declared bytes. This
  covers the current 16-item message page even at the largest transport body
  budget, and the current 25 MB public video result. These are transport resource
  budgets, not changes to product quotas. Full parity and real native memory/
  throughput acceptance still need validation before release.
- The exact live-message route with event-stream Content-Type has no cumulative
  lifetime byte ceiling; it still has bounded chunks and the existing caller
  watchdog. An endless live connection does not accumulate its previous chunks.
- Opening headers and individual reads each have a 15-second bridge deadline.
  Unconsumed bodies expire after 30 seconds. These deadlines supplement caller
  cancellation/timeouts; the client does not impose an overall actively consumed stream lifetime.
  The native URLSession resource limit is stated above. Native tasks need independent time/resource limits for cases where
  JavaScript is suspended or destroyed.
- EOF, consumer cancel, caller abort, timeout, invalid response and shutdown all
  remove timers/listeners and release the exchange. Cancel has a one-second
  acknowledgment budget. If native disposal fails or does not acknowledge, the
  transport instance closes and refuses further work; it does not accumulate
  replacement requests. Initialization cannot silently replace the failed owner.
- Late replies are observed to avoid unhandled promise rejections, but cannot
  revive a closed stream or produce a successful read after cancellation.

## Required native security boundary

The native owner must bind every operation to the allowed installed **main
document**, not merely to a currently displayed URL or a JavaScript-supplied
origin. Foreign/nested frames, remote navigation and stale document callbacks
must not gain access to the private session. Scope request identifiers to that
document lifetime; invalidate its tasks when the document/bridge is replaced.
Cancellation before headers must prevent late replies from recreating a closed
request or installing cookies for an abandoned request.

Inspection of the exact installed Capacitor 8.6.0 source found Android's modern
WebMessage listener checks `isMainFrame`, but also has legacy JavaScript-interface
fallbacks. The iOS generic message dispatcher does not itself expose a main-frame
authorization check to a plugin call. Therefore registering a generic Capacitor
HTTP plugin is not proof of the required frame boundary. Implement and verify a
guarded native message channel, including fallback/navigation handling, before
connecting product sessions. This is an implementation requirement, not a proven
inability of either OS or an approved exclusion of older devices. Report any
demonstrated support conflict under the existing repository rules.

## Private session custody

Native HTTPS/cookie state must have a dedicated owner rather than use
`HTTPCookieStorage.shared`, Android's global CookieHandler or the WebView cookie
manager. The three existing account cookies are `__Host-hash-talk-session`,
`__Host-hash-talk-challenge` and `__Host-hash-talk-return`. The browser-only approval
cookie is not a new native credential. Validate names, values, Secure/HttpOnly,
host-only scope, root path and expiry against the current server contract.
`credentials: 'omit'` must neither attach nor retain session cookies; this
preserves anonymous public media/view requests.

Use reviewed platform facilities for device-only, app-private persistent custody.
Do not expose cookie read/export operations to JavaScript, user backups or logs.
Review concurrent challenge/login/logout responses so an abandoned reply cannot
overwrite a newer session, resurrect logged-out state or renew a revoked cookie.
Server authorization remains authoritative; client-side cookie removal does not
replace server logout/revocation. Apply existing server expiry, never a longer
client-created lifetime. Missing/corrupt/unavailable secret storage must fail
explicitly rather than restore an empty or shared session and report success.

Complete iOS backup/data-protection policy and verify Android backup exclusions,
updates, reinstall and OS suspension before loading real account state. Controlled client replies do not certify native custody. Four separate Android
instrumentation cases cover policy, encrypted persistence, supersession, OS key
nonexportability, corruption and fragment-only navigation; broader native frame/TLS/stream adversarial
acceptance remains pending. Six isolated physical iPhone cases subsequently
passed actual Keychain/install-marker, cookie supersession/validation and real
HTTPS 401/EOF controls, using dedicated synthetic identifiers. Ordinary account
namespaces were preserved. Full-product session restoration also passed
separately. Locked-device, actual OS backup/restore and broader adversarial
acceptance remain open; see the [flow matrix](MOBILE_FLOW_TEST_MATRIX.md).

## Installed startup readiness budget

The installed channel owns a monotonic 30-second readiness deadline, at most 120
serial `hello` calls and a 250 ms delay after an explicit `false` response. Each
reply has a deadline of at most 15 seconds, clipped to the remaining startup
budget. Only the literal `true` completes readiness; native denial, invalid data,
reply timeout, channel closure or budget exhaustion rejects startup. These are
side-effect-free readiness polls, not retries of HTTP mutations. Existing frame,
document nonce, origin and native secret-custody checks are unchanged.

A real iPhone saved-session run exhausted the former 100 short polls while the
native cookie owner was still initializing. Private timing evidence showed the
protected worker eventually completed successfully with the device unlocked.
A focused regression rejected valid readiness after fifteen seconds before the
change and passed afterward. Separate cases bound polling and preserve immediate
native-denial failure. Native restoration acceptance remains separate from these
client contract checks and is recorded in the [flow matrix](MOBILE_FLOW_TEST_MATRIX.md).

## Validation and next integration

Client tests cover canonical paths, header/body trust boundaries, anonymous
credentials, unchanged signed JSON, HTTP errors, streaming with the real wakeup
parser, chunk/length failures, abort and late replies, deadlines, unread cleanup,
admission, shutdown and failed cancellation. Installed-mode tests compile the
actual dispatch/diagnostic modules and verify missing-native and failed-native
paths never use browser HTTP. Web behavior remains tested through the same
existing fetch mocks.

The 2026-11-02 increment passed 517 application tests plus lint, strict types,
dependency boundaries, formatting and web/mobile builds. Package checks against
the fresh mobile artifact and native synchronization passed. Existing deployment/
evaluation suites were unaffected and were not repeated. Final structural review
confirmed that domain rules/state remain in their existing owners while dispatch,
admission and exchange lifecycles have explicit separate owners.

Complete native acceptance and validate the full handshake/key opening with
synthetic accounts on both OSes before marking O07 complete. Then exercise original-wallet opening/
return, linking/recovery, a real encrypted message exchange, persistence and the
remaining full-parity matrix. Toolchain setup/physical access and release gates
remain outstanding. See the [runtime record](MOBILE_RUNTIME_FEASIBILITY.md) and
[living handoff](MOBILE_APP_DECISIONS_AND_PLAN.md).

Official references inspected on 2026-11-02:

- [Capacitor iOS implementation](https://capacitorjs.com/docs/plugins/tutorial/ios-implementation)
- [Capacitor Android implementation](https://capacitorjs.com/docs/plugins/tutorial/android-implementation)
- [Apple URLSession streaming](<https://developer.apple.com/documentation/foundation/urlsession/bytes(for:delegate:)>)
- [Android HTTPS connection](https://developer.android.com/reference/javax/net/ssl/HttpsURLConnection)

The first Android build exposed a compile-tool prerequisite: OkHttp's Android
5.5.1 artifact requires compile SDK 37. Toolchain compatibility is being validated
with the official AGP 9.1.1/Gradle 9.3.1 combination and SDK 37. The target SDK 36,
minimum API 24 and Capacitor 8.6.0 remain explicit; a build-tool update alone does
not establish runtime/device compatibility. No AAR check is suppressed and no
older security release is silently substituted.

The current Android run passed four native policy/cookie/document cases,
including a regression for an early fragment-only route change before first
commit. The native document owner ignores only URL fragments when comparing
that commit with the current document; origin, scheme, path, query, main-frame,
nonce and generation checks remain enforced. The installed pair also passed
actual encrypted text and recipient receipts in both directions; this is
reopened-app delivery, not foreground live-push acceptance.

An explicit private debug composition can report at most 32 fixed failure
phases, exception classes, six source locations and one cause class. Exception
messages, URLs, request/response values, credentials, account identifiers and
secrets are excluded. Normal and release compositions use the observer-free
constructor. Test observation does not add transport retries, browser fallback,
an unbounded queue or new service destinations.

## iPhone foreground custody initialization

The native session owns protected-cookie initialization and publishes its result
on its existing serial state queue. That blocking Keychain operation runs off the
main thread at `userInitiated` priority because foreground app entry depends on
it. The previous `utility` scheduling was intended for work that does not prevent
active app use; see [Apple's QoS contract](https://developer.apple.com/documentation/Dispatch/DispatchQoS/userInitiated).
Only this startup operation changes priority. Custody, request authorization,
lifecycle cleanup and the existing readiness deadline keep their contracts. The
perceived latency effect and restored-account behavior require actual native
validation; scheduling semantics alone do not establish a fixed platform cause.

## Physical startup protection regression

On the authorized physical target, initialization stopped before the native
product controller was created. The isolated diagnosis identified a permission
error while excluding the OS-managed dyld loader cache from backup. Apple
documents this loader's cached launch metadata in its
[dyld policy](https://github.com/apple-oss-distributions/dyld/blob/main/doc/PrebuiltLoaderSet_Policy.md).
This is distinct from the earlier simulator Keychain/readiness failures.

`NativeDataProtection` retains ownership of the existing storage policy. Its
local correction excludes only the exact system code-cache subtree from its
attribute-mutation walk, after canonicalizing the trusted Library root. Library
backup exclusion, Complete protection for all other app data, symbolic-link
rejection and fail-closed errors remain in force. No WebKit, identity or cookie
store is exempted. `SceneDelegate` also uses system background/text colors so its
storage-unavailable message remains readable in either appearance. Native
filesystem regression and subsequent functional results must be recorded in the
flow matrix before accepting the correction.

## Private cross-installation test handoffs

The explicit physical fixture's direct driver coordinates existing public-DOM
feature actions; those feature modules retain their own visible assertions. It
does not import product controllers, storage or server modules. Existing
dependency rules now also cover the output policy. Each action returns to the
profile so the native observer can independently recheck document identity,
original synthetic wallet, private readiness, foreground phone view and cookie
isolation. A passed action adds a seventeenth check for its guarded result file.

`native-product-output` selects only the metadata required by the next synthetic
installation: canonical invitations, public community routes, accepted UUIDs or
an observed pin boolean. It discards ordinary action text. The private Swift
output owner independently validates that narrow shape and owns at most 16
result files of at most 4096 bytes, with Complete protection and backup exclusion.
Files use the current run UUID in an app-owned cache directory. The host copies
only that known file from the exact synthetic app container after verifying the
app process stopped. No decrypted messages, private profile names, keys or cookie
values enter result logs. Invitation capabilities and identity/network metadata
remain private in `.local/`.

This observer/output composition belongs only to private test projects; normal
native source/project membership is unchanged. Pure JS/Swift rejection tests and
actual physical result-store tests verify allowed formats, rejection of content
and other origins, path traversal, bounded file count and protection metadata.
The tests do not replace each feature's actual installed-App acceptance.

The private real-gesture executor uses one explicitly selected XCTest UI case at
a time and only the two synthetic app identifiers. A separate noninteractive
synthetic status label carries boolean observations to that executor. Background
acceptance requires actual Home/background/activation transitions and independent
native lifecycle notifications. The observer owns and cancels its notification
tokens and deadlines. Microphone capture/playback require real accessible-button
gestures; a JavaScript click does not establish user-gesture acceptance. The
private-conversation recorder's existing touch contract is hold-to-record or
double-tap for hands-free capture. The fixture does not change that product rule.

Six physical custody/HTTP cases used an explicit minimal private host, a byte-
identical cookie owner and a store copy whose only substitutions were two
synthetic namespace/install-marker names. Exact reverse substitution verified
that boundary. The control host did not start product account/UI services. Cases
covered stale response/logout ordering, cookie admission, real Keychain
accessibility and backup metadata, malformed/missing/expired records, orphaned
install protection and a live HTTPS 401/EOF response. Ordinary account namespaces
were untouched. After these and the offline-probe controls, the full recovery App
with the normal store/transport source was restored and its exact old private
profile and attachment contents passed again. These are bounded contracts,
separate from locked-device and actual OS backup/restore acceptance.

## iOS file export ownership

`NativeFileExport` owns one explicit main-packaged-document Blob download and its
native copy/export picker. The navigation guard delegates only actual download
actions to it and preserves Capacitor's ordinary external-navigation behavior.
The export owner revalidates the source frame and local Blob URL, refuses network
redirects/authentication challenges and owns cancellation, 180-second download
and 600-second picker deadlines. Background, document navigation and app closure
cancel the operation. It owns no API session, cookie or product account key.

`NativeFileExportStorage` owns only the app's bounded temporary export namespace:
Complete protection, backup exclusion, safe filenames, UUID staging directories,
symlink rejection and cleanup of abandoned stages on initialization. Picker
completion/cancellation disposes the temporary copy. The external copy belongs to
the document provider and is never inspected or deleted by the exporter. Normal
Info.plist does not enable app Documents sharing; a temporary private UI fixture's
known-folder hook and file-sharing flags are removed from manual product builds.

Four actual physical cases verified product presentation/exact staged bytes and
cancellation plus origin/storage/security rules. A separate physical UI Save
gesture passed; saved-copy bytes and a full OS-selected import/send/receive flow
remain manual. Three separate actual WebView frame/document cases verified
main-frame admission and rejection across iframe/origin/nonce/navigation changes.
These results add no transport/authentication fallback or remote push capability.
