# 0xDMme mobile apps: decisions and implementation handoff

Last updated: 2026-11-09

Status: full product packages and native HTTPS/session owners are implemented locally. Installed Android emulator flows and physical iPhone flows passed individually; their coverage is not identical or complete. The earlier iPhone simulator/startup blocks do not describe current physical-phone availability. The owner has taken over the remaining interactive tests, including real wallets. Native remote push, unresolved Android storage/recovery failures, unexecuted feature/security variants, final distribution licensing and store readiness remain unfinished; source integration is recorded below.

## Main source integration — 2026-11-09

The owner authorized integrating `claude/mobile-native-backup` into current main
with the feed refresh correction `65a803ce`. The source snapshot `ff165874` is
combined with the newer main, preserving visitor retention migration 106,
current public-DM behavior, lost-device-key detection and existing web fixes.
Earlier statements that the native sources are only uncommitted/local describe
historical checkpoints; they do not replace this integration record.

The native entry owns session-channel startup and disposal. Domain callers use
the API transport and application-origin contracts; browser requests retain their
normal fetch path. One frontend asset producer supplies separate browser and
installed entry points. Device authority publishes a complete verified snapshot,
including local key-loss state, and clears authority on failed checks without
invalidating a replacement session. The unused ZK lab and dependency removal
follow the already approved D02 decision. Messaging encryption is unchanged.

This is source integration, not VPS activation, an installed-app update, license
adoption or store publication. Native push, the recorded Android recovery/storage
failures and remaining physical/security acceptance stay open. The custom license
remains a non-effective draft; current GPL and third-party obligations continue.
Combined local validation passed lint, strict types, boundaries, npm license
checks, formatting, localization, web/native asset builds, 1,846 application tests
(one additional test skipped), 506 executor tests and 51 moderation tests. Python
checks used 3.14; historical deployment tests use the existing immutable reviewed
lock fixture rather than deriving old authorizations from current dependencies.
Exact-commit remote CI remains required after the source push.

## Current web baseline correction — 2026-11-04

The owner requires the installed product to use the latest web source and requested
installation of the updated ordinary iPhone app after validation. The previous
mobile work was based on `20d8fe09` (2026-10-10). GitHub `main`, refreshed for this
work, is `af321b34` (2026-11-01), 639 commits ahead. An exact client/shared-file
comparison found 233 differing files and 530 missing current files; these counts
include refactoring and are not counts of missing features.

The updated work starts from the complete `af321b34` source. Only native entry,
transport, protected persistence, service-origin and packaging adaptations are
carried across. Current wallet/recovery protocols and their exact signing/key
formats come from that web baseline; an isolated backward-compatibility patch
prepared during diagnosis is not included. No account/container reset, server
migration, VPS activation, new relay or SDK authentication replacement is implied.

The common frontend asset builder now includes the current localization catalogs,
wallet marks, styles and feature graph for both platforms. Native networking also
covers the current anonymous ranking stream and share receipts. The iPhone native
viewport now owns top/side safe-area constraints, follows the page theme and
lets the bottom background extend to the window edge; CSS protects bottom controls. Original
address confirmation remains required; the old second sign-in prompt caused by
incompatible private-opening fields is not a new consent requirement.

Earlier synthetic and physical results below belong to the old baseline. Preserve
them as historical evidence; they do not accept this updated product. Ordinary
MetaMask, Phantom and Backpack return/private opening still require physical
validation. The current wallet-browser transport does not guarantee automatic
return; native callback routing is not implemented by this baseline correction.

Validation completed: 132 affected application/contract tests and 10 isolated PostgreSQL group integration tests passed. Strict types, dependency boundaries, current iOS signing/source/asset checks, Android native-policy Java compilation, localization and license gates passed. The initial aggregate run recorded 1,780 passes, six failures, four cancellations and one skip before corrections; it is not reported as a passing aggregate. Startup-fixture and pending-authority regressions were corrected; affected tests passed afterward without increasing timeouts. The complete aggregate was not rerun.

The ordinary **0xDMme Wallet**, development build **4**, was updated and launched on the paired iPhone without uninstall/reset. It uses ordinary product assets, canonical system TLS and no injected wallet/driver/CA. Test A/Test B were not updated. The safe-area XCTest is prepared but was not executed; actual layout and real-wallet acceptance belong to the owner's manual checks. Work is local and uncommitted on `codex/mobile-current-web`, based on `af321b34`; no push, remote CI, VPS deployment, migration or store publication occurred.

Structural review: native viewport geometry belongs to `NativeViewportView`; the bridge only composes it. Device-directory reads prepare and publish a complete verified snapshot in the existing authority owner; failures clear authority and revoked devices remain blocked. Web/native entries share one current frontend asset graph. Domain modules consume the existing transport/service-origin capabilities; no new SDK login, relay, mutable app context or dependency cycle was introduced. The obsolete unreferenced post-controls helper from the old branch was not carried forward.

Existing
Test A/Test B installations and their isolated test data are not reset or silently
migrated by updating the ordinary Wallet installation.

## Mobile UI corrections approved — 2026-11-04

The owner requested dirty-only public-profile confirmation, removal of external
media controls from that editor, theme-colored iPhone system areas with the
bottom background extending beneath the home indicator, and a chat emoji panel
that replaces the keyboard space with a return-to-typing arrow. Shared profile
and emoji behavior applies to browser/mobile; native window color/geometry is iOS.
Community ownership requests retain their approved transfer/acceptance semantics;
the UI explains their purpose rather than implying a wallet transfer.

The owner explicitly changed the earlier session-only emoji-history decision:
recent emoji may persist on this device across app/browser restarts. Retain at
most 32 unique Unicode emoji, without timestamps, account/conversation identifiers,
message text, synchronization, backup upload or telemetry. The emoji module owns
this optional local preference; unavailable storage retains session-only behavior.
This is not authorization to persist message drafts or decrypted conversations.

The ordinary Wallet app was updated and launched as **build 5**, without
uninstall/reset; Test A/Test B were unchanged. Strict signing, device profile,
Complete file protection, ordinary source and packaged asset byte checks passed.
The native background observes the page theme; status-bar contrast follows it,
while the WebView extends to the bottom edge and CSS retains the control inset.
Prepared native viewport/theme XCTest cases were not executed. Physical iPhone
keyboard and safe-area acceptance remains manual.

For this UI continuation, 60 affected tests and 15 synthetic browser interface
assertions passed on the shared source. Current lint/types/boundaries,
English/Chinese localization and web/mobile builds passed. A separate clean web
release contains only these shared UI changes, their tests and a focused decision
record: commit `95bff979` was integrated and pushed to main at the owner's request.
Its 47 targeted web tests passed. Exact-commit CI and VPS activation are tracked
separately from native acceptance; unrelated native foundation, ZK removal,
transport/recovery and other local work were excluded from that source release.

Scoped web publication is complete: final main `b6ecc92c`, with the UI code in
`95bff979`, passed exact-commit CI (all checks, three integration shards and
cross-platform release reproduction). The existing staging command activated it
on the explicit private destination. Public build/source verification,
preservation and independent canonical health/script checks passed; rollback was
retained and shared services were not restarted. The remaining native work stays
local. The web release decision record is `docs/MOBILE_UI_POLISH.md` on main.

The owner subsequently requested complete removal of the iPhone keyboard's
form-navigation/check toolbar. Use the official native Capacitor Keyboard 8.0.6
package (MIT, exact SPM version), with resizing disabled so the native viewport
remains the sole geometry owner. This is an installed iPhone change; Safari's
own browser controls are outside the app. The plugin has no account, chat or
network role. Preserve its MIT notice and validate this version on the current
iOS build; native keyboard toolbar behavior remains an OS integration contract.

### Phone frame and toolbar delivery

Ordinary Wallet **build 7** was installed and launched without uninstall/data reset.
The shared phone frame fills the visible conversation area and hides shell tabs
and global navigation until departure. Native viewport sizing follows the system
keyboard; only inner content scrolls. The emoji search uses its own form styles,
and its dock/arrow occupy conversation space rather than covering messages.

Five native scenarios passed across focused physical runs: full-shell repeated
emoji toggles for handle/private frames, actual keyboard height/restoration,
theme, safe-area geometry and absence of the form accessory on a focused web
text field. The simulator startup and earlier physical harness/registration
failures remain recorded failures, not successful runs. Build 6 did not initialize
the keyboard plugin: Capacitor ignores registerPluginType while auto registration
is enabled. Build 7 registers an instance and checks it actually loaded.

