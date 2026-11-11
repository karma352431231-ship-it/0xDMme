# View-once messages

The private and private-group composers provide a persistent ① toggle beside the
paperclip. Text occupies the full first row; media actions and send/record sit
below. The paperclip opens a compact three-action menu. A fading explanation
appears on the first activation in each installation/browser.

On 11 November 2026 the owner disabled new view-once messages in public handle
chats. Public composers omit ① and the server rejects new uploads and
publications from older clients. Previously accepted deliveries keep their
original opening, cancellation and retention rules. Existing unsent encrypted
drafts are moved out of the active send queue without exposing their contents
or changing them into regular messages.

Text and image bodies open once in the installed Android/iOS app. The web
client shows only their placeholder. Native Android windows use `FLAG_SECURE`;
iOS renders sensitive pixels through the public protected AVFoundation layer.
Closing, backgrounding or leaving the conversation erases the native view.
Supported images use the platform's native decoders; animated images currently
show their first frame. Private groups grant each eligible recipient one opening
per account, as specified in [Private group chat parity](PRIVATE_GROUP_CHAT_PARITY.md).

Other files initially show a generic view-once placeholder. Opening consumes
the delivery and reveals only filename, extension/MIME and size in B/KB/MB/GB.
The recipient can then choose one download in browser or app. Closing erases
the details, and files never render inline. New download metadata is inside the
single-delivery payload, outside ordinary history and recovery archives. The saved
copy belongs to the recipient and can remain after the chat delivery is used.
A caption accompanying a downloadable file is queued atomically as a separate
mobile-only text message.

## Delivery boundary

The signed Megolm packet contains only a hash and encrypted metadata. Its
normal recovery archives, local history and backups do not contain the body or
content key. A separate AES-GCM payload binds message ID, scope, actors and
policy; its random key is encrypted to the recipient's existing recovery key.
Upload retries retain stable ciphertext and resume in bounded chunks.

The server authenticates the current private session and consent, verifies the
published parent and atomically grants the recipient one delivery. Consumption
clears both ciphertext and wrapped key, leaving a small tombstone. Concurrent
opens cannot both receive it. Download and display failures after this grant
cannot retrieve it a second time.

For mobile-only content, stock browsers cannot supply the forbidden `Sec-`
header; the guarded native HTTP owner supplies it only while a protected native
view is active. This is an official-client restriction, not device attestation:
a modified client, compromised device or external camera is outside it.

Migration 107 adds the payload table, quota/global accounting, and parent-delete
cleanup. Unpublished uploads expire after 24 hours. The deployment transition
pins the complete reviewed source trees and preserves all earlier data and
migration checksums through the existing backup/restore executor.
