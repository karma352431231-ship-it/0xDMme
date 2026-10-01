# Working Standards and Code Hygiene

These instructions apply throughout the repository. The goal is to keep code cohesive, understandable, verifiable, and aligned with the project's privacy-first scope.

## Project Identity

- The approved public app name is **0xDMme**, with canonical public origin **https://0xdmme.app**. The owner registered the domain through Namecheap on 01/10/2026. Use this identity in documentation, UI, PWA metadata and new login statements.
- The workspace directory and historical `hash-talk`/`hash_talk` identifiers are compatibility details, not alternate product names. Do not rename storage keys, cookies, crypto formats/AAD, database names, advisory locks, environment variables or Git identities as part of branding; such changes require their own migration review.
- Domain configuration is approved for an isolated test environment on the existing VPS. Preserve its other project. DNS/HTTPS availability does not establish readiness for real chat data; source distribution obligations and pending security/functional acceptance still apply. Keep VPS access, inventory and device/network details exclusively in `.local/`, outside Git.
- On 01/10/2026, the owner explicitly accepted separate services on the same VPS and a validated graceful Nginx reload. This does not authorize changing the other project's files, services, databases, certificates, firewall rules or dependencies. Do not restart shared services, update system packages or run deployment/install commands in another project's directories. Prepare rollback limited to our additions, compare existing configuration fingerprints and service health before/after, and bound our CPU, RAM, processes, disk growth and traffic. Shared host/network risks remain; do not promise zero impact.
- On 01/10/2026, the owner authorized scoped commits, pushing this project's branch to GitHub and sending source commits to the dedicated VPS Git repository. Preserve the repository's Karma identity without linking it to ohsael or changing global Git credentials. Read VPS access only from `.local/`; never store it in a versioned file or Git remote configuration. Source synchronization does not authorize automatic activation, migrations or changes to shared services. Follow `docs/GIT_E_DEPLOY.md`.

## Context and Decisions

- Consult the relevant parts of `DECISOES_E_PLANO_DE_IMPLEMENTACAO.md` before implementing a feature. Distinguish approved decisions, proposals, and open questions; do not turn examples into requirements.
- The repository is in the planning stage. Do not treat frameworks, scripts, or tools mentioned in the plan as already installed. Inspect the actual state before running commands.
- Preserve existing changes and keep each change focused on the requested objective. Do not include broad refactoring unrelated to the task.
- Record new decisions in the corresponding document and resolve contradictions introduced by the change. Do not change privacy, retention, cost, or product rules to simplify implementation.
- - Critically validate requests and assumptions against the repository before implementing. Compare proposals with the existing code, identify conflicts, risks, and false assumptions, and prefer code evidence over user assumptions.
- Investigate missing context first. Ask only when an unresolved ambiguity would materially change behavior, scope, architecture, data, or an irreversible action. Otherwise, state the reasonable assumption and proceed.
- For requests to answer, review, explain, diagnose, or plan, inspect the relevant materials and report the result without implementing changes unless requested. For requests to change, build, or fix, make the requested in-scope local changes and run relevant non-destructive validation without asking first.
- Require confirmation for destructive actions, external writes, purchases, or material scope expansion.
- Before editing, check `git status` and preserve unrelated user changes. If preexisting changes overlap the target and cannot be safely separated, stop and ask how to proceed.

Always include a statement labeled exactly "Ponto importante" for significant changes, feature updates, and other work that may materially affect the bot's behavior. This helps ensure that relevant details and consequences of the applied changes are not overlooked.

## Mandatory Pause for Material Conflicts

