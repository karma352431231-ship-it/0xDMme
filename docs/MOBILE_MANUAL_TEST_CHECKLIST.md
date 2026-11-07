# 0xDMme manual mobile acceptance

Prepared: 2026-11-04. Branch: `codex/mobile-current-web`. Ordinary Wallet build 7 uses web baseline `af321b34` (2026-11-01); the earlier Test A/Test B builds are unchanged.

The owner chose to take over the remaining interactive tests, including real
wallets. Check a box only after observing its expected result on the installed
phone app. Record failures and partial results; an app opening successfully does
not establish that the entire flow passed.

## UI corrections in build 7

- [ ] The iPhone keyboard has no form-navigation/check accessory bar.
- [ ] With an unchanged public profile, confirmation is hidden; changing and
      reverting the description shows and hides it. Saving removes the button.
- [ ] External-media configuration is absent from the public-profile editor.
- [ ] Dark/light theme colors reach the iPhone system areas, the status text stays
      readable and the bottom background covers the home indicator region.
- [ ] Open emoji while typing: the keyboard retracts, history shrinks and the
      composer remains above the panel. Insert several emoji and return to typing
      with the down arrow; the existing draft and caret are preserved.
- [ ] The same arrow is available in GIF mode. Switching conversations or disabling
      the composer closes its panel.
- [ ] Recent emoji survive closing/reopening this installed app on this device.
- [ ] Community ownership requests clearly describe offers to take over a community.

## Choose the installation

| App label     | Account and service                                                                         | Use                                                    |
| ------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 0xDMme Test A | Original synthetic account, isolated service on the Mac                                     | Remaining app interactions with preserved test history |
| 0xDMme Test B | Independent synthetic account, same isolated service                                        | Receive, reply and approve contact requests            |
| 0xDMme Wallet | Ordinary product assets and canonical `https://0xdmme.app` test service; no injected signer | Real MetaMask, Phantom and Backpack acceptance         |

Test A and Test B still use synthetic signature providers. A button bearing a
wallet's name in those apps does **not** exercise the installed wallet. They
require the prepared Mac service and the phone's existing local-network access.
The Wallet installation uses the public test service and ordinary system TLS;
it does not require the Mac's local fixture. These environments do not share
accounts, contact requests or messages. Do not expect a Test A message to arrive
in Wallet.

The three development identities reuse the existing installations. Installing
updates does not delete their containers. The Wallet label replaces the former
Recovery test-host label; it is a full product app, not the UI test runner.
Local development signing expires according to the installed profile and may
require a later signed update. No store release is implied.

Use fictitious conversation content and a test wallet. The login flow requests a
message signature; it does not require funding or an asset transfer. Enter wallet
secrets only in the wallet itself. Record only the wallet/network, visible step,
time and result in a bug report, without secrets or private message content.

## Real wallets: run the complete round trip

The Wallet installation contains the complete product. Its suffix identifies the
manual build with real wallet login; it is not a reduced wallet-only app.

### Ordinary browser-to-app use

1. Open `https://0xdmme.app` in your ordinary browser and log into test account A.
2. Open **0xDMme Wallet** on the iPhone and log into test account B through a real
   wallet. Use a different wallet address/ecosystem identity if you want a distinct
   account; the same address in the same ecosystem identifies the same account.
3. Create/copy a contact invitation in one endpoint, use it in the other and
   explicitly approve the contact request.
4. Exchange uniquely captioned messages in both directions. Verify each arrives
   and decrypts, then try an attachment, edit/reply and reopening the app.

Both endpoints use the same canonical test service, so ordinary cross-client
interaction is the intended product behavior. This manual round trip has not yet
been accepted. Test A/Test B belong to another service and cannot participate in
this public-site conversation.

### Wallet combinations and return

Start in **0xDMme Wallet**, not Safari and not Test A/B. Use the wallet/network
combinations offered by the app. Mark each combination separately; do not infer
that a wallet's EVM result also accepts its Solana result.

| Wallet   | EVM | Solana |
| -------- | --- | ------ |
| MetaMask | [ ] | [ ]    |
| Phantom  | [ ] | [ ]    |
| Backpack | [ ] | [ ]    |

For each combination:

1. Open Profile/account, tap Connect Wallet and choose the wallet, then the
   intended network. In the current Portuguese interface these controls are
   “Perfil” and “Conectar wallet”.
