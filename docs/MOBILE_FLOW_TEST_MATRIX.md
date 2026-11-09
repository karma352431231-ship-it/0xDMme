# 0xDMme mobile flow validation

## Current-source iPhone delivery — 2026-11-04

Ordinary Wallet build 7 was installed and launched without uninstall/reset from
`codex/mobile-current-web`, based on refreshed GitHub main `af321b34` (2026-11-01).
The previous physical/synthetic records below used `20d8fe09` and do not accept
this newer source. Test A/Test B remain on their prior builds and isolated service.

132 affected tests and 10 isolated group integration tests passed. Types, boundaries,
localization, dependency licenses, web/mobile builds, Android native-policy Java
compilation and strict iPhone signature/source/asset checks passed. The initial
aggregate had failures/cancellations before correction; only the affected set was
rerun successfully. No fresh aggregate/remote CI pass is claimed. The new native
safe-area XCTest is prepared, not executed. Real wallet signing/return/private
opening and visual safe-area acceptance remain manual. Automatic native return is
not implemented by this correction; original address confirmation stays required.

UI continuation: build 5 includes dirty-only profile confirmation, removal of the
public-profile external-media control, theme-colored iPhone system areas, bottom
background coverage and an inline phone emoji panel with a typing arrow and up to
32 device-only recent emoji. Strict signature/source/asset checks passed; 60
affected tests and 15 synthetic browser assertions passed. The prepared native
viewport/theme XCTest cases and physical keyboard/safe-area checks remain pending.
Shared UI code `95bff979`, with the test-contract update in final main
`b6ecc92c`, passed exact CI and was activated through the existing staging command.
Public asset/source verification, preservation and canonical health passed. This
does not publish the native foundation or accept all prior mobile flows.

Updated: 2026-11-04. Work branch: `codex/mobile-complete-flow-validation`.

The current continuation uses an authorized physical iPhone. Installed-App
passes now include login, cold session restoration, profile/preferences/theme
persistence, in-place update, contact consent, private messages/edits/replies,
exact-byte attachments, two-way groups, status, communities, public DMs, local
search, privacy settings, encrypted backup, pin persistence, block/unblock/renewed
consent and persistent logout with original-account return.

The real-gesture/background executor initially stopped at device UI automation
authorization. After the owner checked the device, one actual background/foreground
UI test passed with all 18 native/UI checks. Actual microphone capture, encrypted public-DM voice delivery and independent
recipient playback subsequently passed. Fresh original-account/profile/history/
attachment recovery also passed. After the owner-performed restart, the original
profile and prior message identity were verified. Earlier startup, login deadlines,
immediate group-title waits and simulator failures remain recorded; later passes
do not erase them. This is not complete mobile/security or store acceptance.

## Authorized scope

The owner subsequently selected manual takeover, including real wallets. Use the
[manual checklist](MOBILE_MANUAL_TEST_CHECKLIST.md) for the remaining interactions.
Do not mark its pending items passed until the owner's observed results arrive.

The owner explicitly clarified that browser workflows are not Android/iPhone
acceptance. The installed Android test artifact now contains the full product and its guarded
native HTTPS/session owner. iPhone physical results are recorded separately above.
The earlier simulator login pass and subsequent restoration failure remain historical
evidence. Each flow needs its own observed result in the actual installed platform
runtime. Browser results below
are complementary and must never be presented as equivalent mobile or tablet
tests. Prerequisite implementation remains authorized on this task branch.

The owner authorized completing the test flows, recording results as they pass,
and making prerequisite code changes on a separate branch. Main-branch integration
is excluded. The owner explicitly authorized continued work after context
compaction for this task, superseding the repository's default compaction pause
for this run. Real MetaMask, Phantom and Backpack interaction is deferred to the
owner's manual validation. No purchase, release enrollment, VPS activation or
change to another project's services is authorized by this test work.

Use new synthetic identities and isolated local databases/object stores. Follow
the real challenge/signature, device authorization and encryption contracts;
synthetic signers must not introduce a production authentication bypass. Keep
keys, credentials, device/network inventory and detailed logs exclusively in
`.local/`. Do not report a mocked reply or a backend-only result as native UI
acceptance.

## Result terminology

- **Passed — native:** observed in the installed app's actual platform runtime.
- **Passed — integration:** real application services and an isolated database.
- **Passed — web UI:** the assembled browser app with real services and synthetic
  challenge/signature providers; this does not establish installed-app behavior.
- **Passed — unit/contract:** the stated boundary/rule, without assembled native UI.
- **Failed — native:** an observed installed-app contract did not hold; subsequent
  fixes or other passes do not erase that result.
- **Pending:** planned and not yet executed for this run.
- **Blocked:** concrete missing implementation, credential or external prerequisite.
- **Manual:** reserved for the owner, with reproduction steps to be recorded.

## Physical iPhone continuation — 2026-11-03

| Check                                            | Result                                                        | Scope and limits                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physical platform prerequisite                   | Passed — preparation                                          | Developer Mode, wired pairing and development signing are available. Inventory and signing metadata remain private.                                                                                                                                                                                                         |
| Full private product artifact                    | Passed — native build/install                                 | Ordinary product JavaScript is byte-identical to the normal mobile build. The signed App-only artifact has no XCTest plugin and its profile includes Complete file protection. Installation alone is not authentication acceptance.                                                                                         |
| Isolated HTTPS fixture                           | Passed — live transport prerequisite                          | Strict certificate/hostname validation and real HTTPS admission returned 403 without the native token, 200 for the admitted canonical origin and 403 for an invalid origin. No device-wide CA installation or trust bypass.                                                                                                 |
| Physical launch                                  | Passed — interface after correction; initial failure retained | The OS protection regression passed after the narrow code-cache fix. The owner confirmed the actual product interface now appears. This does not establish authentication.                                                                                                                                                  |
| Synthetic login, process restoration and profile | Passed — native physical; earlier failures retained           | Login, cold restoration, profile/preferences save and restoration all passed with 16 independent native/UI checks per phase. Four distinct real processes were verified and stopped. White theme persisted and original navy was restored. Earlier simulator restoration and physical UI-deadline failures remain recorded. |
| Current cross-account parity                     | Passed — listed physical flows                                | Contacts, messages/edits/replies/receipt, exact attachments, groups, status, communities, public DMs, backup, local search, pin/privacy, block/renewed consent and logout passed individually. See the execution record below for limits and retained failures.                                                             |
| Background/foreground continuity                 | Passed — native physical                                      | One actual XCTest UI case used Home, verified the background state, activated the app and passed all 18 native checks for lifecycle and original private account continuity. Earlier automation initialization failure remains recorded. Microphone/audio tests are separate.                                               |
| Actual microphone and public-DM voice            | Passed — native physical                                      | Real double-tap private capture and cancellation passed. A real public-DM recording was encrypted and accepted; the independent installation confirmed the same voice identity/duration and actual playback progress after a native tap. Acoustic quality and OS interruption variants remain separate.                     |
| Fresh original-account recovery                  | Passed — native physical after restart                        | No local data was copied into the new container. Exact old profile/preferences/theme, cold session restore, old message identity, existing group, full encrypted backup and exact prior attachment bytes/identity passed. Earlier network-unavailable failures remain recorded.                                             |
| Owner-performed physical reboot persistence      | Passed — bounded physical observation                         | Owner confirmed the authorized restart; original account/profile/preferences/theme and an earlier encrypted message with the same identity passed afterward. No independent kernel boot-ID comparison or locked-before-first-unlock result.                                                                                 |

The black-screen diagnosis found a separate startup regression: the storage walk
tried to change backup attributes on the OS-owned loader code cache and received
a permission error. The exact code-cache subtree is now excluded from that
mutation walk; root Library exclusion and Complete protection for every other
app data entry remain mandatory. A real physical XCTest reproduced the failure
before the fix. Afterward, **eight physical XCTest cases passed, zero skipped or
failed**: the filesystem regression, four native transport contracts and three
endpoint contracts. The filesystem case verified repeatable preparation,
backup-exclusion metadata, Complete protection, preserved bytes and an untouched
symlink target in the app's own temporary directory. This does not establish a
full device-backup/restore pass. The subsequent installed-App login, cold restoration and profile phases passed
separately as recorded above. Temporary startup/path diagnostic prints were
removed; the explicit observer retains only bounded boolean progress reports.

The original fixture certificate was rejected by strict validation because it
lacked required CA/authority extensions. A separate private v3 CA/leaf pair was
created with explicit constraints and key usage; strict chain and live HTTPS
validation passed. Only the physical private app resource was updated before
signing. Original simulator certificates, accounts and data were preserved.

Complementary verification passed: seven pure Swift XCTest cases on macOS
(four transport and three endpoint-validation cases), two real-HTTP admission
cases, 26 quality-gate cases, strict TypeScript, focused lint and dependency
boundaries. The normal non-synthetic iPhone App also compiled after the endpoint
changes. These checks do not establish physical functional acceptance.

## Historical installed product results