Shared commit `e1d1c870` passed 81 targeted tests and exact full CI, and was activated
on the VPS through the existing deployment command. Public build verification,
health and preservation passed; shared services were not restarted. Native SPM
integration and remaining mobile work were excluded from the shared source release.

### Contacts and profile/GIF follow-up — 2026-11-04

The owner explicitly authorized direct acceptance on invitation redemption,
shortcut generation beside By invitation and requests from saved contacts.
The shared implementation preserves single use, 24-hour expiry, current discovery,
blocks and atomic admission. Wallet requests keep separate acceptance. Shared
reply composition reuses encrypted DailyText; no new plaintext message metadata.
The local source now also includes GIF focus/field corrections, square @ avatar,
subtitle alignment, a device-dismissed safety notice, empty chat-gate collapse,
one mobile profile frame and explicit settings field/action gaps.

The owner disconnected the iPhone and will perform physical acceptance later.
Prepare ordinary build 8 without installing or resetting another identity. The
native toolbar correction from build 7 remains. Keep source/dependency and signed
asset checks; do not claim physical acceptance from WebKit desktop tests.

## Purpose and authority

Build installed Android and iPhone versions of 0xDMme while reusing the existing
web client and backend where compatible. Keep this document updated as decisions,
implementation evidence, and acceptance results become available.

The owner explicitly requested this document for another agent to implement from.
This document records authorization already given; recommendations and open items
are not additional approvals. Follow [repository instructions](../AGENTS.md).
The original authoring task was documentation-only; the owner subsequently requested implementation in a new task on 2026-11-01.

## Current implementation and acceptance — 2026-11-04

This section, the current progress tracker and remaining-work table describe the
latest checkpoint. Dated records below preserve earlier failures and the order of
corrections; they do not override this summary. The
[flow matrix](MOBILE_FLOW_TEST_MATRIX.md) owns detailed per-scenario results and
limits. The [manual checklist](MOBILE_MANUAL_TEST_CHECKLIST.md) owns the operator's
remaining steps. Preparing a build or a test is not a functional pass.

| Area                                    | Observed result                                                                                                                                                                                                                                                                                                 | Limit                                                                                                                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product/runtime                         | Capacitor 8.6.0 packages the complete product. Native HTTPS, private cookie custody and main-document guards are implemented. Android installed-product builds and signed physical iPhone builds passed.                                                                                                        | Compilation and individual runtime results do not establish full feature/security or store acceptance. Android emulator results are not physical Android results.                                                                       |
| Core installed flows                    | Android and physical iPhone records include synthetic login/private opening, restoration, profile/preferences/theme, contacts/consent, encrypted messages/edits/replies, exact-byte attachments, groups, status, communities, public DMs, search, privacy, encrypted backup and logout/original-account return. | Each pass retains its own platform/scenario scope. Earlier failed Android storage/partial-loss and private-conversation recovery cases remain unresolved.                                                                               |
| Physical iPhone persistence/recovery    | Existing-account checks passed after the owner-performed restart; fresh original-account profile/history/attachment recovery and six distinct-process continuity cycles passed.                                                                                                                                 | Reboot was owner-reported, not independently compared by kernel boot ID. This does not prove arbitrary power-loss, locked-before-first-unlock or OS backup/restore behavior.                                                            |
| Physical iPhone media/UI                | Actual background/foreground, microphone capture, encrypted public-DM voice delivery/playback, camera lifecycle, optical QR and explicit read-receipt opt-in/persistence passed.                                                                                                                                | Audible quality, headsets/interruptions, foreground live arrival, reconnection/cancellation and actual calls remain separate.                                                                                                           |
| Physical iPhone files/security controls | Four file-export/presentation/security cases, an actual OS Save gesture, three actual WebView frame/document cases and the recorded cookie/Keychain/offline-storage controls passed.                                                                                                                            | The saved external copy's bytes and a complete OS-selected-file send/independent receipt remain pending. The picker attempt failed before file selection; its selector correction is not a pass. Remaining security variants stay open. |
| Notifications                           | A generic local-notification OS control passed after permission.                                                                                                                                                                                                                                                | Remote native push is not implemented/accepted; the control does not prove APNs delivery, incoming-message notification or wakeup.                                                                                                      |
| Manual real-wallet preparation          | Three existing iPhone identities were updated without uninstall/reset. Strict signatures/device profiles and normal native-source bytes passed; the ordinary Wallet build's public assets match `dist/mobile`. Wallet launched and canonical HTTPS readiness returned 200.                                      | No real MetaMask, Phantom or Backpack login/return/private opening, or public-browser-to-installed-app conversation, has been accepted yet.                                                                                             |

The latest manual installations are:

| App label     | Composition and intended use                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0xDMme Test A | Original synthetic account and preserved local test history; isolated service on the Mac.                                                                                                                      |
| 0xDMme Test B | Independent synthetic account on that same isolated service, for peer interaction.                                                                                                                             |
| 0xDMme Wallet | Complete ordinary product, without injected wallet/driver, private CA/admission or UI test runner; canonical `https://0xdmme.app` test service with system TLS. Reuses the former Recovery identity/container. |

The Wallet label identifies the manual build; it does not reduce product scope.
An ordinary browser at `https://0xdmme.app` and this installed Wallet app use the
same service and are intended to interact after real login and contact approval.
Test A/Test B use a different service and cannot join that public conversation.
The real wallet round trip and browser/app interaction remain manual tests.

Local services and a dedicated visible Mac browser peer were prepared with bounded
availability; their exact operational state, restart/stop commands, device/network
details and evidence remain under `.local/`. Browser-peer preparation and TURN
reachability are not iPhone call results. The Wallet build is independent of that
local fixture. No additional reboot, reset, payment, VPS activation, deployment or
store publication was performed for the handoff.

Earlier complete check runs remain tied to their recorded commits/checkpoints.
The later continuation passed focused strict types, affected-fixture lint,
dependency boundaries, four output-contract tests and the three signed manual
builds/installations. It did not produce a fresh complete aggregate or remote CI
pass after all later changes. Work remains local on
`codex/mobile-complete-flow-validation`; it has not been committed, integrated,
pushed or deployed by this run.

**Ponto importante:** individual synthetic/native passes do not certify real
wallets, complete Android/iPhone parity or release readiness. The remaining work
below is still required; no failed or unexecuted scenario is promoted to passed by
this documentation consolidation.

## Remaining work — current checkpoint

| Area                                   | Current state                                        | Required next result                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real wallets and cross-client use      | Manual; O04/O06                                      | Run MetaMask, Phantom and Backpack for each offered ecosystem on both platforms: real signature, return, address confirmation/private opening, cancellation/expiry, identity separation, linking/recovery and revoked-device rejection. Verify ordinary browser-to-installed-app messaging in the same public test environment.                                                          |
| System files/media/backup usability    | Partially verified                                   | Complete actual iOS file/photo selection, cancellation, encrypted send and independent content comparison. Verify saved external bytes and OS save/import of encrypted backups. Assess audible voice quality, headset and interruption behavior. Camera/optical QR and the already recorded client-byte/backup checks do not need blanket repetition.                                    |
| Live delivery and network changes      | Manual variants pending                              | Verify foreground arrival without refresh, reconnection, failed/cancelled operations and safe retry without duplication. Explicit read-receipt opt-in/persistence and the matching sender label already passed.                                                                                                                                                                          |
| Calls                                  | Native acceptance pending; O09                       | Use independently interactive endpoints with the authorized own TURN service; observe two-way audio, accept/reject/cancel/timeout, mute, hangup, interruption/reconnection and resource release. Signaling/service checks and TURN reachability alone are insufficient.                                                                                                                  |
| Remote native push                     | Blocked by implementation/signing prerequisites; O09 | Complete native registration/delivery integration and required signing/credentials, then validate privacy, mute/revocation, duplicates, background/locked delivery and wakeup. Existing Web Push/local-notification results do not close this. No paid enrollment or replacement architecture has been approved.                                                                         |
| Android storage/recovery failures      | Failed, unresolved; O05                              | Establish the cause of prior LevelDB/local-authority loss and partial-local-loss recovery failure. Reproduce/resolve the separate fresh-recovery private-conversation voice/history gate. Preserve identity and secret-custody rules; fresh-install and iPhone recovery passes do not erase these failures.                                                                              |
| Remaining platform/security coverage   | Incomplete; O03/O05/O07/O08                          | Close applicable physical Android coverage, locked-before-first-unlock and actual OS backup/restore, remaining adversarial frame/TLS/stream variants and unexecuted feature variants in the matrix. Include applicable representatives/delegated-authority and moderation/maintenance client flows. Do not reset the borrowed phone or repeat its reboot without separate authorization. |
| License/dependency distribution review | Draft/preliminary review only; O01/O02               | Finish rights/file scope/legal wording and adoption, exact-version mobile dependency/asset/WASM/plugin/source inventory, notices and source-delivery/store compatibility. Existing GPL/third-party obligations remain effective.                                                                                                                                                         |
| Integration and final verification     | Local task branch only                               | Review and commit the scoped change, integrate authorized work deliberately and run affected final checks/CI on the combined exact revision before any release action. No code activation follows from a push alone.                                                                                                                                                                     |
| Store/beta delivery                    | Not started; O10/O11                                 | Complete publisher/signing ownership, regions/accounts, release/upgrade/rollback compatibility, privacy/deletion/moderation/encryption declarations, review access and applicable store requirements. Obtain the remaining concrete enrollment/cost/publication approvals.                                                                                                               |