2. Confirm the installed wallet opens. If necessary, use the explicit Open Wallet
   button. A “not detected” badge in the app is not by itself a failure: injected
   browser providers are normally discovered inside the wallet's browser.
3. Confirm the approval page belongs to `https://0xdmme.app`. Connect the intended
   wallet account and inspect/sign the login message.
4. Return manually to **0xDMme Wallet** using the app switcher. Confirm the address
   shown by 0xDMme matches the account and ecosystem you selected. Complete the
   address confirmation/private account opening if requested.
5. Reach the ordinary product interface. For an existing account, verify its
   expected private profile/history; a new account has no prior history to recover.
6. Close the app, reopen it and verify the same account persists. Send and receive
   a test message with another consenting test account in the **same public test
   environment**. Verify decryption in both directions.
7. Log out through the account control. Reopen the app: it must remain logged out.
   Repeat login with the same wallet and verify the original account returns.
8. Exercise cancel/reject once. Reject the signature or cancel the pending login
   and return: the app must not become authenticated. Start a fresh request and
   verify a normal retry works.

Also record whether the flow works with the wallet initially closed, and whether
an expired request asks for a new attempt without granting a session. A successful
signature inside the wallet alone does not pass the test: the original installed
0xDMme app must finish its own authenticated/private opening.

The existing implementation opens the wallet's browser and uses a temporary
first-party handoff plus confirmation in the original app. Automatic return is
not assumed. Real installed-wallet behavior remains unaccepted until this round
trip is observed. Do not replace a failing native attempt with a Safari-only
result in this matrix.

If this installation initially shows the previous synthetic account's cached
profile, use its ordinary logout control before starting a real wallet request.
Do not uninstall/reset it: the preserved local test history belongs to the prior
isolated environment. A fresh real wallet account has separate identity/history.

## Remaining interactions with the synthetic accounts

Use Test A and Test B for the local environment. Their earlier consented
conversation and history are preserved. A separate browser peer is only a
complementary second endpoint, never evidence that the iPhone itself was tested.

- [ ] **Choose an actual file.** In a conversation, attach a harmless file through
      the iOS Files picker, add a unique test caption and send. In the independent
      recipient, open/download it and compare filename and complete contents.
      Repeat once with a cancelled picker: nothing should be sent. Earlier native
      export presentation/cancellation passed, and an OS Save gesture passed in
      a private test folder. Saved-byte verification and the full OS-selected-file
      send/receive round trip remain open; the prior automated import failed
      before selecting a file.
- [ ] **Photo/media handling.** Select a synthetic image through the actual system
      picker and verify the recipient can view it. Check cancellation and an
      unsupported/oversized selection against the visible product limit.
- [ ] **Voice usability.** Record a short fictitious phrase, cancel one recording,
      then send another. Listen on the independent recipient and assess audible
      quality. Physical recording, encrypted delivery and playback had passed;
      acoustic quality was not independently verified.
- [ ] **Live arrival.** Leave both endpoints open. Send each way and confirm arrival
      without a manual refresh. Keep read receipts disabled unless explicitly
      enabling them for the test. Opt-in receipt persistence and the matching
      sender-visible read label already passed separately.
- [ ] **Connection loss/recovery.** With a visible test conversation, temporarily
      disable the phone's network, attempt one uniquely captioned message and
      restore connectivity. Observe the real status/error. If retry is offered,
      use it and confirm exactly one accepted message and unchanged history.
      Do not assume an offline queue where the product does not promise one.
- [ ] **Foreground/background.** Background and reopen during a normal interaction;
      verify no duplicate message, stuck recorder or lost private profile. Actual
      process restoration/background tests passed earlier, but this does not
      establish remote notification wakeup.
- [ ] **Voice calls.** Use two independently interactive endpoints, preferably
      different devices, in the same test environment with its own TURN service
      available. Check accept, reject, caller cancellation, timeout, hangup from
      both ends, mute/unmute, audible two-way audio, network interruption and
      microphone release afterwards. The local TURN/browser prerequisites were
      prepared, but no new physical iPhone call result was accepted. Do not mark
      calls passed merely because the call screen opens. A single iPhone switching
      between its two apps is insufficient to assess two-way call audio reliably.
- [ ] **Backup usability.** Export an encrypted test backup through Files, then
      import it through the product control. Verify its expected account/content
      and rejection of a damaged copy. Client backup round trip/truncation
      rejection passed earlier; actual OS picker/save usability is separate.