| Flow                                                     | Android                           | iPhone                            | Evidence and limits                                                                                                                                                                                            |
| -------------------------------------------------------- | --------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full product packaged and installed                      | Passed — native                   | Passed — native installation      | Full package and native host installed/opened. iPhone shared entry failed its connection initialization before account UI; installation does not establish login or session acceptance.                        |
| Packaged entry and native connection initialization      | Passed — native                   | Passed once; intermittent failure | The installed iPhone entry reached the actual account/private UI during accepted login. Earlier cold startup and subsequent saved-session startup failed; the cause remains under investigation.               |
| Synthetic EVM authentication and private opening         | Passed — native                   | Passed — native                   | Real synthetic challenge/signature, device authorization and private profile opening passed on both installed platforms. Real wallet-app interaction remains manual.                                           |
| Activity/WebView recreation and process restoration      | Passed — native                   | Failed — native restoration       | Android recreation/restoration passed. iPhone login passed in one host process, which was verified stopped; another host process failed at native-entry startup. No restored-session pass.                     |
| Session cookies inaccessible to WebView                  | Passed — native                   | Passed — native during login      | The iPhone executed login test checked document.cookie before authentication and after private opening; it stayed empty. Its separate restoration remains failed.                                              |
| Native request/cookie/document guards                    | Passed — native contract          | Blocked                           | Four instrumentation cases cover UTF-8, scope, supersession, encrypted cookie custody, corruption and initial fragment-only navigation. Real HTTPS 401/EOF also passed.                                        |
| Encrypted private name/preferences and theme             | Passed — native                   | Blocked                           | Saved and reopened private data; white theme restored and original navy restored.                                                                                                                              |
| Existing installation version update                     | Passed — native                   | Blocked                           | Sender version code 2 to 3 preserved encrypted profile/preferences and original local authority.                                                                                                               |
| Original-wallet recovery in a fresh installation         | Passed — native                   | Blocked                           | The same original account and prior encrypted profile/preferences recovered with real signatures. No replacement account.                                                                                      |
| Canonical invitation, request and explicit approval      | Passed — native                   | Blocked                           | Independent synthetic accounts and ordinary canonical invitation; no URL translation or protocol-record insertion.                                                                                             |
| Conversation initialization and encrypted text both ways | Passed — native                   | Blocked                           | Independent recipient decryption preserved the exact accepted message identities.                                                                                                                              |
| Actual delivery/read receipts                            | Passed — native                   | Blocked                           | Real independently opened recipients; foreground live push is separate.                                                                                                                                        |
| Message edit and quoted reply                            | Passed — native                   | Blocked                           | Edit retained the original visible identity; the other installation decrypted the edit and quote/reply.                                                                                                        |
| Original attachment transfer and recovery                | Passed — native                   | Blocked                           | Previously accepted encrypted attachment recovered in the fresh peer installation, same message identity and exact source-byte comparison. OS picker/save is separate.                                         |
| Existing group and messages both ways                    | Passed — native                   | Blocked                           | Both existing members opened the same group and independently decrypted new messages with matching identities.                                                                                                 |
| Text status and public handles                           | Passed — native                   | Blocked                           | Other account read the text status; public handles created with links-only external-media consent.                                                                                                             |
| Community creation/follow/post/read/vote/reply           | Passed — native                   | Blocked                           | The existing community and post were reused; independent reader, confirmed score change, accepted reply and other-account read all passed.                                                                     |
| Public DMs, local search and conversation organization   | Passed — native                   | Blocked                           | Explicit public-DM consent and encrypted messages both ways; actual local search; pin persistence and original setting restoration.                                                                            |
| Complete encrypted backup and truncated-file rejection   | Passed — native                   | Blocked                           | Actual complete product archive imported; truncated copy rejected with cleanup disabled. OS saving remains separate.                                                                                           |
| Logout and return to the same original account           | Passed — native                   | Blocked                           | Logout remained effective after Activity recreation; real login reopened the same original private profile and authority.                                                                                      |
| Contact privacy persistence and background/foreground    | Passed — native                   | Blocked                           | Request visibility persisted across a new process, then invitation-only mode restored. Actual CREATED/RESUMED transition retained account authority/profile.                                                   |
| Native microphone permission and public-DM voice         | Passed — native; emulated capture | Blocked                           | Actual OS prompt, real touch, nonempty emulated recording, encrypted send and independent recipient playback with same identity/duration. Physical audio quality and private-DM recovery path remain separate. |
| Bounded local durability comparison                      | Passed — native; limited          | Blocked                           | With emulator guest flush honored: six process-stop/reopen cycles plus a verified guest-kernel reboot preserved the sender authority/private profile. No general physical durability claim.                    |
| Earlier local-authority loss                             | Failed — unresolved cause         | Blocked                           | Explicit WebView LevelDB corruption in two installations. Earlier passes and the bounded comparison do not erase the failure.                                                                                  |
| Partial-local-loss recovery in the original installation | Failed — native                   | Blocked                           | Login device ID survived missing key/root; immutable registered-device rules correctly rejected a mismatching recreated identity. Fresh-install recovery is a separate pass.                                   |

The historical table immediately above records phone-emulator observations. The two app
IDs isolate independent synthetic accounts in actual installed packages. Product
JavaScript in acceptance builds matches the ordinary compiled script byte for
byte; private signers, public-DOM drivers and bounded metadata observations are
separate test fixtures. That historical table makes no physical-device or
store-release claim; current physical results are recorded separately above.

## Historical feasibility lifecycle and storage

| Flow                                                 | Android               | iPhone                | Evidence and limits                                                                                 |
| ---------------------------------------------------- | --------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| Native build and packaged asset integrity            | Passed — native build | Passed — native build | Historical five-asset feasibility builds; full product packaging is recorded above.                 |
| Synthetic crypto fixture creation and verification   | Passed — native       | Passed — native       | Web Locks, nonextractable WebCrypto device keys and Matrix WASM encryption.                         |
| Restore after app-process termination                | Passed — native       | Passed — native       | Android force-stop verified no surviving process; iOS asserted notRunning before relaunch.          |
| Native activity/WebView recreation                   | Passed — native       | Pending               | Android instrumentation recreated the actual activity/WebView.                                      |
| Background/foreground continuity                     | Passed — native       | Pending               | Requires preserved fixture and explicit lifecycle transitions.                                      |
| Restore after virtual OS reboot                      | Passed — native       | Pending               | Confirm an actual OS restart, not merely an app reload.                                             |
| Preserve fixture through in-place app version update | Passed — native       | Pending               | Validate unchanged-schema upgrade; does not establish future migration compatibility.               |
| Corruption, expiry and explicit synthetic cleanup    | Passed — native       | Pending               | Android rejected each negative record, then explicitly cleared it and verified a new valid fixture. |
| Physical-device durability/backup protection         | Pending               | Pending               | Simulators do not close physical acceptance or secret-custody policy.                               |

## Historical product flow layers

This archived inventory predates the physical iPhone continuation. At that
checkpoint, synthetic iPhone login/private opening had passed once and saved-session
restoration had failed at native-entry initialization. The blocked iPhone entries
below describe that earlier checkpoint, not the current physical results. Consult
the physical table and execution records for subsequent individual passes and
retained failures. The remaining prerequisites below are the current open inventory.

| Area                                                        | Unit/contract                     | Database/service integration                          | Full native UI                                                                                            | Next evidence                                                               |
| ----------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Login/session, identity separation, logout                  | Prior checks passed               | Passed — integration                                  | Android session subset passed; remaining native flows pending                                             | Synthetic signer with the real challenge/signature flow.                    |
| Device enrollment/linking/revocation/recovery               | Prior checks passed               | Passed — integration                                  | Android new-install wallet recovery passed; other device flows pending; iPhone blocked                    | Authorization failures and preserved account identity.                      |
| Private profile and preferences                             | Regression checks passed          | Passed — integration                                  | Android save/restoration and theme passed; iPhone blocked                                                 | Locked/revoked states and the older inconsistent fixture remain unresolved. |
| Contacts, block/unblock and permissions                     | Prior checks passed               | Passed — integration                                  | Android invitation/approval, block/unblock/new approval and privacy persistence passed; iPhone blocked    | Remaining native negative variants and physical behavior.                   |
| Encrypted private messages and live delivery                | Prior checks passed               | Passed — integration                                  | Android two-way text/edit/quote/receipts passed; live acceptance pending; iPhone blocked                  | Cancellation, reconnect and foreground live delivery.                       |
| Attachments, vault/history and recovery                     | Prior checks passed               | Passed — integration                                  | Android exact-byte attachment recovery and full encrypted backup/import/truncation passed; iPhone blocked | OS saving, physical durability and additional limit variants.               |
| Groups and signed authorization                             | Prior checks passed               | Passed — integration                                  | Android group creation/membership and two-way messages passed; iPhone blocked                             | Membership removal, ordering and limits.                                    |
| Status and media                                            | Prior checks passed               | Passed — integration                                  | Android text status passed; remaining media pending; iPhone blocked                                       | Media visibility, authorized delivery and validation.                       |
| Public profiles, social DMs and relationships               | Prior checks passed               | Passed — integration                                  | Android handles/links-only consent and approved encrypted DMs both ways passed; iPhone blocked            | Remaining public relationship/block variants.                               |
| Communities, posts/replies, interactions and views          | Prior checks passed               | Passed — integration                                  | Android creation/follow/post/read/vote/reply passed; iPhone blocked                                       | Remaining media, pagination, moderation and physical variants.              |
| Moderation/ranking and maintenance                          | Prior checks passed               | Passed — integration                                  | Pending applicable client flows                                                                           | Synthetic media and bounded background work.                                |
| Representatives and delegated authority                     | Prior checks passed               | Passed — integration                                  | Pending                                                                                                   | Real external proof/cost prerequisites remain separate.                     |
| Call signaling and WebRTC media                             | Prior checks passed               | Passed — integration                                  | Pending                                                                                                   | Distinguish signaling from actual audio/video connectivity.                 |
| Notifications/push and OS wakeup                            | Prior checks passed               | Pending applicable integration                        | Pending                                                                                                   | APNs/Android credentials and physical behavior need their own evidence.     |
| Native API framing, cancellation and private-cookie custody | Client contract passed            | Android native contract subset passed; iPhone blocked | Frame/TLS/stream adversarial acceptance pending                                                           | Strict origin/frame, TLS, cookie and lifecycle checks.                      |
| MetaMask, Phantom, Backpack app interaction                 | Synthetic signature coverage only | Applicable auth contracts                             | Manual                                                                                                    | Owner performs real wallet-app flows later.                                 |

