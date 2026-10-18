# Database upload lifecycle contracts

The database audit keeps source behavior, concrete regression evidence and
assembled capacity acceptance separate. A passing test count is not blanket
acceptance of every interleaving or an application/user capacity claim.

## Authority and transaction boundaries

Upload operations must use current session/device authority and the appropriate
private-contact or public-profile consent. Existing legacy authority gates remain
in place. Their serialization is intentional compatibility behavior in this
change; independent-writer throughput remains an assembled acceptance question.

Private reservation uses ordered participant locks and its existing complete
allocation contract. Social reservation uses its current actor transaction and
rechecks both owners' quotas before committing new promises. An identical retry
checks authority and exact message/peer/descriptor/media identity, but needs no
new growth allowance. Adding any missing descriptor still requires capacity; a
late refusal rolls the entire transaction back.

Begin/finish SQL commits before/after filesystem work; a SQL transaction must not
span file I/O. Writer tokens protect interrupted/replaced attempts. Cancellation
refuses accepted messages and active writers. Marking an object for collection
keeps its logical file charge until the existing durable deletion confirmation.
Temporary expiry never expires accepted private/social media. Group retention
keeps its distinct approved warning and cleanup policy.

## Startup and collection bounds

After the previous sole upload writer has stopped, private, group and status
recovery changes at most 32 writing rows per independently committed statement.
A UUID cursor avoids repeatedly scanning the already visited history. Only
`writing -> reserved` and clearing the writer are allowed: descriptors, received
parts, routing, bytes and charges remain identical. Accepted/ready/deleting rows
are untouched. A failed batch rolls back; prior completed batches remain durable,
and a later startup can finish recovery idempotently. The existing database pool
is reused; no new coordinator, connection budget or maintenance disablement is
introduced.

Private/group collection selects at most eight due rows. Previously deleting
rows are returned for another durable filesystem attempt without updating them
again. Newly expired reserved/ready rows are conditionally marked deleting;
concurrent changes to writing/accepted state are rechecked by the update. The
selection itself never releases file charges. An absent/already-collected object
still follows the existing durable reclamation contract.

## Contract-to-test inventory

| Contract                                                                                                                                 | Concrete evidence                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Private reservation: exact descriptors, quotas, both owners, credits, rollback and retries                                               | `attachment-reservation-allocations.test.ts`, `attachment-quota-accounting.test.ts`                                                             |
| Private/social reservation, begin, finish, stale release, retry and refusal of additional growth under pressure                          | `upload-lifecycle.test.ts`: lifecycle cases for both domains; source/global/personal/group/pending totals reconcile after transitions           |
| Current device and bilateral consent after admission waits                                                                               | `upload-lifecycle.test.ts`: waiting-upload cases; preflight and finish are refused without media effects after committed revocation             |
| Atomic social media/message admission and rollback, accepted cancellation refusal and expiry exclusion                                   | `upload-lifecycle.test.ts`: ready-media admission case; synthetic database fixture only                                                         |
| Real signed/encrypted private and social admission, idempotent publish, download authorization and independent personal cleanup          | `messages.test.ts`, `social-dm.test.ts`                                                                                                         |
| Bounded private/group/status recovery; exact bytes, routing, descriptors, parts and accepted-state preservation                          | `upload-recovery.test.ts`: startup case across all three sources with statement-level row counts and distinct transactions                      |
| Partial recovery failure and later idempotent completion                                                                                 | `upload-recovery.test.ts`: injected failure after a committed batch, exact accounting before and after retry                                    |
| Collection retries avoid unchanged writes while still returning pending deletion work                                                    | `upload-recovery.test.ts`: private/group collection cases with stable row versions                                                              |
| Durable deletion, opposite collector/cleanup waits, stale state, zero headroom, rollback and retained credits after finalization failure | `file-reclamation-allocations.test.ts`, `personal-cleanup-allocations.test.ts`, `cleanup-physical-credits.test.ts`                              |
| Group membership/governance, media acceptance, 10 MB multipart boundary and distinct retention policy                                    | `groups.test.ts`, `group-media-parts.test.ts`, `group-quota-accounting.test.ts`                                                                 |
| Direct account/profile, attachment and group quota counters, cross-table interleavings and cascades                                      | `personal-quota-accounting.test.ts`, `attachment-quota-accounting.test.ts`, `group-quota-accounting.test.ts`                                    |
| Exact global/pending contributions and credit coordination                                                                               | `global-usage-accounting.test.ts`, `storage-reservation-accounting.test.ts`, `content-allocations.test.ts`, `physical-storage-capacity.test.ts` |
| Current read authority, concurrent consent directions, revocation and read-only transaction enforcement                                  | `contacts.test.ts`, `scoped-snapshots.test.ts`, `message-receipts.test.ts`                                                                      |
| General public writer idempotency, rollback and concurrent observations                                                                  | `community-views.test.ts`, `community-interactions.test.ts`                                                                                     |
| Atomic/checksummed initialization, durability and worker readiness                                                                       | `database.test.ts`, `worker-readiness.test.ts`                                                                                                  |

Paths in this table are under `tests/integration/`. Unchanged test evidence may
be reused only when its source/contract remains unchanged; modified paths require
the affected tests again. Operational receipts and exact run status stay in the
private audit tracker. This inventory does not certify arbitrary combinations
outside its concrete scenarios.

## Remaining acceptance boundaries

Legacy global authority/accounting paths have not all been replaced. This change
does not retire their lock order or imply linear scaling. Their measured cost,
allocator queue/grant/finish latency, slot/credit recovery and mixed workload
operating margins belong to the remaining integrated resource/capacity acceptance.
Any further adoption must replace a complete operation, preserve exact accounting
and have measured justification; removing a gate alone is insufficient.

The existing vault-v1 parser, client checkpoints and SQL head retain a maximum
sequence of 100,000. This counts vault commits, not private chat messages. It is
unchanged here; cleanup does not authorize resetting signed chain continuity.
Extending that bound needs its own protocol/client/schema compatibility review.

**Ponto importante:** these corrections preserve accepted data and product rules.
They close the demonstrated upload recovery/retry/collection regressions; they
do not establish maximum app capacity, remove every legacy gate or complete the
separate media/TURN/device and assembled performance acceptance.
