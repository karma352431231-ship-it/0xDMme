# Recovery key authorization review

## Approved correction — 2026-10-21

The owner requested the working correction after the E2EE review identified inconsistent client-side authorization of recovery keys. New encryption destinations must be authenticated against signed device history, the current account key epoch and an active signing device. The sender's recovery copy follows the same rule as recipient copies.

The shared `currentRecoveryKey` operation validates that policy before direct encryption, group session-key distribution, own recovery preparation or status distribution. Handle text and media use the same direct encryption boundary. Historical recovery remains separate: old capsules and old messages can still be opened by an authorized account with the corresponding historical vault key. A key created at an earlier directory revision remains usable while its epoch and signer are still current.

This restores the approved privacy and revocation requirements using the existing SDK and formats. No new dependency, authentication step, key format, database migration, retention rule or runtime upgrade is introduced. Activation remains a separate, explicitly authorized deployment.

## Evidence and acceptance

The regression test exercises the real cryptographic SDK with synthetic identities. The original implementation accepted six inputs that should have been rejected: unauthenticated sender and recipient recovery keys, stale own recovery preparation, and previous-epoch keys for direct senders, direct recipients and group recipients. The same test also preserves successful current recovery, same-epoch reuse after device linking and historical capsule opening after rotation.

The existing direct message, group, status, attachment, vault, wallet recovery and device tests remain the positive behavior coverage. Release comparison must be repeated for the corrected commit. Operational evidence, source inspection notes and private diagnostics stay in ignored `.local/`.

This review is scoped to outbound recovery authorization. It is not a completed independent cryptographic audit, a proof of all runtime execution or evidence that every user receives identical frontend code. First-contact identity trust and the confidentiality limits of deliberately recoverable history remain as previously documented. Verification of distributed code and a real signed release proof remain separate acceptance steps.

## Cohesion

The new authorization rule has its own module. Existing message and status entry points call it instead of growing separate policies. The large message crypto and handle DM controllers still warrant a dedicated responsibility review: separate directory/key authorization, direct message coordination and group session coordination through explicit contracts, preserving the shared SDK lifecycle and serialization. Such restructuring requires its own reviewed task and the direct/group/recovery behavior tests; it is not part of this correction.

References: [Matrix key backup specification](https://spec.matrix.org/latest/client-server-api/#server-side-key-backups), [SDK backup key API](https://matrix-org.github.io/matrix-sdk-crypto-wasm/classes/BackupDecryptionKey.html).