## Assembled web UI with synthetic signers

These checks use the existing full browser application and isolated local
services. They are additional evidence for shared functionality; installed-app
session, device and wallet acceptance remains separate.

| Flow                                   | Result                    | Observed evidence                                                                                                                              |
| -------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Two independent EVM accounts           | Passed — web UI           | Genuine challenges/signatures and authorized initial device opening.                                                                           |
| Contact invitation and approval        | Passed — web UI           | Sender requested, recipient explicitly accepted, both saw the approved contact. Foreign-origin invitation rejected.                            |
| Bidirectional encrypted messages       | Passed — web UI           | Both visible plaintexts restored on the correct recipients; received-and-preserved receipts shown.                                             |
| Edit and quoted reply                  | Passed — web UI           | Recipient saw the edited content and edit marker; quoted response referenced the edited original.                                              |
| Encrypted attachment delivery and save | Passed — web UI           | Recipient decrypted and explicitly saved a synthetic text file; downloaded bytes exactly matched the source.                                   |
| Session/profile persistence            | Passed — web UI           | Existing session, private name and backup reminder restored after reload.                                                                      |
| Local appearance preference            | Passed — web UI           | White theme remained selected after reload; test restored the original blue theme.                                                             |
| Public profile/community workflows     | Passed — web UI           | Created two handles, community, post and reply; following and the other account's vote were observed. Participation required a public profile. |
| Native/full wallet-app UI              | Manual / blocked as above | No real wallet app is certified by a synthetic provider.                                                                                       |

## Owner's manual wallet acceptance

Use an authorized normal development installation with dedicated test wallets and
test data. Never use the private synthetic overlay for this checklist: its fake
providers cannot certify a real wallet app. Repeat for MetaMask, Phantom and
Backpack, on both platforms, for the ecosystems already offered by the approved
product configuration.

1. Start from a closed app and wallet, select the wallet, inspect the access
   statement/domain, sign and return to the same installed app/account.
2. Repeat with both apps already open; cancel/refuse a signature and verify clear
   failure, no unintended login and no stale approval after reopening.
3. Confirm explicit private opening, then terminate/reopen the installed app and
   verify the saved profile/preferences and an existing encrypted conversation.
4. Select a different test identity and verify account separation. Return to the
   original identity without merging private data or retaining an obsolete request.
5. Exercise the approved new-device linking/original-wallet recovery flow,
   verify the same account/history, then test revoked-device rejection.

Record wallet/OS/build versions and private screenshots/logs outside Git. Public
documentation should retain only the scenario, result and concrete limitation.

## Consolidated execution record

Detailed commands, credentials, device inventory, snapshots and logs remain in
ignored private task storage. The record below consolidates earlier incremental
entries without converting failed/blocked attempts into passes.