- **When evidence reveals a material conflict with an approved requirement or decision, immediately pause implementation of the affected feature.** If the impact cannot yet be isolated, pause implementation until it is understood. Read-only investigation is allowed to establish the facts and prepare an explanation.
- This rule covers incompatible dependency/distribution licenses; new fees, commercial limits or paid services; external relays and changes to privacy or retention; unsupported wallets, networks, browsers or devices; and alternatives that materially change authentication, account identity, recovery, product experience or V1 scope.
- Explain the situation to the owner in plain Portuguese before proposing implementation. State what was expected, what the evidence actually supports, why it matters, and what already works. Clearly distinguish a confirmed limitation from an unverified assumption.
- Present concrete options with their effects on user steps, privacy, licensing, cost, security, implementation effort and required validation. Identify which requirements each option satisfies and which remain unresolved. Include a recommendation without presenting it as an approved decision.
- **Do not implement a workaround or replacement until the owner explicitly chooses or approves the affected approach.** Do not silently substitute a manual login flow for direct connection, replace cryptographic dependencies, change networks or account rules, reduce V1 to an MVP, or accept new commercial terms to bypass the conflict. Silence, a deadline or approval of the original approach does not approve a materially different replacement.
- Record the owner's decision and resolve contradictions in [DECISOES_E_PLANO_DE_IMPLEMENTACAO.md](DECISOES_E_PLANO_DE_IMPLEMENTACAO.md) and the relevant implementation document before implementing the chosen approach. Preserve valid prior work and rerun only checks affected by the change. Approval does not itself establish license compatibility or technical support; verify those prerequisites.
- Do not trigger this pause for routine implementation choices that preserve approved requirements, or reopen an already resolved conflict without new material evidence. An explicit instruction from the owner takes precedence; do not ask again for a decision already made.

## Mandatory Pause After Context Compaction

- **Whenever context is compacted while a coding task or implementation is in progress, immediately pause implementation.**
- Before making any further code changes, review the available task history, current repository state, and relevant diff to reconstruct the objective, work completed, and remaining steps. Read-only inspection is allowed for this review.
- Summarize what was in progress and explicitly ask the user for permission to resume implementation, explaining that this rule requires the pause.
- **Do not resume code changes or implementation commands until the user grants explicit permission after that compaction.** Prior authorization to perform the task does not satisfy this requirement. Silence or elapsed time is not permission.
- Apply this requirement after every context compaction during an ongoing coding task, even if permission was granted after an earlier compaction.

## Files and Modules

- **Do not impose a line limit per file.** Size is a signal to investigate, not sufficient reason to split code or reject a change.
- Organize by responsibility and cohesion. Split a file when it mixes independent reasons to change, rules from different domains, or unrelated side effects.
- Do not compress code, remove useful explanations, or create artificial file boundaries just to satisfy metrics.
- Start with the smallest modular structure that supports the feature. Do not create microservices, generic interfaces, layers, or packages without a concrete need.
- Avoid concentrating unrelated rules in `utils`, `helpers`, `common`, or a central service that knows the entire system. Shared utilities should have a specific purpose and few dependencies.
- Each module should expose a clear public interface. Other modules must not import its internals or access its tables directly. Coordinated operations must use explicit contracts, preserving atomicity where needed.
- Do not introduce dependency cycles. Avoid re-export files that hide cycles or indiscriminately expose internals.

## Execution and token efficiency

- Consolidate edits before lint, build, or tests. Do not validate every intermediate change.
- Do not repeat a passing command unless a later edit could affect its result. If only one layer changed, rerun only that layer.
- Prefer the smallest targeted test over a complete suite.
- After a failure, diagnose before retrying. Retry once after the fix unless there is concrete evidence of flakiness or the user authorizes more.
- Keep long-command output to summaries and relevant error excerpts. Poll running commands no more than once every 30 seconds.
- If validation is interrupted, reuse still-valid results and report what passed, what stopped, and the residual risk. If the user asks to stop validation, stop immediately and start no new commands.
- Final reports should lead with the outcome and include affected files, validation, material risks, commit hashes when applicable, and pending work. Omit transcripts, repeated rationale, and unchanged details.

## Functions and Control Flow

- A function should represent a coherent operation with understandable inputs, output, and side effects. Names should express intent.
- Prefer early returns and simple control flow. Extract functions around identifiable responsibilities, not line counts.
- Investigate functions with many branches, nesting levels, parameters, or mutable states. Do not hide complexity in callbacks or helpers without meaningful names.
- As initial review guidelines, use cyclomatic complexity of 10, nesting depth of 3, and up to 4 parameters. These are starting points for calibrating rules against real code, not limits already configured.
- Functions longer than approximately 60 lines warrant a cohesion review; length alone does not require splitting. Declarative configuration, JSX, and tests need evaluation appropriate to their role.
- Use parameter objects when they represent related data and make calls clearer, not merely to bypass argument counts.
- Do not overuse boolean parameters or modes to combine different operations in the same function.
- Centralize shared business rules. Do not duplicate authorization, quota, or retention checks in divergent implementations.