## Results already recorded and remaining platform gates

The [flow matrix](MOBILE_FLOW_TEST_MATRIX.md) contains the observed physical
results and retained failures. The actual iPhone camera lifecycle and optical QR
decoding passed after the owner positioned the camera. Contact consent, messages,
groups, status, communities, public DMs, private settings, recovery and other
individual passes do not need to be repeated solely to begin this checklist.

Native **remote** push remains blocked by missing APNs/product integration and
push-enabled signing. The generic local-notification OS control passed after
permission, but does not accept incoming remote notifications or wakeup. Manual
testing cannot turn that missing integration into a pass. No paid enrollment or
replacement notification architecture was approved.

First-unlock behavior, actual OS backup/restore, destructive storage-loss cases,
store distribution/licensing and the broader security acceptance remain separate
gates. This handoff authorizes no phone reset, additional reboot, personal-data
access or deployment.

## Record a result

Copy one row per scenario into the local test notes. Keep device/network details
and private evidence under `.local/`, outside Git.

| Date | App/platform | Wallet/network or account role | Scenario | Expected | Observed | Passed / failed / partial | Follow-up |
| ---- | ------------ | ------------------------------ | -------- | -------- | -------- | ------------------------- | --------- |
|      |              |                                |          |          |          |                           |           |

**Ponto importante:** manual results are pending until the owner reports the
observed behavior. Real wallet login is a separate authentication/return gate;
the earlier synthetic passes do not certify it, and a wallet pass alone does not
close calls, remote push, OS backup or store/security acceptance.

## Build 8 pending installation — 2026-11-04

Build 8 is signed and prepared, but was not installed after the owner disconnected
the iPhone. Build 7 is the last recorded physical installation. After reconnecting,
update the ordinary Wallet app without uninstalling or resetting data. Confirm:

- Generate/copy a new code directly in Add contact; redeem it on an independent
  account and start private chat without another approval by its creator.
- Request conversation explicitly from a saved, unrequested contact. A wallet-only
  request must still wait for the other participant's acceptance.
- Open GIF search without automatic focus/zoom; type without a clipped search
  field. Repeat emoji/keyboard toggles and verify the iPhone accessory stays absent.
- Public-handle chat uses the full message area, square avatar and aligned subtitle.
  Reply to text and photo captions; verify the quote on the independent recipient.
- Dismiss the new safety warning and reopen the app; it stays hidden on this device.
- Public profile has one outside frame plus description; language select and Save
  have clear spacing. Check other settings fields/actions at the same text size.

Shared main `98c3a2ee` passed exact CI and is active on the canonical VPS. Prepared
assets and compilation do not mark these physical checks passed.

### Build 8 installation after reconnection — 2026-11-04

The owner reconnected the iPhone. The prepared ordinary Wallet build 8 was
installed and launched successfully without uninstalling or resetting data.
Only the existing Wallet app identity was updated; Test A/Test B were untouched.
The earlier pending-installation status is superseded. Installation is not
physical acceptance of the contact, GIF, keyboard or layout fixes; those manual
checks remain for the owner. Evidence: `.local/contact-final-polish/`.


## Build 9 — conversation interactions

- In Conversations → Public, hold a contact row: verify separate prevent-message, public block and mute choices. Check that muting preserves delivery while suppressing the available unread notification projection.
- Open a handle conversation from Conversations. It must open directly there; Back must return to the Public directory, without a Communities screen.
- Hold incoming and own message bubbles in private and handle chats. Verify the options menu; vertical scrolling must not open it. Swipe either bubble right to prepare a reply, then cancel or send only an intentional test message.
- On an own message choose Delete for both: checkboxes must appear only on own messages. Cancel must preserve content. Select several synthetic messages and confirm; verify deletion on both devices.
- Open search in Private and Public separately: blank input must list no contact; typing must search automatically. Switch scope and verify the old term/results disappear. Private contacts/history must never appear in Public and vice versa.
- Search for a repeated word: the latest matching message per contact is highlighted; tapping it must open that message's position. Verify the small return-to-latest control and query editing.
- Tap the enlarged emoji target, open GIF, and close back to typing both with and without a focused search field. Check that the document does not flick, global navigation stays hidden and the composer remains at the bottom.
- Verify a portrait profile photo remains circular in the handle chat header.

Local WebKit fixtures at 390 and 1100 pixels passed. They are not physical iPhone touch or real-wallet acceptance.


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