| Stage                              | Observed result and correction                                                                                                                                                                                                                                                                                                                                | Remaining limit                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated database/services         | 193 integration tests in 28 top-level groups passed, with real synthetic-media processing; zero failed/skipped.                                                                                                                                                                                                                                               | Backend results do not establish native UI.                                                                                                                                                                                                                                                       |
| Historical native laboratory       | Android crypto, activity/process/background, actual guest reboot, version update, expiry/corruption rejection and cleanup passed. One iPhone crypto/process-restoration/cleanup run passed.                                                                                                                                                                   | The laboratory is separate from the full product.                                                                                                                                                                                                                                                 |
| Assembled browser workflows        | Real synthetic signing, encrypted opening/contact/message/edit/reply/file/status/public/backup/offline/reconnect cases passed. Browser-only paired invitation origins were translated between isolated hosts, retaining the token.                                                                                                                            | Native invitation tests used the canonical origin without translation. Browser results remain complementary.                                                                                                                                                                                      |
| Full product integration           | Complete packaged assets, native HTTPS/session ownership and canonical service identity implemented. Android installed and exercised; iPhone product/app-hosted tests compile.                                                                                                                                                                                | iPhone runtime has not passed.                                                                                                                                                                                                                                                                    |
| Native shutdown race               | Initial product testing exposed concurrent stream disposal; reads/disposal are now serialized and one process registry owns the private cookie jar. Login/recreation/process restoration then passed.                                                                                                                                                         | Physical custody/lifecycle and full adversarial acceptance remain separate.                                                                                                                                                                                                                       |
| Native wire/custody                | Four Android policy/cookie/document cases and real native HTTPS 401/EOF passed; WebView cookies remained empty. UTF-8/signed payloads preserved.                                                                                                                                                                                                              | Real hostile-frame/TLS combinations still need assembled platform tests.                                                                                                                                                                                                                          |
| Verified private opening           | A connected identity panel was insufficient; the harness now also requires actual private opening. Profile/preferences/theme, same-wallet fresh-install recovery and a version 2-to-3 update passed.                                                                                                                                                          | Fresh-install recovery does not repair partial local loss.                                                                                                                                                                                                                                        |
| Pending authority refresh          | A failing regression reproduced premature clearing of verified device state. The existing owner now preserves its last verified snapshot while pending, publishes a complete replacement, and clears on verified failure/revocation. Sixteen focused cases passed.                                                                                            | This does not recreate a lost key/root or relax immutable device rules.                                                                                                                                                                                                                           |
| New group invalidation             | An integration regression reproduced fresh-group creation interrupting its own completion. Creation now emits an ordinary change; existing membership changes still invalidate authorization. Five group integration cases passed; native membership and two-way messages later passed.                                                                       | Native removal/revocation variants retain their own coverage.                                                                                                                                                                                                                                     |
| Conversation driver readiness      | Editable drafts, early route markup and an early contact label were incorrectly treated as send/readiness signals. Drivers now wait for the mounted route, enabled commands and loaded conversation history. Text/edit/quote/file/search/pin cases passed afterward.                                                                                          | Product guards were preserved.                                                                                                                                                                                                                                                                    |
| Actual native encrypted features   | Independent installed accounts passed private text both ways, matching message identities, actual recipient receipts, edit/quote, exact original attachment recovery, two-way existing-group messages and text status.                                                                                                                                        | Reopened-recipient delivery is not foreground live-push or physical OS acceptance.                                                                                                                                                                                                                |
| Public identity and consent        | Existing public handles used links-only media consent. Public DM request exposed no free composer before independent approval; encrypted text then passed both ways. Community creation and independent following passed.                                                                                                                                     | Post/reply/vote continuation remains pending the corrected control ownership and healthy runtime.                                                                                                                                                                                                 |
| Contact/privacy/organization       | Request visibility persisted then returned to invitation-only. Pin persisted and original setting was restored. Existing block appeared with no approved access; unblocking required a new invitation/request/explicit approval.                                                                                                                              | No block or account reset was used to skip consent.                                                                                                                                                                                                                                               |
| Native backup                      | Actual complete encrypted archive generated/imported. Truncated copy rejected with destructive cleanup disabled. No reset requested.                                                                                                                                                                                                                          | OS file chooser/save and exported filesystem copy are separate.                                                                                                                                                                                                                                   |
| Native background/logout           | Actual CREATED/RESUMED transition retained authority/private profile. Logout survived recreation; genuine login restored the original account/profile.                                                                                                                                                                                                        | Physical suspension and OS recovery remain separate.                                                                                                                                                                                                                                              |
| Repeated local storage loss        | Two installations reported LevelDB corruption, missing pinned root/key and a recreated identity that mismatched the persisted registered device ID. Immutable validation correctly rejected private opening. Strict durability hints alone did not solve it.                                                                                                  | Failed partial-loss recovery and general durability remain unresolved. No storage replacement or identity relaxation was adopted.                                                                                                                                                                 |
| Storage environment comparison     | Frozen evidence preserved. Offline container check found no container errors, which does not check the internal filesystem/LevelDB. Halted QMP queries proved guest flush was ignored by default and honored by the isolated comparison. Six process-stop/reopen cycles plus verified guest-kernel reboot preserved the sender afterward.                     | This is a proven environment gap and a bounded pass, not a proven corruption cause or physical guarantee. [QEMU cache policy](https://www.qemu.org/docs/master/system/qemu-manpage.html).                                                                                                         |
| Local database write interruption  | Community creation reached a prolonged DataFileExtend wait, then OS-cancelled write. Two stopped-cluster files had macOS dataless flags. The full stopped cluster was copied/byte-verified to private local temporary storage, with zero target dataless files; original preserved. Temporary writes and native community creation then passed.               | No application schema/retention/auth rule changed. [Apple's dataless-file explanation](https://developer.apple.com/documentation/technotes/tn3150-getting-ready-for-data-less-files).                                                                                                             |
| Newly created community/DM buttons | Enabled controls could drop clicks while their owner was busy. Scoped factories now inherit the owner's busy state; creation/follow/public-DM cases passed. The parent coordinator later proved to be overwriting post-owned controls. Its registry now controls only its own connected buttons; post shell recreation preserves the post owner's busy state. | Native posting and reply regressions passed. Post loading now restores each control’s prior semantic disabled state; two regression cases cover unavailable replies and rebuilt views.                                                                                                            |
| Android media permission           | Ready recorder failed with permission denied. A separate native owner now guards known resources/local document+origin, actual OS grants, deadline, cancellation and late-result safety. Four native permission contracts passed.                                                                                                                             | The later isolated native run passed the actual OS prompt, nonempty emulated recording, encrypted public-DM send and independent recipient playback. Physical quality and the separate private-DM recovery path remain pending/failed as recorded above.                                          |
| Android runtime interruption       | One voice continuation stopped at initial session timeout. A later attempt displayed an actual System UI ANR. The software-renderer comparison also failed the new actual-window-focus prerequisite before acting. Evidence preserved; no passes inferred.                                                                                                    | Same-device retries stopped; a fresh isolated AVD comparison recovers the same original accounts with genuine signatures, preserving prior devices. [Android graphics troubleshooting](https://developer.android.com/studio/run/emulator-troubleshooting).                                        |
| iPhone environment                 | App-hosted preparation, direct installation and minimal UIKit diagnostic did not execute product assertions. Fresh isolated warm boot reached its 600-second deadline in CloudRecentsMigrator. Task devices stopped and data preserved; a narrowly verified current-user CoreSimulator service recovery had not resolved installation.                        | The owner subsequently restarted the host. System migration completed; the full native host installed/opened. A local-copy build resolved a location-dependent project-read wait. The first nonempty product test failed before login; earlier deadlines and zero-test selection remain recorded. |

## Verification and review

After the shared readiness fix, lint, strict types, dependency boundaries,
license/format checks, web/mobile/evaluation builds and **532 application tests**
passed. The aggregate attempt then selected the host's old Python and failed two
tooling cases. Only the Python layers were rerun with the installed supported
Python: **164 deployment-tool tests** and **16 evaluation tests** passed. All
required layers passed; that aggregate attempt is not reported as exit zero.
The earlier complete `npm run check` had passed with 529 application cases before
this increment. The latest native Android v10 app/test builds also
passed; a focused installed run completed reply/read and actual emulated voice
capture/encrypted send/recipient playback with no failing case.

An earlier aggregate attempt failed an old startup fixture that intercepted the
new pure platform contract. The fixture was corrected to load the real contract
and now covers installed-product suppression of browser PWA updates. The final
aggregate pass above supersedes that check failure without erasing its diagnosis.
The isolated integration suite separately passed 193 cases in 28 top-level groups.
Neither these earlier service tests nor native compilation substitute for the
subsequent observed physical iPhone results or the remaining platform cases.

No remote CI, commit, merge, push, deployment, complete physical/security
acceptance, license adoption or store release is claimed by these local results.

The shared UI fixes retain operation state in the existing feature owners. The
community coordinator tracks only its own command controls and releases detached
nodes/on leave; posts keep their own busy state. A dedicated `PostControls` owner uses weak references to restore each existing semantic disabled state after loading and clears on leave; two regression tests cover unavailable replies and rebuilt views. The native media owner contains
permission state/result/deadline disposal; the activity only composes it with
Capacitor. Test Blob observations are bounded and restore the original platform
property; signers/actions/CA overrides remain outside ordinary/release assets.
The larger community/settings coordinators retain preexisting coupling. A focused
follow-up can move metadata/photo draft and object-URL lifecycle into a community
settings view owner, then narrow directory coordination; route-generation,
cancellation and draft preservation need the community/DM/native regressions.
This task does not add that unrelated extraction or new application-context bags.

## Remaining acceptance prerequisites

| Pending area                                            | Concrete prerequisite or next check                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Android private-conversation voice after fresh recovery | The earlier Android recovery retained a gated conversation and unavailable private voice control. Preserve that failure. The later iPhone original-message/attachment recovery passes and public-DM voice acceptance do not close that distinct Android case.                                                                                                |
| Original partial-local-loss recovery                    | Establish the storage-loss cause and review any necessary storage/recovery approach before changing identity or secret custody. Current failed installations remain preserved.                                                                                                                                                                               |
| OS media/files                                          | Actual iPhone microphone capture/encrypted send/playback, camera lifecycle and optical QR passed. Native export presentation/cancellation/security and an OS Save gesture passed. Saved external bytes, full OS-selected-file send/independent receipt, photo selection, acoustic quality, headsets/interruptions and OS backup save/import remain separate. |
| Receipt and live-delivery variants                      | Delivery was observed; physical iPhone explicit read-receipt opt-in/cold persistence and the matching sender-visible read label also passed. Foreground live arrival without refresh, reconnect, cancellation and duplicate-safe retry still require their own evidence.                                                                                     |
| Calls                                                   | Configured authorized own TURN fixture plus actual native media; signaling/service tests alone do not prove audio connectivity.                                                                                                                                                                                                                              |
| Physical push/wakeup                                    | Native integration and platform credentials plus physical locked/background behavior. No provider/account purchase, enrollment or publication is inferred.                                                                                                                                                                                                   |
| Remaining iPhone platform/security cases                | Physical flows, cookie/Keychain controls, bounded durability and three actual WebView frame/document cases passed as recorded. Locked-before-first-unlock, actual OS backup/restore, remaining adversarial frame/TLS/stream and unexecuted feature variants remain open. Earlier failures stay recorded.                                                     |
| Real wallet apps                                        | Owner's manual checklist above, using a normal build and actual wallet apps.                                                                                                                                                                                                                                                                                 |
| Release readiness                                       | Complete physical support, native adversarial/security, distribution/dependency notices and signing/source obligations.                                                                                                                                                                                                                                      |

## Latest completed native regression

The same original accounts were recovered in a fresh isolated Android phone;
actual activity window focus and prior private profiles/preferences were verified.
Existing community content was reused: posting/read, vote with confirmed score,
reply and other-account reply read passed across the focused continuations.
The test host's missing-variable interruption was corrected before its public
case ran; no duplicate post or repeated accepted vote was used.

The actual Android microphone permission dialog was observed and accepted for
the explicit synthetic app. A real touch started the approved public DM recorder,
which staged a nonempty emulated recording of about two seconds, sent it through
the real encrypted media path, and rendered the accepted voice identity. The
independent installed peer matched that identity and duration, decrypted/loaded
and played the WAV; actual playback time advanced before the test paused it.
No synthetic PCM, alternate authentication or direct controller/API invocation
was used. Emulated capture/playback does not attest physical acoustic quality.

The private-DM fresh-recovery conversation still remained gated after directory
initialization with valid local authority and pending outgoing content. Its voice
attempt therefore did not reach recording. No pending content was deleted and no
identity/recovery validation was weakened. This failed path remains explicit,
separate from the passed public-DM microphone/media workflow.

## Consolidated iPhone execution — 2026-11-03

| Stage                          | Observed result                                                                                                                                                                                                                        | Acceptance effect                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-restart isolated runtimes  | Both fresh private device sets reached 240-second system-migration deadlines before minimal installation; no physical target was available.                                                                                            | Original devices/data preserved; no product-runtime pass.                                                                                                                               |
| Owner-performed host restart   | Existing dedicated phone completed migration in about 203 seconds; later boots took about nine seconds.                                                                                                                                | System preparation advanced.                                                                                                                                                            |
| Minimal UIKit fixtures         | Legacy fixture installed but launch timed out; it lacked the current SDK's required scene lifecycle. A separate corrected fixture exceeded its installation deadline.                                                                  | Diagnostic limits only; full product already uses scenes. See [Apple's requirement](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle). |
| Project-read isolation         | Original project path blocked a coordinated read; identical private local bytes passed the read and native build. Existing pinned dependency cache/revision was verified.                                                              | Location-dependent read problem established; underlying OS/file-provider cause remains unknown. No dependency/source version change.                                                    |
| First full-host execution      | Complete native host installed/opened; wrong test selector executed zero cases despite nominal executor success. Wrapper and result-bundle checks rejected it.                                                                         | Installation evidence only; selector corrected to the documented class/method form.                                                                                                     |
| Actual initial startup cases   | Nonempty cases failed at explicit connection initialization. The driver was corrected to wait for a mounted route and visible/enabled wallet-picker controls.                                                                          | Failures preserved; static shell HTML is not product readiness.                                                                                                                         |
| Synthetic authentication       | Exactly one selected native account case passed, with zero failures/skips and the required login marker.                                                                                                                               | Installed synthetic login/private opening accepted; details below.                                                                                                                      |
| New-process restoration        | Previous host process verified stopped; a different host executed and failed at native-entry startup.                                                                                                                                  | Failed restoration; original account/session data retained.                                                                                                                             |
| Availability and timing probes | Explicit synthetic Keychain write/delete, configuration and cookie-owner availability were observed. An early probe could prewarm initialization; later timing showed a valid cookie owner completing after the old short poll window. | Diagnostic availability only, not cold-login or restoration acceptance.                                                                                                                 |
| Bounded readiness correction   | Fifteen-second pending-owner regression failed before and passed after the shared-channel fix. Six channel cases passed.                                                                                                               | Contract correction accepted; native restoration still requires its own pass.                                                                                                           |
| Corrected native restoration   | One case executed for about 92 seconds and failed at the explicit startup error after long executor preparation.                                                                                                                       | Correction was insufficient to close the native failure.                                                                                                                                |
| Protected-read stage trace     | Local, non-dataless 24-byte install marker; no simulator-data redirection into the project. Saved-item query took about 72 seconds and returned OS status zero; store read completed, then the overall diagnostic hit its deadline.    | Severe platform/storage latency observed; underlying OS cause and successful restoration remain unproven.                                                                               |

A fresh isolated database and synthetic signer were used. HTTPS certificate and
hostname checks passed. Ordinary product JavaScript in accepted packages matched
the normal mobile build byte for byte. Signers, HTML/configuration and explicit
source-location observations remain private test overlays. Observation/native
stage traces are diagnostic evidence and never ordinary runtime acceptance.

The accepted account case verified the installed native controller, secure local
packaged origin, phone-sized view, native session channel, empty WebView cookies
before login and after private opening, genuine challenge/signature and device
authorization, and the private-profile state. Its result bundle contains exactly
one passed case and a native-view screenshot of the phone Profile UI. Real wallet
apps, physical behavior and store release remain separate.

The shared channel now applies a monotonic 30-second readiness budget, no more
than 120 serial polls, and a per-reply deadline clipped to the remaining budget.
Only explicit pending responses are polled again; errors still fail closed. No
HTTP mutation retries, session reset, identity relaxation or secret-custody
replacement was introduced. The [transport contract](MOBILE_API_TRANSPORT.md)
contains the exact rule. No further identical simulator attempt or deadline
increase follows the latest failed/interrupted native results.

The original installation/account, accepted screenshot, consistent database
archives and completed result bundles are preserved in private storage. The task
simulator, local HTTPS server and dedicated database are stopped. Restoration and
dependent iPhone features require a responsive native environment or an available
authorized physical target. The profile/preferences/theme scenario compiled but
did not execute. A fresh Android installed regression of the shared readiness
change also remains pending; earlier Android passes belong to their accepted build.

Final structural review: the channel retains its existing pending-call/timer
ownership; the readiness deadline introduces no shared mutable state or new
dependency. The native test driver holds a weak UIKit view, owns evaluation
deadlines/single completion, and invokes only private public-DOM fixture actions.
Scenario classes own account/profile assertions; the separate explicit diagnostic
owns its uniquely scoped synthetic Keychain probe. Protected diagnostic operations
run off UIKit's actor and are explicitly awaited. The external runner owns process
termination and nonempty result-count verification. Temporary native stage traces
were removed from task sources and the final local build. Preexisting feature
coordinator debt is unchanged by this continuation.

## Continued foreground-startup investigation

The native session's protected-cookie startup worker now uses user-initiated
scheduling off the UI thread, following [Apple's foreground-work guidance](https://developer.apple.com/documentation/Dispatch/DispatchQoS/userInitiated).
Only that startup operation changes priority. It retains the existing owner,
result publication, custody and readiness/request budgets; the scheduling
correction alone does not prove a platform-latency cause or restoration fix.

The native target compiled. The first comparison stopped at a guest process-list
query before app execution. The runner now proves the original host stopped via
its PID plus the initial simulator shutdown, then requires a different executed
host PID. A subsequent comparison hit its overall preparation deadline without
starting a case. No new restored-session pass is inferred.

A single fresh isolated iPhone was then created for a separate original-wallet
new-install/recovery comparison, preserving the existing installation. Its first
boot advanced into system Safari migration before its preparation deadline. One
bounded warm continuation resumes that preserved migration; app/network deadlines
are unchanged. This comparison and the exact original-wallet address check must
pass their own executed assertions before any result is accepted.

## Direct iPhone preparation and shared Android regression

The fresh iPhone comparison's warm continuation reported failed system migration,
even though `simctl bootstatus` returned zero. No product case ran. Future boot
gates reject that explicit failure. The existing installation/account is retained.

The new private App-only direct build compiled, ordinary product scripts matched
the normal build, and strict local signature verification passed. The original
phone booted successfully in about 27 seconds. Installation then reached its
90-second deadline before launch. A read-only bundle comparison confirmed the
new executable, HTML and plugin-free package did not replace the previous test
package. No direct observation, account restoration or profile phase passed.

During that attempt the host showed severe resource pressure, including about
5.8 GB of used swap. This is evidence of constrained execution conditions, not
proof of the underlying failure's cause. The dedicated phone was shut down;
no user application, system service or original account store was reset.
The earlier iPhone protected-read/startup failures remain open.

The local iPhone HTTPS fixture also exited on a database connection timeout while
idle between preparations. Its same-state restart passed TLS/hostname and
unauthenticated-session checks. This is recorded separately from app acceptance.
A fresh Android readiness regression uses its own database, signer and phone,
preserving all earlier Android and iPhone data. Its result must refer to the
current ordinary mobile script, rather than inheriting earlier Android passes.

Structural review of the direct fixture: the browser module owns its phase,
abort controller and timeout; existing feature drivers retain public-DOM action
ownership. The weak native observer owns one report, admission and deadline,
removes only its own handler and never reads protected storage or invokes HTTP.
Its composition hook exists only in the private project copy. Dependency-cruiser
now checks this browser entry and blocks product/Node imports; its negative and
positive quality-gate cases passed. Native runtime observation remains unexecuted
because installation stopped first.

The additional Android regression compiled as version 11 and verified the current
ordinary script bytes. Its new phone stopped at the userdata disk-space gate,
before installation or any functional case. After reproducible private iPhone
compile caches were removed, a second preflight still reported insufficient
space; it also executed no product case. The owner then redirected focus to
existing iPhone work. This extra regression is deferred, not a replacement for
or invalidation of the earlier Android results. No emulator remains active.
The extra server and the dedicated local database cluster were stopped after
consistent, validated private archives of both test databases were saved.

## Overnight iPhone parity continuation

The owner renewed the instruction to complete the Android flow inventory on
installed iPhone, excluding real-wallet interaction, and explicitly permitted
continuation after compaction. All test prerequisites stay on the task branch.
The extra Android regression is not resumed as part of this iPhone focus.

With lower initial host load and 34% free-memory reporting, the original iPhone
again completed system boot. The App-only package installation still exceeded a
240-second preparation deadline. Its client stack waited in CoreSimulator's
host-to-guest install bridge; no product code or direct observer executed. A
post-attempt byte comparison confirmed the original package remained installed.
A separate launch of that existing package, without installation, exceeded its
90-second diagnostic deadline. Both attempts preserved the original account.
These outcomes do not add a functional pass or prove a product-level cause.

The installed package's ordinary product script still matches the current normal
mobile build. This Xcode version uses Device Hub rather than the historical
Simulator.app location; Device Hub was already open, so a missing interface does
not explain the current waits. A built-in iOS application comparison is recorded
separately to assess platform launch readiness before further product attempts.

The platform comparison booted, but built-in iOS Settings did not launch within
75 seconds and no Settings process was observed. A display capture also exceeded
25 seconds. With all simulators shut down, one exact user-owned CoreSimulator
service was stopped gracefully and reconnected; all 15 device identifiers and
shutdown states were preserved. The subsequent comparison again failed during
platform preparation, including a 15-second host process-inventory timeout under
heavy load. No data was erased and no other user application was closed.

A new prerequisite check then found a concrete integrity-validation failure:
`simctl runtime verify` returned status 1 and OS error -67054 for both installed
iOS images, reporting a missing or invalid sealed resource. Both images remained
listed as Ready with unknown signature state. This proves the verification failed;
it does not identify the underlying cause or establish that every image byte is
corrupt. Product runtime acceptance is suspended until a verified image is usable.
The historical observed login pass is retained with this newly discovered limit.

The same error has a [firsthand community report on Apple's forum](https://developer.apple.com/forums/thread/830152),
which is a diagnostic lead, not confirmation of this host's cause. The original
Apple-provided DMG for the same runtime build is already present locally. Recovery
uses only the supported import mechanism with mandatory staging/signature checks,
as described by [Apple's component installation documentation](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components)
and an [Apple DTS reply](https://developer.apple.com/forums/thread/795769). It does
not move/delete the source, erase devices, change the OS version, weaken trust or
substitute an authentication/storage mechanism. Import success and a usable,
verified runtime must be established separately before another product run.

Four Swift transport contract cases are prepared in the installed iPhone test
target: exact signed UTF-8 and untrusted-field rejection; canonical paths and
wire identities/typed limits; HTTP failure visibility and private-header
redaction; and exact buffered body/EOF with length/buffer rejection. They use no
Keychain, account or resumed network task. They are not yet compiled or executed;
they do not close the separate cookie-custody, live HTTPS or native UI gates.

The four pure Swift cases subsequently compiled and executed successfully on
macOS against byte-identical copies of the ordinary policy/response/exchange
sources. Exactly four XCTest cases passed with zero failures; a separate zero-case
Swift Testing footer is not the execution evidence. This is complementary Mac
contract validation, not installed-iPhone acceptance. The iPhone target's own
compilation and execution remain separately pending.

The supported same-build image import refused to copy because of insufficient
free space (error 14). It added no runtime identifiers. Only this task's generated
Gradle caches, obsolete wrapper distribution and checksum-verified duplicate
installers were removed; installed tools, dependency downloads, native artifacts,
device data and account stores were retained. A subsequent copy import still
failed the free-space gate. A separate attempt uses an independent APFS clone,
verified against the original with streaming SHA-256, and the supported move
option to stage only that private copy. The Apple asset is retained; successful
import, mandatory verification and usable registration are still required.

The four-case iPhone test target subsequently compiled successfully. Its runtime
execution remains pending. The private APFS-clone import also returned the
free-space error without removing the Apple source. Both original runtime image
identifiers and every simulator identifier are preserved; no newly registered
image is accepted. The owner was asked whether to remove only the additional
8.3-GB iPhone Duo runtime, leaving device data intact but making that model
unavailable until reinstallation, or to free disk space manually. No answer has
yet authorized removal. Required confirmation follows the repository rule for
destructive actions. No security-validation exception is proposed.

Final responsibility review for the added Swift cases: only the test target and
its source list changed. Each case owns and disposes its temporary URLSession/task;
reads have buffered or completed bodies, so no task is resumed. The tests observe
request rejection, byte identity, header/status exposure and EOF/buffer bounds,
without altering production interfaces, custody, app state or network behavior.
The existing app source/project has no direct-observer hook; that hook remains
exclusive to the private direct-build copy. No main-branch integration occurred.

The owner then explicitly approved removing only the additional iPhone Duo
runtime package. This supersedes the pending decision above. It authorizes that
scoped disk recovery, preserving all device/account data and the ordinary runtime
source; it does not establish successful repair, signature validity or parity.

## Physical iPhone cross-account execution — 2026-11-03

- **Canonical invitation and explicit contact approval: passed — native physical.** Independent synthetic installations used the ordinary canonical invitation and request/approval controls. No URL translation or protocol-record insertion.
- **Private text both ways, delivery receipt, edit and quoted reply: passed — native physical.** Independent recipients decrypted the expected content; sender/recipient message identities matched, edits retained the original identity and the reply quoted the edited original. Foreground live push and explicit read-receipt opt-in remain separate.
- **Encrypted original attachment transfer: passed — native physical.** The independent recipient recovered the same accepted message and compared every original byte. The fixture selected a synthetic file; OS picker/save behavior remains separate.
- **Group creation, invitation, independent acceptance and encrypted text both ways: passed — native physical.** Both members opened the same two-member group and independently decrypted messages with matching accepted identities.
- **Text status: passed — native physical.** The approved independent contact opened and decrypted the expected synthetic status.
- **Public handles, community creation/follow/post/read/vote/reply: passed — native physical.** Links-only external-media consent was preserved; an independent account read the post, confirmed the changed vote and replied, and the original account read that reply.
- **Public DM consent and encrypted text both ways: passed — native physical.** The requester had no free composer before independent approval; both installed public identities then sent and decrypted the expected messages.
- **Local conversation search and contact privacy persistence: passed — native physical.** Actual local search found the decrypted synthetic message; contact-only request visibility survived a new process, then invitation-only mode was restored.
- **Complete encrypted backup with accepted conversation/group content: passed — native physical.** The actual product archive was generated and completely imported; truncation was rejected with destructive cleanup disabled. This does not establish OS saving or device backup/restore.

- **Conversation pin persistence: passed — native physical.** The setting survived a new native process and its previously observed state was restored.
- **Block/unblock and renewed contact consent: passed — native physical.** The blocked list and revoked approval persisted after process restart; unblocking did not restore approval. A new canonical request and independent explicit acceptance succeeded.
- **Logout persistence and original-account return: passed — native physical.** The guest state remained after a separate native process reopened the app; real synthetic login returned to the original wallet. The exact original private profile, preferences and navy theme were verified afterward.

The initial group-accept action timed out while waiting for the exact title after
its successful consent commit. Subsequent administrator refresh and independent
member reopening showed the correct private title and two members, followed by
accepted encrypted messages both ways. The immediate title/acceptance expectation
remains a failed observation. Two intervening `group-check` diagnostic calls had
incorrect JSON input instead of the action's plain-title contract; those are test
invocation errors and are not product failures. No group was recreated, no
consent replayed and no product authorization rule changed to obtain the later
passes.

## Physical gesture/lifecycle prerequisite

The private native UI executor compiled and its separate signed runner installed
on the authorized phone. Its first requested background test did not execute UI
assertions: runner initialization failed with “Timed out while enabling automation
mode.” This is a platform automation prerequisite, not a failed background account
assertion. The owner was asked to check the phone's Developer → Enable UI Automation
setting and any on-device authorization prompt. No gesture, microphone capture,
background continuity or playback pass is claimed from that attempt. The owned
product process was independently verified stopped afterward.

The synthetic logout return was subsequently checked against the exact original
private name, preferences and navy theme and passed. All current product changes
remain on the task branch; no commit, main integration, push or deployment is
claimed for this continuation.

After the owner checked the phone, a fresh UI run passed **one actual physical
background/foreground test**, with zero failures/skips and all 18 independent
native/UI checks true. The test pressed Home, verified the actual background
state, reactivated the app and verified the original private account and current
document. Its owned app process was independently verified stopped afterward.
This does not establish locked-state access, OS reboot or unrestricted background
execution. The first automation initialization failure remains recorded.

The first private-recorder UI attempt used a single tap and did not pass. Source
inspection identified the existing touch contract: a single tap shows a hint;
hands-free recording requires a double tap, or the user can hold the button.
The private test executor was corrected to use the actual double-tap gesture.
This is a test-driver correction, not evidence of a product microphone failure.
The retry requires its own physical result; no capture pass is inferred yet.

The corrected private-recorder double-tap retry passed one actual physical UI
case, with zero failures/skips and all 17 native/UI checks. The real microphone
produced samples and advanced the product recording clock; the fixture cancelled
without sending. Separately, a short real public-DM recording was encrypted and
accepted. The independent installed account matched its accepted UUID and
nonzero duration, decrypted it and reached playing state with advancing progress
after a real tap. Sender/recipient native processes were verified stopped. No
sample audio content was exported to logs or analysis. Audible quality, external
headsets and interruption variants remain unaccepted.

The first peer-playback preparation was stopped after detecting an incorrect
button label in the test executor. The corrected selector uses the actual “Ouvir
mensagem de voz” control; the later physical playback case passed. This setup
correction is not a product playback failure. Actual sender and recipient App
artifacts passed strict signature verification, unchanged ordinary product
script hashes and absence of XCTest plugins inside the product App. The separate
temporary UI executor was removed after those gesture tests; both account
installations and their data remain preserved.

## Physical persistence after owner-performed reboot

The owner authorized one restart, performed it and confirmed the phone was ready.
After reconnection, the installed original account passed the exact private
name/preferences/navy-theme check. It also reopened a previously accepted
encrypted message with the same original identity. Native process identity and
termination were verified for both phases. This is an owner-reported physical
restart followed by actual installed-App verification; no independent before/after
kernel boot-ID comparison was recorded. Locked-before-first-unlock behavior and
OS backup/restore remain separate.

## Fresh original-account recovery after the physical restart

A new third app container used the original synthetic signer, with no copied
local account/device/history data. Its first openings failed with native
network-unavailable errors (`NSURLErrorDomain -1009`). The fixture endpoint,
admission and pinned CA matched the verified live server; the exact OS/network
policy cause was not established. After the owner-performed restart, genuine
synthetic authentication/private opening passed. Temporary native transport
logging was then removed and the ordinary session source was byte-verified.

The clean-transport continuation passed the exact original private name,
preferences/navy theme, new-process session restoration, a previously accepted
message with the same identity, the existing two-member group and complete
encrypted backup/import with truncated-file rejection. Earlier failed openings
remain recorded. This is recovery of the original account, not a replacement
wallet or a cloned local store. The original attachment was then recovered from the fresh installation with
the same accepted message identity and every original byte verified in the client.

## Physical native cookie and HTTP controls

Six isolated physical XCTest cases passed, zero failed/skipped: late-response
supersession and logout; cookie scope/attributes/lifetime/duplicates; actual
Keychain `WhenUnlockedThisDeviceOnly` attributes and protected/excluded install
marker; malformed/missing/expired records; orphaned Keychain/invalid install
marker rejection; and a real native HTTPS 401 response through EOF without
exposing `Set-Cookie` to the visible response.

The private control copied the ordinary cookie owner unchanged. Only the two
Keychain service/install-marker identifiers were substituted in the private
store copy, with an exact reverse-substitution comparison. Its minimal host did
not start a product WebView/account session. Tests touched only that dedicated
synthetic namespace and removed their own records. Actual account namespaces,
markers and product source were unchanged. A first private control build still
included unrelated UI-driver files and failed compilation before executing any
case; narrowing that private test target to its intended six cases resolved the
fixture composition error. This does not accept locked-device behavior or an
actual OS backup/restore.

## Physical synthetic storage controls

Five sequential actual physical XCTest phases passed, zero failures/skips in the
accepted sequence: create the fixture; reopen its existing nonextractable keys
and ciphertext in a distinct process; reject explicit expiry; reject deliberately
altered ciphertext; and explicitly clear the synthetic record. The negative
phases verified rejection before clearing/recreating a valid fixture. Each phase
reported a different native host process, and used the unchanged offline probe
assets through its public installed WebView UI. Its single synthetic database is
separate from product account/history databases. These complementary crypto/
storage controls do not replace the full-product results above.

The first offline fixture attempt was rejected by the driver’s base-app-only
bundle guard before exercising storage. The private control driver was adapted
to require its actual recovery test-host bundle; the ordinary product/test
projects were not weakened. That setup failure remains recorded. The five
accepted phases subsequently ran without skipped cases.

The complete product app was restored after the cookie/offline controls. Its
ordinary native transport source was byte-identical, and the original recovered
private profile/preferences/theme still passed. A prior outgoing attachment then
opened through the product's normal decryption/download control in the fresh
container. Its message identity matched the original acceptance and every byte
matched the synthetic source. No fixture database, native token or product
account state was copied from another installation.

Six additional physical process-stop/reopen cycles all preserved the original
private account, exact profile/preferences and navy theme. Each cycle verified a
different running native process, independently observed all 16 checks, terminated
the owned app and confirmed no surviving process. Together with the owner-performed
restart and prior-message verification, this is a bounded durability result. It
is not proof against every power-loss, storage-corruption or OS-backup scenario.

Structural review of this continuation: normal storage preparation still owns
only file protection/backup exclusion; its exact dyld code-cache exception does
not exempt WebKit or identity data. The scene owns error presentation only.
Synthetic endpoint validation and the flagged native header remain in their
existing composition/transport owners. Fixture modules own their DOM assertions,
phase/report deadlines and narrowly validated handoffs; Keychain/storage controls
have separate private projects/namespaces. No product crypto, authorization,
retention or server business rule was changed for the later passes. Actual final
recovery source copies match the normal session, cookie store/owner and file-
protection source. No temporary transport logger or synthetic custody namespace
remains in that complete product artifact.

## Round closure and preserved evidence

This section describes the earlier closed round. The later continuation reopened
the same preserved local services; the current manual handoff is recorded below.

The physical continuation is complete for the individual passes recorded above;
it does not close the remaining acceptance prerequisites. Earlier failures are
retained with their later corrections or narrower passes. No result is inferred
from a build, empty test selection or browser-only execution.

After the final six continuity cycles, only the owned synthetic test services
were stopped. The database archive has a verified nonempty restore listing, and
all 12 encrypted object files were compared byte-for-byte with the archived
copies. This verifies archive contents, not a database restoration exercise.
Source database/object directories and the three synthetic app installations
with their data were preserved. Owned app processes were verified stopped; local
fixture ports were verified closed. These private test apps require their local
fixture to be running for later network flows.

Changes remain local on `codex/mobile-complete-flow-validation`; no commit, push,
merge, deployment or store publication was performed. Final focused type/lint,
boundary/output-contract and formatting checks are recorded privately. Earlier
aggregate results remain scoped to their original checkpoints; no new complete
aggregate run or remote CI pass is claimed.

## Additional iPhone acceptance — active continuation

The owner requested the remaining iPhone coverage, excluding real wallet apps.
The paired physical phone is available and its existing isolated database was
reopened without resetting accounts or app data. Read-receipt opt-in and actual
camera lifecycle scenarios are being added through public product controls.
No additional functional result is accepted until its observed execution.

Remote native push is blocked: the current client implements Web Push and has
no native APNs registration/transport integration or push-enabled signing profile.
Apple documents the required [APNs app registration and entitlement](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns)
and includes push capabilities in its [paid developer membership](https://developer.apple.com/programs/whats-included/).
The owner questioned that cost; no enrollment, payment, native architecture
replacement or scope reduction was approved. This affected integration remains
paused. A separate generic local-notification OS control is being prepared; its
results cannot certify remote delivery, wakeup or the unimplemented integration.
[Free Home Screen Web Push](https://webkit.org/blog/13878/) is a distinct web-app
distribution path, not evidence for this installed native app.

- **Explicit read-receipt opt-in: passed — native physical.** The independent recipient enabled the preference through the ordinary form, preserved it across a cold process, decrypted the new message, and the sender observed the actual recipient-read label for the same accepted message identity. This is distinct from delivery/preservation and does not certify foreground live push.

- **Generic local notification: passed — physical OS control.** After the owner granted permission, one actual XCTest passed with zero failures/skips. The OS requested banner/list/sound presentation and retained the exact generic synthetic notification; the test removed only its own pending/delivered identifier. Sound was requested, not acoustically verified. No remote token, APNs delivery, OS wakeup or product notification integration is accepted by this standalone control. The first attempt reached its execution deadline while awaiting the permission and remains recorded.

- **Native original-file export: passed — physical presentation/cancellation after correction.** The initial actual product case verified the original Blob bytes but failed because no native exporter appeared. A dedicated iOS export owner now accepts only downloads from the main packaged document's local Blob URLs, presents the native copy/export picker, and owns one bounded temporary operation. A separate storage owner applies Complete protection/backup exclusion, sanitizes filenames, rejects symlink staging and cleans abandoned stages on initialization. The same physical product case then passed: native exporter visible, staged bytes exactly equal, protection verified and staged file removed on cancellation. Three additional physical origin/storage/security cases passed, for four passed and zero failed/skipped in the accepted run. No external file was written; choosing a destination and importing an OS-selected file remain separate. Earlier compile corrections and the pre-fix functional failure remain recorded. No crypto/authentication or minimum-iOS change was introduced.

- **Actual native WebView frame/document boundary: passed — physical isolated control.** Three actual XCTest cases passed, zero failures/skips, with a nonpersistent WebView and the ordinary native channel in a minimal host/dedicated cookie namespace. The authorized main document worked; a same-origin subframe and a nonlocal main origin were rejected. Wrong/replaced document nonces stayed rejected until actual navigation established a new document, and malformed wire input closed the channel. No product account, remote page or content was loaded. The first fixture attempt accidentally selected the callback Swift API overload instead of awaiting its result and failed its own result-type guard; the corrected async API run passed. The channel authorization body is unchanged by the separate export integration.

The owner paused this continuation on 2026-11-03. Owned test/build processes and local fixture/database services were stopped; original data, code and accepted evidence were preserved. Camera authorization was granted, but the first camera scenario addressed a nonexistent route and timed out before capture. That fixture correction and camera/optical acceptance remain unfinished. No further validation was started after the stop request. Native export compilation/presentation and the recorded focused physical passes do not establish completion of the remaining platform cases.

The owner resumed the continuation. **Actual camera capture and explicit-close cleanup passed — physical UI.** One actual XCTest performed a real tap in the ordinary Contacts invitation dialog and passed all 17 independent native/UI checks. Actual video frames and live tracks were observed, then explicit close stopped every track and cleared the video source. No frames were saved or exported. Earlier fixture-route/readiness errors, a programmatic frame wait and an empty UI test selection remain unaccepted and recorded; the accepted run used the compiled native-gesture case. Optical matching of a known QR payload remains separate. The official UI executor reused the existing synthetic Recovery app identity/profile with strict signatures and no account-container deletion; the complete Recovery product must be restored afterward.

- **Physical optical QR reading: passed — native UI with owner positioning.** The owner aimed the rear camera at the generated synthetic QR on the Mac. One actual XCTest performed the product's real scan-button tap and passed all 17 native/UI checks. The ordinary reader decoded the exact canonical invitation into its public form, then cleared the stream and stopped the camera. The test did not insert the expected payload into the form, save/export frames or submit a new contact request.

## Manual takeover — 2026-11-04

The owner chose to perform the remaining interactive tests and explicitly included
real wallet login. Automated flow expansion stopped. The
[manual checklist](MOBILE_MANUAL_TEST_CHECKLIST.md) defines independent expected
results for wallet round trips, system file selection, acoustic quality, live
arrival/reconnection and voice calls. None is accepted merely by preparing it.

The actual OS Save gesture passed one physical UI case with 17 checks after
explicit selection of the app's own synthetic folder. Verification of that saved
copy and a complete OS-selected-file send/independent receipt remain pending. The
next actual picker case failed before tapping a file because the fixture expected
a navigation-bar accessibility role for the known folder title. That failure is
retained; adjusting the fixture's selector is not an import pass.

The additional iPhone continuation also passed actual camera lifecycle and optical
QR decoding, explicit read-receipt opt-in/persistence and the sender's read label,
the standalone local-notification OS control, four native file-export/security
cases and three actual WebView frame/document boundary cases. Their recorded
limits still apply. In particular, local notifications are not remote APNs push.

Manual composition keeps the original synthetic accounts in Test A/Test B and
uses the third existing development identity for an ordinary Wallet build. Normal
native source replaces the temporary observer/export-directory instrumentation;
normal Info.plist does not enable file sharing. Wallet uses ordinary product
assets with no synthetic provider, private CA, admission resource or UI test
runner. It targets the canonical public test service with system TLS. Updating
these identities preserves their containers; the local and public services remain
separate. Wallet signatures, native return and private opening are still manual
acceptance gates, not claimed results of this composition.

All three manual builds subsequently passed physical-device compilation, strict
code-signature/profile checks and normal native-source byte comparison, and were
updated on the paired iPhone without uninstall/reset. The ordinary Wallet build's
public assets were byte-compared with `dist/mobile`; no synthetic provider/driver
or test CA/admission resource is packaged. Wallet was launched without a test
driver environment. Canonical HTTPS readiness returned 200. These are handoff
prerequisites, not an observed real wallet login.

The local manual composition was restarted with preserved database/objects and a
dedicated visible browser profile, ordinary Mac microphone behavior and bounded
local TURN. Strict native HTTPS and loopback readiness returned 200 and local TURN
was reachable. Its eight-hour deadline, scoped stop/restart command and private
operational notes remain under `.local/`; closing the browser does not stop the
phone's fixture. No manual scenario has been marked passed by these checks.

The independent Mac browser peer completed synthetic login/private profile only.
Its initialization and the bounded local TURN prerequisite are not iPhone call
acceptance. The manual operator needs independently interactive endpoints to
assess calls. No new APNs integration, paid enrollment, deployment, app uninstall,
phone reset or additional reboot was performed for this handoff.

Focused verification after fixture consolidation passed TypeScript strict,
ESLint for the affected TypeScript fixtures/output contract, dependency boundaries
(459 modules, 2,504 dependencies) and four output-contract tests. This is not a
fresh aggregate suite or remote CI result. Structural review keeps export lifecycle
in the native export owner, temporary files in its storage owner and actual
contact-visibility form/restoration in its dedicated fixture module. Coordinators
only compose them; no new dependency, authentication bypass, crypto or retention
rule was introduced.

**Ponto importante:** synthetic login does not certify an installed wallet. A
wallet pass must include the original installed app's address confirmation and
private opening. Remote native push, broader security/store acceptance and the
other unobserved manual scenarios remain open.

Latest phone UI delivery: build 7, with preserved data. Physical full-shell
repeated emoji toggles, native keyboard geometry/restoration, theme/safe-area
geometry and focused web-field accessory removal passed in focused runs.
Initial simulator startup, file-module fixture loading and unloaded keyboard
registration attempts are retained as failed records. Shared main e1d1c870
passed exact CI and official VPS activation. This is not full product acceptance.

## Contact acceptance and chat polish — 2026-11-04

Shared main `98c3a2ee` (application `071d8b02`) passed exact CI and the official
VPS activation, including preservation, public-build and rollback checks. Shared
services were not restarted. Native foundation, transport/recovery work and ZK
removal remain outside this scoped main release.

Ordinary Wallet build 8 is compiled and signed, with profile, source and ordinary
asset byte checks passed. It is prepared under `.local/contact-final-polish/` and
**not installed**: the owner disconnected the iPhone. Build 7 remains the last
recorded physical installation. Updating must preserve its existing container;
Test A/Test B remain unchanged. No new physical acceptance is claimed.

The shared changes add invitation generation beside By invitation, an explicit
request action for saved contacts, direct private-chat acceptance on code
redemption, public-handle replies, a dismissible device-local safety notice,
GIF search layout/no phone autofocus, square header avatars, collapsed empty
chat status and separated settings fields/actions. Profile settings retain one
outer frame plus the description field. Wallet-only requests still require
independent acceptance; one-use/24-hour/revocation/block/privacy rules remain.

Validation: 21 PostgreSQL contact scenarios, 13 phone-width and 10 desktop-width
full-shell macOS WebKit assertions, 14 affected native-source tests and 467
deployment tests under Python 3.14 passed. Exact main CI passed all jobs. These
WebKit geometry checks are not physical-iPhone acceptance. Native source retains
only its existing application-origin/API adapters for the shared changed files.
The task's own temporary PostgreSQL was stopped with data preserved.

Physical follow-up: install build 8 after reconnection; verify GIF search while
typing, repeated emoji/keyboard toggles, absent keyboard accessory, full-height
public chat, public replies, avatar/subtitle, profile framing, language spacing
and A-to-B invitation redemption without a second A approval. Preserve prior
real-wallet, call, file-picker and native push acceptance limits.

CI: https://github.com/karma352431231-ship-it/0xDMme/actions/runs/41805164242

### Build 8 installation after reconnection — 2026-11-04

The owner reconnected the iPhone. The prepared ordinary Wallet build 8 was
installed and launched successfully without uninstalling or resetting data.
Only the existing Wallet app identity was updated; Test A/Test B were untouched.
The earlier pending-installation status is superseded. Installation is not
physical acceptance of the contact, GIF, keyboard or layout fixes; those manual
checks remain for the owner. Evidence: `.local/contact-final-polish/`.

## Conversation interaction regression status — 2026-11-04

Shared source `2364a241` / main `ff93b588`: focused gesture/selection/search-scope/mute/cursor tests passed, 19 assembled PostgreSQL handle scenarios passed, and actual CSS WebKit fixtures passed at 390/1100 pixels. The fixtures check portrait avatar geometry, a 44-pixel emoji target, hidden global phone navigation and keyboard handoff in both focus states. Author-deletion authorization, target binding, idempotence, quota reduction and history replay are covered.

Ordinary Wallet build 9 compiled and signed with matching source/assets/profile checks. Physical hold/swipe, batch deletion across actual devices, exact result navigation and iPhone keyboard transitions remain manual acceptance items. This record does not claim a full native aggregate or real-wallet pass.

Build9 delivery recorded: complete main CI41908480052 passed; mainff93b588 activated through the official VPS procedure with preservation/rollback checks. Ordinary Wallet build9 was installed and launched on the reconnected iPhone without uninstall/reset. Actual touch, keyboard and cross-device behavior remains manual acceptance.

## Touch stability follow-up — build 10, 2026-11-04

Shared main658344c0 / exact CI41940535926 passed and activated on the destination VPS with preservation/rollback checks. Ordinary Wallet build10 was installed and launched without uninstall/reset.

Retest right-swipe replies on incoming and own handle messages, including retained local originals; private reply animation; a held message menu after releasing the finger; keyboard-to-emoji/GIF and return; and shared block/prevent/mute icons. Reply is local context while send and mutation authority retain their existing guards.

WebKit390/1100, focused state/gesture/menu regressions and the complete shared CI passed. Native keyboard/root-panning measurement remained unexecuted because the simulator's initial data migration and low Mac disk space prevented setup. The prepared test is not a pass; physical flick/touch acceptance remains open.

## Repeated reply and full-width public chat — 2026-11-04

Shared main `0a60bd41` passed complete CI `41947240593` and was activated through the official destination procedure. Public readiness and exact HTML/JS/CSS bytes independently verified; preservation and rollback passed, shared services not restarted. Only the seven scoped UI/test/document files were sent.

The common gesture owner follows one primary touch at the window boundary through release/cancellation instead of ending on bubble leave. New presses, blur and parent disposal clean up its listeners. Composer focus is retained when switching reply targets; the existing composition owners preserve the draft. The phone Public wrapper and inner card are unframed and full-width. Only the full public-user/posts block glyph uses the existing danger color; message-only blocking stays normal.

Thirty-five focused regressions passed. Actual WebKit at 390/1100 pixels passed the real Public wrapper geometry, separate glyph colors and six consecutive DOM reply replacements with focus/draft preserved. Strict types, affected lint, boundaries, formatting, web/mobile and ordinary signature/source/asset checks passed. No simulator was started for this correction.

Ordinary Wallet build 11 is signed and prepared in `.local/reply-lifecycle/`, with the exact three-source-file overlay verified. The owner unplugged the phone and explicitly deferred installation: do not install or launch until they reconnect and authorize continuing that step. The installed app remains build 10. Physical gesture acceptance remains open.
