# Independent private contact invitations

The owner requested this flow on 20 October 2026 and explicitly chose independent
invitations: creating another must not invalidate previously shared links.

Each **Create new invitation** click generates a new 256-bit browser token. Its
link/QR appears only after the authenticated server confirms a 24-hour expiry.
Opening or synchronizing Contacts does not create or restore a reusable link.
Copy shares the displayed invitation; another recipient needs a new invitation.
New raw tokens stay in screen memory and the owner's clipboard when copied.
They are not written to the vault, logs or backend; the backend stores a hash.

Looking up the recipient never spends the grant. The first successful new chat
request consumes it atomically in the same transaction as the pending contact
relation. Concurrent recipients cannot both succeed. A retry of the same pending
request is idempotent; rejection does not restore a spent link. Accepting the
request remains a separate action. Discovery mode and blocks still apply.

Revoking the displayed invitation deletes only that grant. Unused grants expire
after 24 hours; consumed grants stay invalid through that deadline. The content worker reclaims
expired rows in batches of 128, using a payload-free work hint and the existing
scheduler. No new service or dependency is introduced. Operational metadata costs
256 globally accounted bytes per row, outside personal content quota; this does
not reintroduce a contact count limit. Deleting a recipient does not reopen a
spent token, and deleting an owner removes their grants.

Migration `094-single-use-contact-invitations.sql` preserves the existing schema
and stored contact relationships. Existing permanent token hashes receive one
24-hour transition window and one use, then leave the legacy active-hash field.
Old encrypted invitation records remain compatible historical vault content;
restoring one does not recreate or extend a server grant. The old configure API
cannot create permanent links. Authentication and device enrollment are unchanged.

This implementation is on `codex/message-alerts-and-contact-invites`, based on the
currently published notification release. Activation of the 093→094 migration
requires its own owner review, exact-commit CI and backup/rollback verification
through the existing deployment command. This task has not changed the VPS.
