# Private group chat parity

Approved by the owner on 2026-11-11. Apply private message actions, touch replies,
reactions, copying, forwarding, author deletion selection, exact search navigation,
GIF composition, conversation previews and responsive attachment submissions to
private groups. Reuse the shared interface owners and existing group authority.

## View-once delivery

The owner explicitly extended view-once messages to private groups. Each recipient
eligible when the message is published can consume one delivery per account across
all devices. The sender follows the existing private-chat presentation and cannot
reopen their own sent content. A new member receives no prior delivery. Leaving,
removal and re-entry follow the existing membership-period authorization.

Reuse the current text/image/video protected native display and download-only file
behavior, including split captions, cancellation, background cleanup and the same
size limits. The normal encrypted history and backups retain only placeholders.
Store one ciphertext with independently wrapped keys and consumption tombstones
for at most 199 recipients. Consume and erase each recipient key atomically. Erase
the shared ciphertext after its last delivery. Unpublished uploads expire after
24 hours. Published payloads follow the group's explicit deletion and existing
media-retention policy. Storage remains within the existing group/global budgets.

New group bodies explicitly identify structured content inside authenticated
presentation metadata. Legacy raw text remains literal, including text resembling
a protocol prefix. Group text keeps its prior encryption budget, independently of
the individual-chat 16 KB limit. Backups preserve the optional format marker.

The group controller owns verified authority and durable outbox operations. Group
composition owns reply/edit context and immutable admitted submissions. Message
menus own pointer intent. Group projection owns authenticated edit/reaction state. Latest actions are read
in bounded cursor pages, independently per author; explicit deletion also purges
the associated local reaction snapshots.
The dedicated database delivery owner enforces membership, atomic single use and
payload cleanup. Native protection stays in the existing protected display owner.

Database migrations and server activation must be released with the corresponding
client. Local builds and synthetic tests are recorded separately from physical
Android/iPhone acceptance and deployment.

## Activation approved on 2026-11-11

The owner explicitly authorized VPS activation, including migrations 108 and 109.
Use `npm run deploy:staging -- --group-chat` with the existing explicit destination
profile, clean pushed source and passing exact-commit CI. The internal
`deploy_group_chat` transition pins predecessor `fb82b0a9` and application sources
`8bec16d9`; later executor-only commits cannot change those application sources.

The transition preserves every existing table, including direct view-once
ciphertext, quota rows and all 107 migration checksums. Both new group delivery
tables start empty; verify the reaction constraint/index, consumption/deletion
triggers, global accounting and group quota reconciliation before reopening.
Dependencies, Node, configuration and service units retain their existing bytes.

Reuse the official private backup and restore rehearsal. Pause the own web and
three own writers for the migration; restart only those services. Keep all access,
operational fingerprints and receipts in `.local/`. A pre-opening failure restores
the verified old database/release. After reopening, preserve new writes and stop
for review if validation fails. Shared services are not restarted. Existing
Android/iPhone builds remain compatible because application sources are pinned.