## Progress tracker

These statuses describe the current checkpoint, not the date of the historical
section in which a work package first appeared.

| Work package                                 | Status                          | Evidence / next action                                                                                                                                      |
| -------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision handoff and manual checklist        | Verified                        | Current summary, remaining-work table and historical records consolidated on 2026-11-04. Manual results are still awaited.                                  |
| ZK inventory/removal and plan reconciliation | Verified locally                | Initial inventory/removal and affected checks passed; integration and any VPS dependency review remain separate.                                            |
| Authored-code license finalization           | Investigating                   | Custom direction selected and draft prepared; rights, final wording, compatibility and adoption remain pending.                                             |
| Complete mobile distribution review          | Not started                     | Preliminary runtime/entry checks do not complete O02.                                                                                                       |
| Runtime selection and full-product builds    | Verified locally                | Capacitor 8.6.0 selected; Android installed-product and signed physical iPhone builds/individual flows passed. This does not close security or full parity. |
| Native HTTPS/session implementation          | Verified for recorded contracts | Platform owners and observed native cookie/HTTP/document controls exist. Remaining adversarial/platform coverage is tracked under O07.                      |
| Full feature/platform acceptance             | Implementing                    | Individual installed flows passed; manual cases, Android failures and unexecuted security/feature variants remain in the matrix.                            |
| Real-wallet/manual build preparation         | Verified — preparation          | Test A/Test B and ordinary Wallet installed preserving data; actual real-wallet and cross-client results remain manual.                                     |
| Native remote push                           | Blocked                         | Native integration and push-enabled signing/credentials are missing; no paid enrollment or replacement approach approved.                                   |
| Physical acceptance and beta readiness       | Implementing                    | Physical iPhone results recorded; physical Android/security/remaining feature gates and beta readiness unfinished.                                          |
| Integration/final CI and release             | Not completed                   | Later work remains local; final combined verification, licensing and release prerequisites remain.                                                          |
| Store enrollment/submission                  | Not started                     | No spending or publication is authorized by this document.                                                                                                  |

## Approved decisions

| ID  | Decision                                                                                                                                                             | Implementation status                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | Pursue installed apps for both Android and iPhone, reusing existing functionality instead of starting over.                                                          | Full product packages and native session owners implemented locally; individual Android and physical iPhone flows passed. Complete parity/security acceptance remains open. Store submission is not approved. |
| D02 | Remove the current ZK implementation/dependencies from the project scope; the owner accepted removal because this functionality has not been used in the app so far. | Verified locally on the task branch; integration into main remains pending.                                                                                                                                   |
| D03 | Preserve messaging end-to-end encryption, wallet identity, recovery, and existing privacy requirements. Removing ZK is not approval to weaken these contracts.       | Existing behavior must remain intact.                                                                                                                                                                         |
| D04 | Create a living decision and implementation handoff document; its original authoring task was documentation-only.                                                    | This document.                                                                                                                                                                                                |

ZK may be reconsidered later, but no replacement implementation, server-side proof
generation, paid license, external relay, or platform-specific feature reduction
has been approved. Removing ZK does not authorize deleting unrelated signed
representative credentials, agreements, or existing group authorization checks.

## Final product direction: full web parity

The owner's latest instruction on 2026-11-01 settles mobile scope: everything
working in the web application must work in both installed mobile applications.
This includes all existing wallets, networks, features, privacy rules, recovery,
backups, media, communities, notifications, and calls. No reduced mobile edition,
wallet subset, or silent functionality removal is authorized. Inventory the actual
web implementation at the integration baseline and use it as the acceptance matrix.
This does not automatically add features absent from the web application, including
an official token launch or stronger background guarantees than currently provided.

No further product-definition round is required before technical work. The agent
should select routine implementation details and validate them against that baseline.
Storage, session transport, wallet return routing, runtime selection, and platform
integration are engineering work, not invitations to ask the owner to redesign the
product. Escalate only demonstrated material conflicts, costs/external commitments,
or changes to approved behavior under the repository's existing rules.

The owner declined further case-by-case licensing decisions: retain the approved
commercial-offering and token restrictions without a questionnaire about donations,
cost recovery, or support. Legal/dependency checks and rights-holder information
needed for final adoption remain delivery work. Store accounts, fees, and legal
publication details are not waived, but need not block initial local engineering.
ZK removal is separately approved; track implementation and verification below.
The documentation-only constraint applied to the original authoring task. The owner has now invoked implementation of this handoff in a separate task.

## Historical initial inspection — 2026-11-01

This is the pre-implementation inventory, not the current installed state.
Capacitor, native projects and subsequent product acceptance are recorded in the
current summary and dated implementation history. The preliminary inspection found:

- The client uses TypeScript and a web build, with PWA support; `package.json`
  did not yet declare Capacitor. Native projects had not yet been established
  by that investigation.
- [Licensing record](../LICENSES.md) declares authored client/shared code and
  selected frontend build tools GPL-3.0-only. That decision was made to retain
  the Semaphore proof stack. Removing a dependency does not change this license.
- Semaphore packages are MIT, but their dependency tree includes GPL components
  such as `snarkjs`. See the
  [dependency review](../LICENSES.md) and
  [license checker](../src/tools/check-licenses.ts).
- A read-only esbuild dependency analysis of `src/client/app/index.ts` found no
  Semaphore, `snarkjs`, or ZK probe/worker inputs in that entry's bundle. This is
  evidence about one entry, not an audit of every asset, worker, WASM binary,
  source archive, or future mobile distribution.
- The messaging engine, Matrix Crypto WASM, is recorded as Apache-2.0. It is not
  the reason GPL was adopted. Its transitive/native contents still belong in the
  final distribution review.
- Historical ZK-related code existed in `src/client/zk.ts`, `src/client/zk-worker.ts`,
  `src/client/zk-probe/`, and `src/shared/zk-probe/`; inspect server consumers,
  tooling, fixtures, artifacts, and documentation as well before deleting anything.
- Browser functionality is not proof that wallet return, storage, media, push,
  or suspended execution will work in an installed app.

That initial inspection excluded unrelated checkout edits, including the main
plan and package file. Later authorized implementation changed the task branch as
recorded below. Revalidate the combined state at integration; this historical
inventory is not a claim that those files or native dependencies remain unchanged.

## Plan reconciliation and preserved requirements

The [main implementation plan](../README.md) now records installed Android/iPhone delivery and retires the ZK prerequisite in its current decisions, architecture and milestones. Earlier experiment results are retained as historical evidence. Other approved requirements continue to apply.

Local ZK removal and corresponding plan reconciliation passed their recorded
checks. Integration remains pending. Keep the main plan and affected implementation
documents consistent as the combined work progresses, preserve historical
decision context and clearly mark superseded requirements. Review at least:

- Product/platform statements and consolidated decisions.
- Block 01's technical selection and licensing rationale.
- Block 12's private group authorization requirements.
- Block 14's future storage credentials and quotas; clarify which future ideas
  remain deferred rather than silently replacing them.
- V1 milestones and acceptance criteria that currently require ZK.
- Dependency/license records, source distribution instructions, probe scripts,
  build artifacts, tests, and quality gates affected by removal.

Do not treat blocks 12A/12B or ordinary group authorization as disposable merely
because they are adjacent to ZK in the plan. If removal affects a live security
contract, stop the affected change, explain the evidence, and obtain the owner's
choice before substituting another mechanism.

## Open decisions and investigations

