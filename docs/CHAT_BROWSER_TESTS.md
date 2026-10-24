# Private chat and group browser regression

The harness uses the exact compiled app, real wallet challenge signatures, real device enrollment, encrypted client storage, PostgreSQL, live updates and normal message composers. It owns one loopback fixture process, one uniquely named disposable database and one temporary object directory. It never connects to the VPS. The internal implementation handoff remains in `.local/`.

## Prerequisites and commands

Use the repository's Node 24/npm 11, then install dependencies and browsers:

```sh
npm ci --ignore-scripts
npx playwright install chromium
# Optional functional browser coverage; Linux may also need --with-deps.
npx playwright install firefox webkit
```

Provide an existing **local test** PostgreSQL 16 database and a dedicated test role with `CREATEDB`. Docker is optional. Write only private local configuration to `.local/chat-e2e.env`:

```dotenv
HASH_TALK_E2E_DATABASE_URL=postgresql://synthetic_test_role:synthetic_password@127.0.0.1:5432/hash_talk_test
```

These credentials are illustrative. No real wallet, funds, production account, manual sign-in or console capture is required. The parent database is never truncated or dropped. Each run creates `hash_talk_test_e2e_<random>`, records a cryptographically random ownership marker and verifies both database owner and marker before dropping that exact database. A changed marker refuses cleanup and reports an error. A free port in 45111–45119 is required; a leftover server is never reused. Readiness also verifies a fresh per-run ownership asset, closing the race between selecting a free port and binding the fixture.

```sh
npm run test:chat-e2e
npm run test:chat-e2e:headed
npm run test:chat-e2e -- --grep='S1|S2'
npm run test:chat-e2e -- --project=firefox --grep=S1
npm run test:chat-e2e -- --project=webkit --grep=S1
npm run test:chat-perf
npm run check:chat-e2e
```

The runner builds once per invocation, applies the existing migrations in its new database, waits for explicit fixture readiness, runs one worker and always attempts teardown. Ctrl+C interrupts the owned test run and cleans up. The existing manual `tests/browser-fixture.ts` entry point remains available; the runner starts that same assembly rather than maintaining a second server. Browser contexts A/B receive independent synthetic wallet seeds through the fixture-only wallet asset. A1/A2 share the same origin, cookie jar, IndexedDB and device; B is isolated. Wallet approval pages inherit their context's identity. Production bundles and CSP remain unchanged. Browser contexts block service-worker registration so request accounting and scoped response-loss injection observe the actual fixture transport consistently. These scenarios do not test PWA service-worker interception; cache reports refer to the HTTP cache and persistent device storage. Existing PWA policy tests remain required.

## Scenarios and ownership

| Area                                                             | Contract                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `fixtures/environment.ts`, `database.ts`, `process.ts`, `run.ts` | Build, process/database/object lifecycle, readiness, deadlines, interruption and cleanup                      |
| `fixtures/accounts.ts`, `fixtures/chats.ts`                      | Real authentication, initial settings, accepted contact and private-group setup through UI; context lifecycle |
| `chat-ui.ts`, `chat-workload.ts`                                 | Narrow composer/navigation operations and controlled workloads                                                |
| `chat-observer.ts`, `chat-metrics.ts`                            | Bounded observation, single runner clock, network work and ephemeral correlation; no application state writes |
| `chat-budgets.json`                                              | Reviewed workloads, functional deadlines, retention and proposed latency targets                              |
| `artifacts.ts`                                                   | Private evidence retention and sanitized summaries                                                            |

S1 checks bidirectional direct/group publication, recipient rows and reload persistence. S2 uses A1/A2/B1 and 20 numbered texts per sender scheduled 100 ms apart, records actual admissions and verifies per-sender FIFO, exact counts, no duplicates and drain. S3 switches destinations ten times during incoming traffic and scopes content assertions to the selected conversation history, excluding legitimate directory previews and hidden prior views. S4 measures directory and selected-chat boot separately using 12 preloaded messages and persistent enrolled storage. S5 uses real context disconnection/reconnection and waits for committed encrypted staging before reconnecting an offline draft; private drafts first reopen saved offline history. S6 covers real server acceptance followed by response loss and reload, plus intercepting an actual publisher before server acceptance, closing that active owner and requiring the surviving tab to finish the durable work. Fault routes own their removal and never fabricate a successful response. S7 checks editing/deletion amid traffic and after navigation/reload. A real device-link/revoke test replays an actual signed operation after revocation and requires denial.

Before UI login starts, setup reserves five challenges (four for the two wallets and one for device linking) within a six-challenge, 61-second window, preserving the server's six-per-minute protection. Its bounded private admission timestamps survive worker replacement after failure; waiting is setup time, outside warm measurements. A counter fails if setup exceeds its reservation. No authentication request is delayed in transit, mocked or retried. Setup uses normal in-app navigation after the initial private-chat bootstrap and waits for bounded request quiescence; it does not retry an action until it happens to pass. Group selection uses the fixture-created conversation ID and checks its visible heading, so an asynchronously resolved directory label is not used as identity. UI defects reproduced during setup or a scenario remain failures to diagnose, not permission to change application behavior. An optimistic sender bubble never satisfies recipient delivery.

