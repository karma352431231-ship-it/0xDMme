# Contact invitation acceptance and conversation UI — 2026-11-04

The owner requested implementation, tests, main integration and VPS activation,
with continued authorization after context compaction. The disconnected iPhone
will be tested later; prepare an ordinary signed package without resetting data.

## Approved contracts and ownership

Invitation creation and redemption express the two participants' consent. The
contact database owner validates current discovery, blocks and device authority,
consumes one expiring bearer grant and approves the relation atomically. Direct
wallet requests still wait for acceptance. No schema, retention or dependency
change is needed. Existing exact-tree deployment review is required for this
code-only database transition. See [invitations](CONTACT_INVITATIONS.md).

The Add contact dialog exposes code generation/copying beside By invitation.
The existing invitation owner retains token lifecycle; tokens stay in RAM until
explicit copying. Saved-contact settings receive an explicit request capability;
saving a nickname still does not request or accept a chat.

Public-handle replies reuse the encrypted DailyText reply field, including photo
captions. Composition owns reply/edit context and cancellation. The sending owner
retains idempotent text admission; no new server plaintext metadata is added.
The history renderer owns reply previews and menus. A device-local safety notice
preference stores only a dismissal flag and removes current notices on dismissal.
The warning says never to share seed phrases or private information with anyone.
Mouse hover/keyboard focus reveals close; touch has a visible close control.

GIF search does not autofocus on phones and uses a 16 px, bounded inline field.
The shared DM header keeps a square cropped avatar and aligned handle/subtitle.
An empty status no longer reserves half the message area. Mobile public-profile
settings retain one outside card and the description field; nested editor framing
is removed. Settings blocks and contact settings use explicit field/action gaps.
All common corrections apply to browser/native clients; native adaptation stays
separate from this scoped web release.

## Validation

Use regression tests for consent/token use, concurrency, blocks, revocation,
reply draft preservation/retry metadata and safety dismissal. Validate affected
UI against the complete shell and real CSS at phone/desktop sizes. Run existing
quality gates and exact final CI before the official staging activation. Record
unavailable physical-iPhone checks honestly; do not infer them from compilation.

Validation before integration: 21 isolated PostgreSQL contact scenarios passed,
including direct acceptance, wallet-request crossing, blocking, one-use racing,
expiry, revocation and idempotence. Six added/focused settings/reply/notice checks
and the affected existing suites passed. The first complete local unit run had
1,742 passes, two failures and one skip: the capacity timing check passed in
isolation, and the ZK lab passed after its standard artifact preparation. Neither
unrelated module was modified. Full-shell WebKit fixtures passed 13 assertions at
390 px and 10 at 1100 px, including avatar, blank status, GIF search, navigation,
notice dismissal, profile framing, language spacing and invitation availability.
Physical iPhone acceptance remains pending while the owner disconnects the phone.