| ID  | Item                                         | Current recommendation or next investigation                                                                                                                                                                                                                                | Closure evidence                                                                                                                                         |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O01 | License for authored mobile-distributed code | Custom policy selected and English draft prepared. Rights/file scope, final legal wording, distribution compatibility and formal adoption remain pending; existing licenses remain effective.                                                                               | Reviewed rights and final license adoption; corresponding notices and licensing records updated.                                                         |
| O02 | Complete distributed dependency inventory    | Complete mobile-package inventory is not finished. Preliminary npm/runtime/entry reviews do not cover every worker, WASM file, asset, plugin, source archive and transitive dependency.                                                                                     | Exact-version inventory, obligations, compatible distribution route and source/notice delivery verified.                                                 |
| O03 | Mobile runtime                               | Capacitor 8.6.0 is selected and full-product native builds/individual runtime flows passed. Android evidence is emulator-based; actual physical iPhone coverage exists. Complete physical/support and runtime/plugin review remains.                                        | Recorded runtime/build prerequisites plus the remaining applicable physical and distribution checks; no runtime reselection requested.                   |
| O04 | Wallet support and return flow               | Ordinary signed Wallet build prepared without injected signer. Real MetaMask/Phantom/Backpack round trips, offered ecosystems, absent/closed app, cancellation/expiry, suspension and return remain manual on both platforms.                                               | Observed supported matrix; any material support reduction or new relay requires explicit owner approval.                                                 |
| O05 | Local secrets and history                    | Storage/session ownership and OS protections are implemented; recorded persistence, recovery and custody controls passed. Android local-authority/partial-loss failures remain unresolved; locked-state, OS backup/reinstall and other lifecycle variants remain open.      | Reviewed threat/lifecycle model, resolved failed cases and remaining persistence/recovery/security evidence without weakening identity or custody.       |
| O06 | Moving from browser/PWA to app               | Existing linking/original-wallet recovery is reused and synthetic installed recovery passed. Browser storage is not shared with the app. Canonical site and ordinary Wallet app use the same service; real-wallet linking/return and cross-client acceptance remain manual. | Observed real identity-preserving browser/app use, device limits, linking/recovery/history and revoked-device rejection.                                 |
| O07 | Native-to-server session contract            | Native origin/document, HTTPS/stream and protected cookie owners are implemented; recorded Android/iPhone controls and actual session flows passed. Remaining adversarial TLS/frame/stream and platform variants stay open.                                                 | Explicit contract and observed regression/security matrix, including failures and lifecycle variants; no broad origin/CSRF relaxation.                   |
| O08 | First mobile release scope                   | DECIDED: full parity with every working web feature on Android and iPhone. Individual results do not close the matrix; remaining feature/security/manual cases must pass.                                                                                                   | Complete applicable acceptance on both OSes; demonstrated material conflicts require explicit resolution.                                                |
| O09 | Native push and calls                        | Remote native push is missing and requires native integration plus signing/credentials. Generic local notification passed only as an OS control. Own TURN/browser prerequisites exist; native call audio/lifecycle acceptance remains pending.                              | Approved compatible integration/privacy/resource lifecycle and physical delivery/call behavior; no paid enrollment or replacement architecture inferred. |
| O10 | Distribution identity and accounts           | Local development signing is configured for the authorized iPhone. Publisher identity, personal/organization distribution accounts, regions, costs and release signing custody remain undecided; no enrollment/payment approved.                                            | Owner approval for concrete costs/external actions; distribution signing ownership and credential custody established outside Git.                       |
| O11 | Store compliance and release operations      | Release review is not complete: privacy/deletion/moderation/age/encryption declarations, review access, applicable wallet rules, old-client API compatibility and signed rollout/rollback remain. Current code is local and unintegrated.                                   | Requirements mapped to actual behavior, final integrated revision/checks and approved reproducible distribution/release process.                         |

## Licensing interpretation: avoid repeating an overstatement

Apple permits open-source components. The unresolved issue is compatibility of
specific license obligations with the complete distribution terms, not whether
source code is public. The FSF's historical App Store enforcement example concerns
GPLv2 and older terms; it is relevant background, not a definitive current legal
review of this application's GPLv3 distribution.

Apple's current standard EULA includes open-source qualifications and allows a
custom EULA, but those facts alone do not settle all distribution obligations.
Neither store approval nor a passing npm license checker establishes legal
compatibility. Obtain a qualified licensing review where the remaining terms are
uncertain before store distribution. Android distribution must also receive its
own review rather than being assumed compliant.

If the owner holds all necessary rights to authored code, alternative licensing
may be available for that code. It does not relicense third-party GPL dependencies
or revoke rights already granted for distributed versions. Do not change the
license file or promise App Store compatibility without completing O01/O02.

### Owner clarification: commercial reuse

On 2026-11-01, the owner rejected the Apache-2.0 recommendation because third
parties could reuse the code to release a commercial product. Source visibility
is desired; unrestricted third-party commercial exploitation is not. Apache-2.0
has not been approved. Neither GPL nor AGPL prohibits commercial reuse.

### Current source-available licensing direction

On 2026-11-01, the owner clarified that forks should not be prohibited and that
commercial distribution is the principal objection. This supersedes the earlier
blanket permission requirements for public forks and all third-party distribution.
Do not implement that earlier restrictive policy.

Confirmed permissions remain reading, study, auditing, local tests, private
modification, and continuous personal use. Noncommercial public forks must not be
prohibited by default. Direct contributions and necessary excerpts for audit
commentary remain intended permissions; prepare appropriate contribution terms.
Security investigation must use owned or authorized environments. Access to the
official backend remains subject to service access and security rules.

The owner has now selected a custom source-available license and requested its
preparation. The [English license draft](MOBILE_SOURCE_LICENSE_DRAFT.md) implements
the agreed policy; it is not yet effective and does not replace existing licenses.
The accepted direction permits noncommercial forks and redistribution while
requiring permission for commercial offerings, paid derivative services, and
associated token launches. Do not adopt PolyForm or Apache as a substitute.
Exact wording, ownership, dependencies, and store distribution still need review.

### Token and coin restriction approved by the owner

The owner requires an explicit restriction on third-party coins/tokens associated
with derivatives of the application and states an intention to launch an official
0xDMme coin. Treat creating, issuing, promoting, or monetizing a coin/token tied to
a copied or modified application or a service based on this code as requiring
explicit permission, even if the application, fork, or initial token distribution
is free. Do not rely solely on a restriction on selling software copies.

The license draft must distinguish this restriction from ordinary wallet support,
existing asset transfers, security tests, and private experiments; those features
are not automatically prohibited token launches. Do not allow third parties to
present a token as official or endorsed by 0xDMme without permission. Review brand
protection separately from copyright permissions; do not claim that a code license
can prohibit independently developed assets with no use of the protected code.

This is an approved licensing requirement, not approval to build, issue, market,
or sell an official coin. No network, token economics, contract, sale, fundraising,
or mobile integration has been selected. Any future official coin work needs its
own scope, dependency/security review, applicable legal review, and store-policy
assessment. Do not infer that it is required for the first mobile release.
The custom draft includes an explicit token clause; its scope and enforceability
still require legal review.

No additional product-policy decisions are requested for licensing edge cases.
Complete legal identity/contact, exact file scope, rights, dependencies, and legal
review before adoption; preserve ordinary use of the official app by businesses.

The choice of a custom license is approved; the legal draft remains provisional.
The policy remains source-available if it restricts commercial distribution; do not
market it as OSI open source. No GPL/Apache alternative should silently grant the
commercial reuse the owner intends to restrict.

The owner reports no launch or distribution. Confirm rights and relevant release
history before adoption without treating the owner's statement as a completed
legal review. Third-party licenses and any valid existing grants remain unaffected.
Remaining work for O01 is final wording, scope and rights-holder identification,
and legal and compatibility review; do not reopen approved policy by default.
No license file has changed, and no legal service purchase is authorized.

## Original implementation sequence

These work packages preserve the initial implementation order, not the current
backlog or evidence that a step passed. Use the current summary, remaining-work
table and progress tracker above to decide what still needs execution; do not
restart completed preparation because it appears in this original sequence.

1. **Establish the integration baseline.** Inspect status, current instructions,
   relevant modules, and actual ZK consumers. Use a separate branch/worktree when
   another task is active; do not overwrite or stage another task's changes.
2. **Reconcile scope and remove ZK coherently.** Update affected decisions, remove
   unused implementation/dependencies/artifacts and their obsolete checks, and
   verify existing authorization and E2EE remain intact. Preserve lockfile
   consistency and meaningful remaining license checks.
3. **Resolve distribution licensing.** Finish O01/O02 before treating a native
   package as suitable for store distribution. Do not replace cryptography as a
   licensing shortcut without an explicit approved decision and security review.