## Measurements and limits

Timestamps for cross-page submit/pending/accepted/visible observations use one runner monotonic clock. Recipient DOM visibility includes browser-to-runner delivery overhead and is a presentation proxy, not physical paint. Seven page round trips report a lower-bound transport uncertainty; browser-local diagnostic times are never subtracted across pages. Request duration is elapsed latency, not server CPU. Overlapping work durations are not summed into a fabricated total.

The collector records API request/body bytes, response-body transfer bytes, elapsed request durations, text acceptance, diagnostic steps when enabled, long tasks where supported and per-page synthetic-token observations. Text publication attempts and repeated logical IDs are counted separately from profile packets. S2 enforces one text publication per accepted text in the ordinary no-fault workload; recovery scenarios report their retries separately. Preparation operations remain visible in operation counts. Drain requires committed encrypted outbox keys to clear and bounded non-stream API work to settle. A fixture-only, read-only IndexedDB adapter inspects bounded keys (never record values, content or keys) and closes every connection; review it with message-storage schema changes. Pending-presentation rows are reported separately: groups intentionally retain accepted own rows until a verified read. Page departure records cancelled observations explicitly; incomplete work accounting invalidates performance conclusions. The drain predicate excludes identified live/presence/heartbeat operations. Dropped observations invalidate detailed conclusions.

`npm run test:chat-perf` repeats the isolated P1 exchange and S2 five times serially with fresh equivalent accounts. S2 schedules 100 texts per direction and chat kind across five repetitions; P1 supplies five isolated samples per direction and kind. Failures can reduce the actual matched count, which is always reported. It disables full tracing/video; default collection uses counters and DOM observations. Optional `CHAT_E2E_DETAILED=1` enables the existing local diagnostic events for explanatory reruns. Summaries then retain fixed operation counts, separate queue/execution samples and group send/receive stage counts, omitting opaque correlation slots and caller stacks. Missing stages, including direct per-message staging/recipient commit correlation unavailable in the existing protocol, are not fabricated from network or DOM timings. Measure the diagnostic overhead on the same controlled runner; a heavy rerun cannot replace the original sample. P1 samples the warm isolated first-message exchange separately from bursts and S1's reload work. The existing history window contains 16 rows: functional checks page through history to verify exact counts and per-sender order. Reports separate automatic first presentation from presentation during explicit history review. Overall/reviewed latency includes that test interaction and must not be treated as automatic delivery latency or used to calibrate its proposed target. Missing automatic samples remain visible in the counts; successful history recovery does not prove every incoming row appeared automatically during the burst. Fewer than 100 automatic recipient samples per direction cannot calibrate a 100-sample automatic-presentation target, even if every message is recovered through history. Reports retain source commit/dirty state, bundle SHA-256, browser/version, runner hardware, cache/network conditions, raw samples and failures.

Performance millisecond gates are **disabled pending calibration**. The proposed absolute loopback p95 target is 1000 ms; a relative increase must exceed both 20% and 100 ms. These are review inputs, not accepted product SLAs or budgets learned from existing lag. Compare a reference and candidate on equivalent fresh data, the same controlled hardware and alternating order. Do not update budgets automatically after a failure. Functional failure deadlines never represent acceptable latency.

A collector control delays a real authenticated response by 400 ms and performs duplicated real reads; both must be detected. A withheld-recipient control proves that acceptance alone cannot satisfy the delivery assertion, then verifies recovery.

## Evidence, CI and acceptance

Evidence stays in ignored `.local/chat-e2e/run-*`: environment, results, summary, failure screenshots and traces. Synthetic traces can still include signing/session/device material. Retention is enforced on each invocation: three days, 100 MiB per run and 300 MiB across retained runs. Do not publish full traces, DOM captures or network records. Inspect failures locally with `npx playwright show-trace <trace.zip>`. Interruption/timeout and any incomplete collector must remain visible in the report.

The separate `chat-browser-smoke` job runs on every PR/main verification with its own PostgreSQL service and pinned browser package. It preserves existing quality/integration/reproducible-build jobs. Only sanitized summary files are uploaded with three-day retention. Full CI traces remain in the ephemeral job; reproduce locally to inspect them. The complete suite and controlled performance command run locally before messaging releases. No paid runner, recurring schedule, deployment or production configuration change is included.

After stable acceptance, repository administrators must make `chat-browser-smoke` required in actual branch protection. A workflow file alone cannot enforce merging. Add a controlled required performance job only after numerical budgets and runner comparability are reviewed. Firefox/WebKit results and unsupported product APIs must be recorded explicitly; desktop WebKit/mobile emulation does not establish physical iPhone acceptance.

**Ponto importante:** this harness detects regressions and preserves reproducible synthetic evidence. It does not itself fix chat latency, prove physical-mobile performance, replace exhaustive security tests or authorize a release.
