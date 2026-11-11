# Android received-media opening optimization

This implements the Android recipient investigation approved on 2026-11-11,
starting from diagnostic commit `89fc181d`. Sender queues, transport block sizes,
authority/revision checks, storage formats and retention rules are unchanged.

## Independently measured decoder change

An Android instrumentation test ran the old bridge decoder, an indexed-loop
candidate and the production canonical decoder inside an isolated WebView with
network/file/content access disabled. Each measured trial decoded eight synthetic
128 KiB blocks (1 MiB total), after warmup. Byte-for-byte checks and buffer wiping
were outside the final measured interval. Five measured trials per candidate:

| Decoder                                    |   Median |          Range |
| ------------------------------------------ | -------: | -------------: |
| Previous atob/btoa/per-character callback  | 233.1 ms | 232.3–235.7 ms |
| atob/btoa/indexed byte loop                |  16.0 ms |   15.5–16.4 ms |
| Canonical validation and native byte codec |   8.1 ms |     7.7–8.1 ms |

The final candidate was approximately 28.4 times faster in this isolated decoder
benchmark. This is not a claim about total message-opening time. The device
supported the native byte codec; legacy clients use an indexed-loop fallback.
Raw reports, build logs and device details remain under the private task folder.

`src/shared/base64` owns canonical padded base64 conversion with allocation
limits checked before decoding. It validates the alphabet, placement/count of
padding and zero pad bits directly, removing the encode-to-validate roundtrip.
The transport keeps its existing one-outstanding-read contract, 128 KiB finite
reads, 4 KiB live reads, empty-terminal policy, cancellation and size limits.
The account codec preserves its nonempty-input validation and AccountError
contract. Encoding honors subarray offsets and retains its bounded fallback.
No crypto algorithm, AAD, key format or serialized message changes.

## Validated bytes through protected presentation

Successful view-once validation can transfer its decoded media buffer into
`ViewOnceMediaBuffer`, scoped to one authorized opening. Header/hash/length,
recipient, recovery, AES and media policy validation all run before adoption.
The existing content return contract remains intact for old callers and files.

The UI owns the opening lifetime, passes that capability through the existing
private/public controller operations, and closes it on failure, cancellation,
session invalidation, or viewer teardown. The transfer borrows it once and wipes
it after its last append acknowledgement, including a partial failure. A late
adoption after cancellation wipes the incoming buffer and rejects it. Nothing
is retained in a global map, cache or persistent storage.

`native-payload-decode` records zero conversion work and `loadReusedBytes` when
the validated buffer is used. Legacy content providers retain the bounded decode
path. Per-block encoding and acknowledged bytes/blocks remain independently
measured. Native append size remains 64 KiB: increasing a limit without matched
post-decoder evidence would change the bridge contract prematurely.

## Startup, directory, Contacts and history review

The installed bundle includes its app modules; deferred app execution does not
mean independently downloaded chunks. A pre-entry delay therefore includes
loading/parsing the packaged script as well as WebView/document initialization.
The emoji catalog was a static ESM dependency and built all search indexes
before installed entry. It now imports and indexes on the first emoji render
or opened picker. Ordinary text is immediate; a failed decoration import leaves
Unicode visible. A weakly owned render token prevents a delayed import from
painting a replaced or detached host. The catalog is no longer module-preloaded.

Directory sources now submit their independent, bounded reads together. The
existing authority queue still serializes SDK access and may admit already
queued followers under its unchanged session/revision/time limits. Publication
waits for all sources, preparation and the final generation guard; one failure
rejects the operation after every sibling settles. Contacts keeps its complete
verified vault gate before queuing permission and agenda reads together.

Each verified vault operation owns at most 32 epoch-key import promises. Repeated
local decryptions reuse the same non-exportable AES key only within that
operation. Session checks run before and after import, and disposal rejects late
calls and clears the cache. No authority result survives into the next operation.
Cached history copies open in pairs, retaining their existing receipt/hash and
snapshot checks. Missing SDK reads stay serialized; final confirmation still
gates publication, and a failed local verification drains its pair and aborts.

`messages/startup.ts` already publishes contacts after the current vault and
before opening identity pins. Pin completion remains required before histories
and sends. Reordering those gates again would not implement a missing behavior.
Warm history already probes a retained verified window against the authenticated
snapshot, consent and directory revision. Stale/revoked/disconnected cases must
continue to hide unverified content; no speculative permission cache was added.

Contacts already has separate screen/data operations and Android milestones.
An absent Contacts milestone in a capture containing only Conversations does
not prove failed instrumentation. Explicitly open Contacts and wait for either
a verified list or a verified empty state; Settings is a separate route.

The startup candidate passes lint, strict types, dependency boundaries,
formatting, both asset builds and 1,943 main-suite tests (one existing skip).
New regressions cover paired-read budgets, draining failures before publication,
session invalidation during key import, key-cache disposal and stale emoji hosts.
The structural review keeps key lifetime in the authority operation, contact
source ordering in its refresh operation, and optional catalog loading in emoji
presentation. No permission, identity-pin, revision or final-confirmation gate
was removed. Matched physical startup acceptance is recorded separately.

## Verification and remaining physical acceptance

Validation passed: 1,934 main-suite tests (one pre-existing skip), seven real
PostgreSQL integration cases, static checks and the isolated Android decoder
benchmark. The integration cluster was created for this run and removed after
shutdown; the configured project database was unavailable and was not started.

Targeted tests cover native/fallback codecs, exact bytes and subarray offsets,
noncanonical padding/pad bits, invalid input and allocation limits, cancelled or
lost reads, validated-byte reuse, failed adoption, partial transfer and wiping.
Existing view-once cryptographic tests preserve wrong-audience, wrong-policy,
corruption and single-consumption behavior. The synthetic Android benchmark does
not open account content or consume protected deliveries.

Repeat at least three matched trials for cold startup, Contacts, first history
opening, same-session reopen, protected image and protected video. Use a fresh
single-use message from the same original media each time. Compare medians and
ranges, including original/returned bytes, decode/receive/bridge time, append
counts, longest task, gesture-to-frame and final-append-to-video-frame. Keep raw
reports local. Actual end-to-end improvement and peak heap measurements remain
physical acceptance, not inferred from the isolated benchmark. The previous
1.25-second player interval must be reported separately if it persists; native
player preparation is evaluated separately from startup and transfer work.

The explicitly enabled `NativeStartupBenchmarkTest` visits Conversations and
Contacts and exports only fixed timing/row/byte counters from the existing
diagnostic protocol. Run each trial in a new instrumented process for matched
baseline/candidate comparisons. It does not open histories, consume protected
media or export account identifiers. Instrumentation adds launch overhead, so
these runs must not be compared directly with an ordinary launcher capture.