4. **Run a focused native feasibility prototype.** After selecting the runtime,
   validate wallet login/return, account linking or recovery, a real encrypted
   message exchange, persistence across restart, and suspend/resume on both OSes.
   Use synthetic/test accounts and content. Report limitations, not simulated
   success. A prototype is not acceptance of full mobile support.
5. **Implement platform integrations.** Complete the chosen storage, push, media,
   calls, links, keyboard/navigation, safe-area, and sharing behavior. Keep the web
   application working and avoid duplicating domain rules across platforms.
6. **Validate and prepare distribution.** Run applicable checks and physical
   acceptance, then prepare signing, beta distribution, store materials, privacy
   declarations, source delivery, and compatible versioning. Obtain any still
   required publication/cost/infrastructure approvals at the concrete final step.

## Responsibility and verification requirements

Before adding cross-module state or dependencies, state which module owns each
platform resource and its initialization, updates, cancellation, and disposal.
Keep domain rules in their existing owners; platform modules should expose narrow
capabilities. Do not turn `src/client/app/index.ts` into a native integration
controller or add unrelated feature styling to the global stylesheet.

Verification must be proportional to each change:

- Documentation: consistency, local links, formatting, and diff review.
- ZK removal: applicable existing quality gates, dependency checks, and regressions
  for any affected live contract; no arbitrary replacement tests for deleted code.
- Authentication/storage: critical failure and persistence tests, with physical
  devices for wallet/OS behavior that mocks cannot establish.
- Push/calls: muted/revoked sessions, duplicate or stale events, locked screen,
  suspension, interrupted connectivity, permission denial, and cleanup.
- Releases: upgrade without silent history loss, recovery, supported old-client
  behavior, source/license notices, and reproducible signed build preparation.

Record what passed, failed, was not run, and still needs owner acceptance. Review
module ownership, dependency direction, shared state, secret handling, and resource
lifecycle before declaring completion. No real chat readiness is implied by an
installed app or a successful store review.

## Decision log

Implementation invocation on 2026-11-01 supersedes the original documentation-only task boundary; approved product and licensing policy remains unchanged.

| Date       | Record                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-01 | Owner explored Android/iPhone apps that reuse the working web application. Capacitor was suggested, not selected.                                                                                                                                  |
| 2026-11-01 | License investigation distinguished authored GPL licensing, the Semaphore dependency tree, and the Apache-licensed messaging engine. Full mobile-package licensing remains unverified.                                                             |
| 2026-11-01 | Owner accepted removing currently unused ZK. No replacement, relicensing, or privacy change was approved.                                                                                                                                          |
| 2026-11-01 | Owner requested this living document for another implementing agent and explicitly prohibited implementation in the documentation task.                                                                                                            |
| 2026-11-01 | Owner approved the custom source-available permission policy, including continuous private personal use and permission requirements for redistribution and third-party services. Legal wording and license adoption remain pending.                |
| 2026-11-01 | Later clarification supersedes blanket fork restrictions: owner does not want to prohibit forks and principally objects to commercial distribution. Exact licensing and hosting/monetization cases remain open.                                    |
| 2026-11-01 | Owner requires permission for third-party coin/token launches tied to app derivatives, including free forks, and states an intention to launch an official coin. No official-token implementation or launch authorized by this documentation task. |
| 2026-11-01 | Owner selected the custom license and requested preparation. MOBILE_SOURCE_LICENSE_DRAFT.md created as a non-effective English draft; existing GPL and third-party notices remain unchanged pending rights/dependency/legal review.                |
| 2026-11-01 | Owner settled full web-feature and wallet parity on both mobile platforms and declined additional licensing edge-case decisions. Remaining technical investigation belongs to implementation; no reduced mobile scope authorized.                  |
| 2026-11-04 | Owner chose manual takeover of remaining interactive tests, including real wallets. Three existing iPhone identities were updated without reset; this preparation does not accept a real wallet flow.                                              |
| 2026-11-04 | Owner requested consolidation of this document: current summary/pending work take precedence over dated preparation and failure records. No new implementation, scope reduction or release action is implied.                                      |

For future entries, record the owner's actual choice, affected open-item IDs,
consequences, and validation required. Do not turn suggestions into decisions.

## External references

Consulted on 2026-11-01; recheck current terms and platform requirements before use.