## Boundaries and Security

- HTTP/WebSocket handlers should adapt transport, validate inputs, and call operations in the responsible module. Do not concentrate business rules, SQL, and RPC integration in them.
- The frontend must not import server-only code, database drivers, or credentials. Shared code must be safe for the environments where it runs.
- User E2EE secrets and decrypted content stay on the client. Do not send them to the backend, logs, telemetry, or external analysis tools.
- Use maintained cryptographic libraries/protocols according to the validation required by the plan. Do not implement custom cryptography to avoid dependencies or simplify tests.
- Static types do not validate external inputs. Validate data at trust boundaries and enforce server-side authorization for each relevant operation.
- Handle errors explicitly: do not swallow exceptions, simulate success, or use fallbacks that weaken authorization, privacy, or durability. Error messages and logs must not expose private data.
- Do not leave promises unhandled or asynchronous tasks without a defined lifecycle. External operations need time and concurrency limits; retries must be bounded and safe against duplication.

## Persistence and Resources

- Use parameterized queries, versioned migrations, and short transactions. Do not hold SQL transactions open during RPC calls, uploads, or waits for interaction.
- Preserve the atomic and idempotent operations required for quotas, group creation, and delivery. Module boundaries must not break these guarantees.
- Avoid writes that change nothing, unbounded reads, repeated queries per item, and mass deletions in a single transaction. Pagination and batches must have explicit limits.
- Queues, caches, buffers, temporary data, and logs need resource budgets and cleanup policies consistent with product guarantees. Do not expire accepted messages outside the approved exceptions.
- Follow the plan's autovacuum and observability policies. Do not disable durability or maintenance to hide performance problems.

## Tools and Exceptions

- When creating the JS/TS skeleton, configure ESLint; with TypeScript, use strict mode and rules that use type information. Add dependency/boundary validation and a single formatter compatible with the stack. Do not install tools merely to duplicate existing checks.
- **Do not enable `max-lines` as a quality gate.** Prioritize complexity, dependencies, correctness, and responsibility reviews.
- Document the thresholds actually adopted. Blocking rules must cause automated checks to fail; do not routinely accumulate ignored warnings.
- Do not fix failures by adding `any`, `@ts-ignore`, broad lint suppressions, exclusions for authored code directories, or globally increased limits. If a legitimate technical exception exists, make it specific and explain it alongside the code/configuration.
- Generated code and external dependencies may have their own exclusions; do not move authored logic into those areas to evade rules. Tests and migrations may have specific profiles, without blanket exclusions.
- Avoid new dependencies without evaluating their necessity, maintenance, license, compatibility, and effect on the bundle/runtime. Preserve the lockfile and do not mix package managers unnecessarily.

## Verification and Delivery

- Inspect existing scripts. Once implemented, the verification command should combine linting, type checking, boundary validation, and formatting checks; also run tests relevant to the change.
- Local hooks are a convenience. When CI is available, it must repeat the checks required for integration. Do not run these analyses continuously on the production VPS.
- Test behavior and invariants: authorization, quotas, delivery, recovery, revocation, and relevant failures. Do not create tests that merely mirror the implementation or chase a coverage percentage.
- Documentation changes do not require application tests; check consistency, local links, and the diff. For code changes, do not claim checks were performed if they were not run.
- Before finishing, review the diff for responsibilities, dependencies, duplication, error handling, dead code, secrets, and resource impact. Remove remnants of replaced implementations within the task's scope.
- Review complexity trends and exceptions at the end of each implementation block. Large files warrant critical review, not automatic fragmentation. Do not accumulate bulky reports or snapshots in the repository.
- Report what changed, what was verified, and any material limitations. If a check could not run, explain why; do not report it as passed.
