# Recovering from a false browser offline hint

On 12 November 2026, the owner reported that Opera kept 0xDMme offline after a
forced Mac crash. In the affected tab, `navigator.onLine` returned `false` while
a fresh request to `/health/ready` returned HTTP 200. Restarting Opera restored
the browser hint. The exact browser failure was not established.

The owner requested a fix on a branch from `main`, without committing or merging
it into `main`. Browser connectivity is a hint for scheduling, not authorization
or proof that the service is available.

## Ownership and contract

`src/client/connectivity` owns the in-memory network availability signal, its
foreground probe and its cancellation. Consumers use `networkAvailable()` and
the module's online/offline events, instead of reading `navigator.onLine`
directly. Domain rules, authenticated refreshes, retry budgets, encrypted storage
and account/device authority remain with their existing owners.

- A browser online hint retains the existing permission to attempt requests.
- A real API response, including HTTP 401/403/429/5xx, permits networking despite
  a false offline hint. It does not turn that response into success or authorize
  an account, message, download or historical view.
- A browser network change or a transport network failure invalidates the
  response evidence. User cancellation and operation timeouts are not evidence
  of losing connectivity. HTTP failures retain their existing error handling.
- When a visible web document receives an offline hint, one cookie-free,
  same-origin `HEAD /health/live` request can establish reachability. The request
  uses `no-store`, rejects redirects and has an eight-second deadline. It does
  not inspect a response body, resend a mutation or send account data.
- While the hint remains false, checks start at most once per 30 seconds. Real
  API responses postpone unnecessary probes. Only one check can be in flight.
  Hiding, freezing or leaving the page cancels the check and its retry timer;
  returning resumes the bounded checks. Permanent departure removes listeners.
- Successful recovery emits one effective online transition. The existing
  consumers recheck signed account/device state and synchronize normally.
  Failed checks preserve offline history and cannot release pending messages.
- Installed clients keep the restricted native transport. They use API-response
  evidence without adding a browser probe against their packaged asset origin.
  Workers use response evidence without starting document timers or listeners.

No persistent connectivity flag, new dependency, endpoint, database change,
telemetry, external connectivity service or browser-property override is added.

## Verification

The regression reproduces a false browser hint followed by a real HTTP response:
signed contacts must resume while the browser property remains false, and a
missing session must still be rejected. Connectivity tests cover automatic
recovery, genuine offline failures, deadlines, request coalescing, HTTP errors,
cancellation, network changes, foreground lifecycle and listener disposal.

The dependency boundary prevents connectivity from importing domain operations.
Physical Opera verification still requires running the changed client; restarting
the old client only confirmed a local recovery, not acceptance of this fix.