- [Capacitor documentation](https://capacitorjs.com/docs)
- [Apple standard application EULA](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/)
- [Apple Developer Program agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [FSF historical App Store GPL enforcement explanation](https://www.fsf.org/blogs/licensing/more-about-the-app-store-gpl-enforcement)
- [Google Play distribution agreement](https://play.google/developer-distribution-agreement.html)
- [Google Play new personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Current project GPL text](../LICENSE-GPL-3.0.txt)

## Historical implementation and execution records

The records below describe their individual checkpoints. An earlier blocked
simulator, unavailable native owner or failed restore is not the latest status:
later physical execution and manual preparation are summarized above. Preserve
all observed failures and their limits; a later pass closes only its own scenario.
Historical test totals and complete checks must not be presented as a fresh run
against every later edit. Simulator repair remains deferred after the owner's
choice of the physical phone.

### Implementation baseline — 2026-11-01

The owner invoked execution of this handoff in a new task. Work started from integration commit `20d8fe09` on `codex/mobile-apps-foundation`, in an isolated worktree. Concurrent uncommitted integration-checkout changes are excluded; revalidate the merged baseline before native parity acceptance.

The initial inventory found ZK consumers only in the synthetic laboratory: client proof/UI/worker, server verifier/artifact host, shared constants, preparation/CLI tooling, one test and two CI preparation steps. The real web entry, live group authorization, E2EE and recovery do not import these modules. The initial ZK-only change removed 146 lockfile package entries without upgrading remaining package versions. Subsequent Capacitor toolchain entries are a separate addition, not part of that removal count. Existing npm licenses are still checked; obsolete GPL/Esprima exceptions are removed rather than carried into the mobile review.

The probe host continues to own synthetic HTTP assets/relay lifecycle; removing its ZK routes does not create another controller. The mobile probe admission helper stops issuing entry redirects for the retired page. Messaging, group membership and device/recovery state retain their existing owners. No database, transport-origin, quota, retention or cryptographic format change is included.

Validation completed for this work package:

- Node 24.14.0, clean `npm ci --ignore-scripts` from the local cache; no new packages or remaining package-version changes.
- Lint, strict types, dependency boundaries, npm license gate, formatting, web build and evaluation build passed. The web build produced 40 public assets.
- All 485 application tests passed across the initial run and focused reruns. The restricted environment initially denied local TCP/Unix sockets; the six affected files then passed with local socket access (33 tests). Existing E2EE, recovery, group, wallet and source-delivery checks remain covered.
- All 164 deployment tests and 16 moderation evaluation tests passed with Python 3.13. The original default Python 3.9 lacked the archive API required by existing tooling; no production interpreter or system installation was changed.
- The aggregate `npm run check` initially stopped at the socket restriction. Its passing stages were retained; affected tests and the remaining Python stages were run separately, rather than claiming that initial command exited successfully.
- Historical deployment tests now use a compressed, immutable copy of the exact reviewed push lock (SHA-256 `a94082f173b3d553c15ea1c8b0db29452b7b79c41615c30478f0a924a12937db`). Their existing digest checks remain unchanged. No executor, whitelist or historical deployment authorization was broadened to accept the new lock.
- Local Markdown links and the diff were checked. Structural review confirmed that live domain modules gained no state, resources or dependencies; the probe host lost the ZK worker/artifact lifecycle. License enforcement remains in its existing tool, and historical test input ownership is isolated in a test fixture helper.

For the initial ZK work package, no PostgreSQL integration suite, remote CI, native build, physical acceptance, final license adoption or VPS/store publication was performed. Changes remain local in the isolated task worktree; integration must preserve concurrent work and repeat affected checks on the merged baseline.

### Runtime feasibility progress

Capacitor 8.6.0 is now installed and selected for local feasibility; native runtime acceptance remains unfinished. Its [configuration contract](https://capacitorjs.com/docs/config) uses a local packaged origin and documents `server.url` as a live-reload option rather than a production shortcut. Repository inspection found relative `/api/` calls with `credentials: 'same-origin'`, server origin admission, and recovery statements bound to `location.origin`. The canonical identity-origin contract is now implemented in `application-origin`; the client API adapter is implemented; native HTTPS/private-cookie owners remain needed. This is not evidence that Capacitor cannot support the product. Keep CSRF/origin enforcement and existing cryptographic formats intact while defining that contract.

The next feasibility slice must validate packaged assets, session transport, wallet opening/return, account linking/recovery, one real encrypted exchange, durable restart and suspend/resume on both platforms. Review exact runtime/plugin licenses and maintenance before installation. Native verification requires the supported toolchains; the current [Capacitor 8 setup documentation](https://capacitorjs.com/docs/getting-started/environment-setup) requires Xcode 26 or newer for iOS. No native success or physical support is inferred from web tests. See the [runtime contract and experiment](MOBILE_RUNTIME_FEASIBILITY.md) for implementation ownership, local commands, security boundaries and remaining work.

### Native feasibility verification — 2026-11-01

The complete `npm run check` passed with the project's Node version and the locally selected Python 3.13: lint, strict types, dependency boundaries, licenses, formatting, web/mobile/evaluation builds, **493 application tests**, **164 deployment tests** and **16 evaluation tests**. This is a new successful aggregate run, separate from the earlier ZK run's restricted-socket retry record.

Both native projects synchronized successfully; copied Android/iOS assets match every byte count/hash in the mobile build manifest. Native XML was checked for well-formedness and project source for accidental machine paths. These checks are not native compilation.

The assembled browser experiment visibly created the encrypted fixture, reopened and verified it after a document reload, and cleared it successfully. Nonextractable signing/wrapping keys, Web Locks and Matrix WASM encryption were exercised. The report explicitly identifies browser preview; no Android/iOS runtime or OS restart result is inferred. Screenshot, logs and actual toolchain readiness are private in `.local/mobile-runtime-review/`.

Final structural review: the seven existing identity/link consumers gained only the narrow `applicationOrigin()` dependency, retaining domain rules and all mutable state. The origin owner has no resources or mutable configuration. The isolated feasibility module owns only its synthetic database, lock and cancellation lifecycle; its page owns UI operation state. The mobile build owns a separate bounded artifact directory. Native SDK access is restricted to the native entry by the existing boundary tool and regression tests. No app controller, database, server transport or product storage owner absorbed native responsibilities.

Remaining work includes native compilation/toolchain setup, physical feasibility, the private API/session adapter, durable secret/backup policy, wallet return, original-account linking/recovery and the full parity matrix. No product account UI is loaded in this development shell. No commit, merge, remote CI, VPS activation, final relicensing or store publication is claimed.

### Client API transport — 2026-11-02

The client-facing native API adapter and installed/web dispatch boundary are implemented locally. Account/API diagnostics retain their public behavior; public media/views and local GIF configuration preserve their credentials choices through the same boundary. Native state is limited to exchange admission and stream/cancellation lifetimes, with no cookie store or server authorization logic in domain modules. Explicit import restrictions are covered by the existing quality-gate tests.

At that checkpoint, the [native API contract](MOBILE_API_TRANSPORT.md) recorded validated bridge messages, resource budgets, cancellation and fixed-destination requirements; Android/iOS HTTPS/cookie/frame guards were not yet implemented. Native absence and failed cleanup failed closed without browser HTTP fallback. Controlled bridge tests were client-contract evidence only. The installed shell did not yet load product account UI. Later platform owners and full-product execution are recorded below and in the current summary; this historical gap is not the current O07 implementation status.

Validation of this increment passed: **517 application tests**, strict types, dependency boundaries, lint (including the final protocol edit), formatting and web/mobile builds. The two mobile package checks passed again against the fresh build, and both native projects synchronized. The 164 deployment and 16 evaluation results from the prior stage remain valid; those unaffected suites were not repeated. PostgreSQL integration, real native networking/cookies and native compilation were not exercised.

Structural review confirmed that API diagnostics and domain callers gained only the request-dispatch dependency; their state, authorization and domain rules remain in place. The dispatcher owns one-time native registration, the transport pool owns admission/shutdown, and exchanges own cancellation, stream demand and cleanup. The protocol validator owns no mutable resources. No native session/cookie implementation was hidden in a UI controller, and source delivery includes the new client modules.

No commit, integration, deployment, new dependency, cryptographic-format change or store publication is included. Remaining native implementation and toolchain prerequisites are recorded in the API contract; client-contract tests are not native acceptance.

### Native compilation — 2026-11-02

The existing synthetic feasibility projects now compile for both platforms.
Android `:app:assembleDebug` completed successfully with 71 tasks executed; its
APK passed Android signature verification. The iOS generic-device Debug build
completed successfully with signing disabled. Both products contain the expected
five feasibility assets, verified against every byte count and hash in the mobile
build manifest. The iOS bundle retains the development identifier and disabled
global HTTP/cookie patching. The generated Swift resolution record pins the
already-declared Capacitor 8.6.0; no dependency declaration changed.

This closes the initial native compilation prerequisite, not O03/O05/O07 or full
mobile acceptance. Neither product has been executed on a device or simulator;
the iOS product also needs development signing before physical installation.
Wallet return, persistent private sessions, backup/secret custody, recovery,
encrypted exchanges and the complete parity matrix remain to implement/validate.
Exact host/toolchain versions, device inventory, binaries and detailed evidence
remain exclusively in `.local/`.

Structural review: this increment records compilation evidence and the generated
exact-version Swift resolution; application ownership and runtime behavior are
unchanged. Documentation formatting/links and generated dependency resolution
were checked. Existing application/deployment/evaluation suites were not repeated
for this toolchain/documentation increment.

### Native runtime tests — 2026-11-02

Android instrumentation passed the synthetic fixture checks in the packaged
Capacitor WebView: creation, activity/WebView recreation, reopening, and cleanup.
A host-controlled create/force-stop/restore workflow also passed; the host checked
that no target process survived before restoration. Web Locks, nonextractable
WebCrypto device keys and Matrix WASM encryption were exercised. This consists
of three successful instrumentation invocations of the same lifecycle test.

The iOS UI-test target/scheme also passed one complete synthetic WKWebView
workflow: creation, verified process termination, relaunch, stored-fixture
reopening and cleanup. Initial attempts encountered simulator migration and
cold-WebKit readiness delays. After observing the native page load beyond the
original startup wait, only readiness was extended to 120 seconds; fixture
operations retain their 35-second waits. Reproduction commands are in the
[Android](../mobile/android/README.md) and [iOS](../mobile/ios/README.md) test notes.
The native tests are explicit platform commands, separate from `npm run check`.
Exact device/toolchain inventory and artifacts remain exclusively in `.local/`.

Structural review: platform test harnesses own their activity/application,
callbacks, deadlines and synthetic cleanup. The iOS project adds only a separate
test target/scheme and references; application domain, transport and crypto
ownership are unchanged. No new package or production permission was introduced.
Physical acceptance, backup/secret custody, native private sessions, wallets,
recovery and the full parity matrix remain open.

### Extended flow-validation authorization — 2026-11-02

The owner authorized completion of all feasible test flows, incremental evidence
in the document, and prerequisite code changes on the separate
`codex/mobile-complete-flow-validation` branch. No integration into main is
included. For this task, the owner explicitly permits continuing after context
compaction. Real MetaMask, Phantom and Backpack app interaction is reserved for
manual owner validation. Synthetic signers must still follow the existing real
authentication/device/encryption contracts. Track layer-specific results and
concrete prerequisites in the [flow matrix](MOBILE_FLOW_TEST_MATRIX.md).

The complete existing database/service integration suite passed in an isolated
local PostgreSQL cluster: **193 tests, 28 top-level groups, zero failures and zero
skipped**. Synthetic media runtime checks were enabled. This extends backend
evidence; it does not establish full native UI acceptance.

### Full installed product integration checkpoint — 2026-11-02

The owner correctly identified that a shared browser screenshot did not establish
Android/iPhone acceptance. Browser flows remain complementary evidence only. The
mobile builder now packages the complete existing product through dedicated
installed entries; the separate feasibility builder retains the historical lab.
The canonical origin, shared CSP and existing cryptographic formats are preserved.

The Android owner now composes guarded main-frame/document messaging, independent
OkHttp HTTPS streams and device-encrypted private cookie custody. Request and
response state remain outside the app coordinator. Cookie ownership is singular
per process across overlapping Activity teardown/creation, and stream disposal is
serialized with reads after a real native test exposed a shutdown race.

An explicit debug-only private overlay supplies a fictitious signer and a loopback
TLS peer trusted through its own CA with ordinary hostname checks. Release
composition has no override. The service retains real canonical-origin challenge,
signature, device and encryption rules; no production authentication bypass is
introduced. Device/network/certificates, credentials and artifacts remain private.

Passed Android product instrumentation: synthetic EVM login/connected account UI, Activity/WebView recreation, session restoration after verified process
termination, and no authentication cookies in WebView. Four separate native
policy/custody/document cases passed in the later completed run. Three installed-channel unit tests also passed.
iPhone full-product source and app-hosted tests compile; no equivalent iPhone runtime pass or complete mobile feature acceptance is claimed. See the incremental flow matrix.

The native build dependency requires compile SDK 37. Android compilation now uses
AGP 9.1.1 and Gradle 9.3.1 with verified distribution checksum; min SDK 24 and
target SDK 36 remain unchanged. Capacitor remains exactly 8.6.0. Full release
compatibility, dependency notices, physical acceptance and CI remain open.

### Installed product validation: private profile and pending refresh

The synthetic Android peer completed actual private-profile opening, encrypted
name/preferences save, restoration on a subsequent app run without wallet
re-confirmation, and theme persistence. Connected-session checks alone are not
used as evidence of private-key opening. Contact and encrypted-message acceptance
is being exercised between two isolated installed Android application IDs.

A regression in the existing device-state owner cleared verified authority
while an asynchronous directory refresh was still pending. A failing controller
test reproduced the transition. The owner now publishes a complete verified
snapshot after validation; errors and freshly verified revocation still clear
authority. Sixteen focused device/lifecycle/opening cases passed across the
affected runs. This preserves the existing identity, recovery and authorization
contracts. It does not resolve the older synthetic fixture's mismatched pinned
root/public identity, which remains a separate failed case.

iPhone full-product source and the app-hosted test target compile. Simulator
boot progressed with Xcode Device Hub, but installation exceeded its bounded
deadline, including after a narrowly verified current-user CoreSimulator service
recovery. No device data was removed. At that checkpoint, native iPhone product
flows were blocked until installation/execution could be observed. The later
authorized physical continuation supersedes this execution block. See the
[flow matrix](MOBILE_FLOW_TEST_MATRIX.md) for per-layer results and limitations.

### Installed Android encrypted exchange — 2026-11-02

The two installed Android applications now passed an actual encrypted text
exchange in both directions, independent recipient opening with matching message
identities, and genuine recipient delivery/read receipts in both directions.
Both used the existing synthetic wallets/accounts after genuine new-device
recovery. Conversation initialization and current-epoch message recovery were
completed through the public UI before the exchange; isolated read-only checks
confirmed that state. No fixture inserted protocol records or bypassed authority.

The test drivers now distinguish editable local drafts from enabled sending,
wait for conversation initialization on each process opening, and observe the
mounted route. These are test-driver corrections. Earlier failed attempts remain
recorded, including native IndexedDB loss and environment interruptions. Strict
durability requests are hints; the successful exchange does not close general
storage-durability or physical-device acceptance.

Four native Android policy/cookie/document cases and a separate real native
HTTPS unauthorized-response/EOF case also passed. iPhone full-product compilation
remains separate from runtime acceptance. The isolated warm-boot diagnostic reached its 600-second deadline during CloudRecentsMigrator, before even minimal-app installation; the task simulator was shut down with data preserved. Android edit/quote, exact attachment recovery, group exchange, text status, public handles and same-account fresh-install recovery have since passed. Native media/files, public interactions, backup, live push and the other matrix rows retain their own acceptance.
The latest per-flow results belong in the [flow matrix](MOBILE_FLOW_TEST_MATRIX.md).

### Installed-product checkpoint before physical iPhone — 2026-11-03

Android additionally passed original-account fresh-install recovery, an existing
installation upgrade, exact original attachment recovery, both directions of
existing-group messages, text status, public profiles and approved encrypted
public DMs. Local search, pin persistence/restoration, contact privacy,
block/unblock/renewed consent, complete encrypted backup/import with truncated
archive rejection, background continuity and logout/same-account return passed.

The community coordinator now owns only its own command controls; post controls
retain their separate owner's busy state. Android media permissions have their
own bounded native owner and four passed native contracts. A later healthy isolated phone completed post/read/vote/reply and emulated microphone capture, encrypted public-DM voice delivery and recipient playback. Earlier System UI interruptions remain recorded. Fresh-recovery private-DM history is still gated in its separate failed case. A fresh isolated phone comparison uses the same compiled artifacts
and genuine recovery of the same original accounts, preserving prior devices.
The older local storage-loss cases remain unresolved; no key-store replacement,
identity relaxation or reduced V1 scope is adopted. At that checkpoint, iPhone full-product runtime
was blocked before execution. The later physical continuation below supersedes
that execution block. See the [current per-flow matrix](MOBILE_FLOW_TEST_MATRIX.md)
for evidence, validation results and concrete remaining prerequisites.

Final local verification on 2026-11-03: the complete `npm run check` passed,
including 529 application tests, 164 deployment-tool tests and 16 evaluation
cases. Android v10 product/test builds passed. The final installed native run
passed reply/read and emulated microphone permission/capture/encrypted public-DM
send/independent playback. These results do not close iPhone runtime, physical
acceptance, the failed private-conversation recovery path or the remaining
platform integrations listed in the flow matrix. All work remains local on
`codex/mobile-complete-flow-validation`, without integration or deployment.

The iPhone follow-up on 2026-11-03 confirmed compatible tools and completed Xcode
first-launch setup, but both installed runtimes stalled during system migration
in newly isolated local device sets. Both bounded attempts stopped before even
minimal UIKit app installation. No physical target was available. Full-product
iPhone execution was blocked at that checkpoint. The owner subsequently restarted
the host. Migration completed and a byte-verified private local copy resolved a
coordinated project-read wait, allowing a fresh native build. The complete host
installed and opened; the first nonempty product test failed at installed-entry
connection initialization before login. Startup diagnosis and the full iPhone
matrix remain open. Existing devices and the Android validation were preserved;
no product behavior changed in this continuation.

### iPhone installed authentication checkpoint — 2026-11-03

The complete installed iPhone account test passed genuine synthetic login,
authorized private opening and empty WebView cookies, with exactly one executed
case and zero failures/skips. The host process was then verified stopped; the
new-process restoration case failed at native-entry connection initialization.
Original session/account data remain intact. The [flow matrix](MOBILE_FLOW_TEST_MATRIX.md)
records this partial acceptance and the continuing startup investigation. Real
wallet apps, physical behavior and the remaining iPhone feature matrix are open.

The follow-up isolated a bounded-readiness defect: the native protected cookie
owner could complete after the old retry window had expired. The existing
installed-channel owner now applies a monotonic 30-second startup budget with
bounded serial pending polls. Authentication, native origin/document checks,
secret storage, retention and HTTP mutation behavior are unchanged. The focused
failing-before/passing-after regression and remaining native acceptance are
recorded in the flow matrix and [transport contract](MOBILE_API_TRANSPORT.md).

The corrected-budget native restoration still failed. A subsequent bounded
diagnostic isolated an approximately 72-second protected-item read that eventually
returned success, but did not finish acceptance. That simulator environment could not
close restored-session or dependent iPhone flow acceptance. Later physical-phone
restoration results are recorded below. Original state and
private evidence are preserved; no repeated deadline increase, session reset or
secret-custody replacement is adopted. A responsive native environment or an
authorized physical target remains necessary. See the matrix for exact results.

### Foreground startup scheduling — implementation follow-up

The owner requested continued iPhone investigation. Native session initialization
was still dispatching the protected-cookie operation as `utility` work despite
blocking foreground entry. Its existing owner now uses `userInitiated` off the
main thread, consistent with the platform's scheduling guidance. This routine
scheduling correction does not change protected storage or account identity.
A new restoration comparison must determine the observed outcome; historical
failures and the current thirty-second readiness budget remain explicit.

### Direct installed iPhone test execution

The fresh comparison phone reported failed system migration before a product
case executed. It is retained separately from the original installation; the
failure does not establish a product or supported-device limitation. Boot
validation must inspect the migration outcome as well as the command exit code.

A private App-only test build now excludes XCTest plugins and uses a separate
public-DOM phase driver plus a native observation-only reporter. This changes
execution infrastructure, preserving the installed product's authentication,
protected custody, native transport and original synthetic account. Its explicit
configuration, single-report/deadline lifecycle and source exclusion are
specified in the [iPhone test instructions](../mobile/ios/README.md). Dependency
checks prohibit the browser phase driver from importing product internals or
Node APIs. The observer cannot open Keychain, HTTP sessions or private stores.
Ordinary product scripts are verified byte for byte before each private overlay.

A direct execution result must independently establish origin/document/phone
boundaries, exact wallet and private UI, plus process termination/relaunch for
restoration. Earlier failed restoration and preparation results remain recorded;
changing the executor alone cannot close them. Real wallets and physical-device
acceptance remain separate. No distribution, recovery or product-scope decision
is changed by this test infrastructure.

### Simulator integrity failures and deferred repair — 2026-11-03

The overnight continuation identified a platform-level block independent of the
product: built-in iOS Settings also failed to launch, and display capture timed
out. A scoped graceful restart of the exact user-owned simulator service
preserved all device identifiers and data but did not establish responsiveness.
Explicit verification of both installed iOS images then failed with OS code
-67054. An image listed as Ready is not accepted when verification fails.

The original official same-build DMG remains available. Supported import with
mandatory checks, including an exact independent APFS-clone staging attempt,
failed the free-space gate. No trust bypass, device reset, version substitution
or product fallback is adopted. The owner subsequently explicitly approved removal of only the extra installed
iPhone Duo runtime, preserving all device data, to free space for this recovery. This is an operational prerequisite,
not approval to reduce iPhone parity or change product rules.

The new native Swift transport contract target compiled; four pure cases also
passed on macOS against exact ordinary source copies. That complementary result
does not close installed-iPhone UI, native cookie custody or live HTTPS gates.
The [flow matrix](MOBILE_FLOW_TEST_MATRIX.md) preserves the full pending inventory,
failed preparations and original account/restoration evidence.

The owner's explicit 2026-11-03 approval is limited to the additional iPhone Duo
runtime package. Record its exact identity privately and compare retained image
and device inventories before and after removal. The ordinary iOS source,
original app/account and every device data directory remain preserved. That approval allowed only verified same-build repair; it was not a runtime
integrity or functional pass. The owner later chose a physical iPhone instead,
so simulator repair is deferred and must not resume automatically.

### Authorized physical iPhone continuation

The owner connected an authorized physical iPhone to continue parity testing
without importing another simulator image, enabled Developer Mode, connected an
Apple Account in Xcode and created a development certificate. The signed private
full-product App compiled and installed. Signature/profile checks, including
Complete file protection and registration for the selected device, passed. The
first launch was denied by iOS; the owner subsequently confirmed developer trust
on the phone. Preparation alone did not accept any functional flow. Subsequent physical login,
cold restoration and profile/preferences/theme persistence passed with distinct
verified native processes; earlier failures remain recorded in the matrix.

The physical fixture retains the original synthetic wallet and isolated iPhone
database. Ordinary product scripts remain byte-identical. Its separate endpoint
configuration, private CA, native-only admission and public-DOM observer are
explicit test composition, as described in the [transport contract](MOBILE_API_TRANSPORT.md).
The private observer owns only result/deadline observation; it cannot initialize
Keychain or product services. The private host temporarily prevents app idle
sleep while testing and restores its prior app policy on disposal; it does not
change the phone's system Auto-Lock preference.

The simulator repair/import is deferred in favor of this user-selected physical
target. Preserve all simulator data and earlier failures. The additional Duo
runtime alone was removed under its separate approval. The approved shared npm
and Playwright cache cleanup was not needed or executed. No phone reset, personal
data access, store enrollment, release publication or change to product privacy
is inferred. Record each physical flow in the [matrix](MOBILE_FLOW_TEST_MATRIX.md)
only after its own observed execution; real wallets remain for the owner.

### Physical product flow progress

The authorized physical continuation passed login, cold session restoration,
private profile/preferences/theme persistence and an unchanged-schema in-place
app update. Independent installed synthetic accounts subsequently passed the
canonical contact consent flow, private text both ways with receipt/edit/quote,
exact-byte original attachments, two-member group messages, text status,
communities/post/read/vote/reply, public-DM consent and encrypted text both ways,
local search, contact privacy persistence, encrypted content backup/import with
truncation rejection, pin persistence and block/unblock/renewed approval. Logout
persisted across a new process and the original wallet login returned.

These are individual installed-App results, recorded in the
[flow matrix](MOBILE_FLOW_TEST_MATRIX.md), not complete platform acceptance.
The initial post-accept group-title wait and earlier startup/login failures stay
recorded. Locked-state/backup, file-picker/save and the remaining platform/security
cases keep their own gates. The later real media/background and authorized reboot
results are recorded below. No further reboot, reset or personal-data access on
the borrowed phone is inferred.

The owner subsequently performed one authorized physical restart. The original
account/profile/preferences/theme and previously accepted message identity passed
afterward. The fresh original-account container also authenticated after that
restart, then passed exact prior private-profile checks, cold restoration, old
message/group recovery, encrypted backup and exact prior attachment byte/identity
comparison. The earlier native network-unavailable failures remain recorded;
their precise OS policy cause was not established. No transport trust/authorization
bypass or local account-data cloning was used.

Physical controls additionally passed real background/foreground transitions,
actual microphone recording, encrypted public-DM voice send and independent
recipient playback; six isolated Keychain/cookie/real-HTTP contracts; and five
separate offline synthetic storage lifecycle phases. Control builds used private
projects/namespaces only. Full product installations and private account data were
preserved and restored after the controls. See the matrix for the exact scopes,
setup corrections, earlier failures and remaining release/security gates.

Six final process-stop/reopen cycles preserved the same original account and
exact private profile/preferences/theme. The round then ended with the owned
local test services stopped, a verified database archive listing and byte-checked
encrypted object archive, and all three test app installations/data preserved.
Archive inspection is not a restore test. The test apps require the local fixture
for subsequent network flows. No commit, merge, push, deployment or publication
was performed; work remains on `codex/mobile-complete-flow-validation`.

### Manual acceptance handoff — 2026-11-04

The owner chose to take over the remaining interactive iPhone tests and included
real MetaMask, Phantom and Backpack login. Follow the
[manual checklist](MOBILE_MANUAL_TEST_CHECKLIST.md) and preserve the per-flow
results in the [matrix](MOBILE_FLOW_TEST_MATRIX.md). This changes execution
ownership, not the full-parity requirement or acceptance standard.

Later physical passes include actual camera/optical QR, explicit read receipts,
local-notification OS behavior and native file export/frame boundaries. The file
export regression required dedicated native download/picker and protected staging
owners; the initial missing-exporter failure is retained. A subsequent actual
Save gesture passed, but the full system-selected-file round trip did not pass.
Calls and live/reconnection scenarios remain manual; native remote push remains
blocked by its existing implementation/signing prerequisites.

Test A/Test B retain the original isolated synthetic accounts. An ordinary third
build uses the canonical test service without an injected wallet or private test
TLS/admission. Its label replaces the former Recovery control host while retaining
the existing container. Opening a real wallet, signing and finishing private
opening back in the installed app are unverified until the operator reports them.
The current first-party handoff permits manual return to the original app; no new
SDK, relay, native return scheme or architecture replacement is adopted here.

The earlier closed-round service shutdown/archive describes that historical
checkpoint. Local services were reopened for the additional continuation; current
operational details and bounded manual availability remain private under
`.local/`. No release, deployment, purchase or main-branch integration is implied.

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

## Mobile conversation interactions — 2026-11-04

The owner requested mobile hold menus, right-swipe replies, own-message batch deletion for both participants, public conversation controls, independent live search, circular handle avatars and stable emoji/GIF return to typing. They explicitly chose own messages for both, and public/private search must never mix.

Shared application source: `2364a241e3a6811b779129cd2690f071005d6e14`; integrated main: `ff93b5887abd393ff7ad6dea07e5d7f87ab30ed8`. Only the scoped client/shared delta is overlaid on the ordinary native product. Native adapters, existing containers and separate test apps are preserved. Handle author deletion uses the public profile's signed authority and an exact code-only backend review; no schema or dependency change.

Public controls distinguish preventing handle messages, blocking the public profile including posts, and muting its conversation. Mute preserves delivery and uses the existing encrypted preference lifecycle. Search is local to synchronized/imported copies, scoped to the selected Private or Public tab; no term or private contact is sent to public lookup. Result opening uses a bounded verified window at the latest match per conversation.

The ordinary Wallet build is 9. Signing, profile, normal native source and packaged asset byte checks passed; no synthetic wallet, admission, diagnostic driver or XCTest plugin is packaged. Physical installation and touch/keyboard acceptance must be recorded separately. Evidence stays in `.local/mobile-chat-interactions/`.

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

## Private group chat parity approved on 2026-11-11

The owner authorized completing the private-group interaction gaps and extending
view-once delivery to one opening per eligible recipient account, including local
Android and iPhone builds ready for installation. This supersedes the earlier
exclusion of groups from view-once messages. See [the implementation contract](PRIVATE_GROUP_CHAT_PARITY.md).
