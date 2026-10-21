# Verifiable releases

## Authorized scope — 2026-10-21

The owner approved a new branch from main for reproducible builds, an authenticated public release manifest and an external verifier. The public proof must contain only source/release identifiers, file hashes and build-tool versions. VPS access, addresses, environment variables, private configuration, service inventories and user data remain exclusively in ignored `.local/`.

The existing Mac-built deployment command remains the only activation path. This work does not authorize deployment, schema changes, runtime upgrades or changes to chat cryptography. A release proof establishes artifact identity under documented assumptions; it is not an E2EE audit or hardware-backed attestation of the running backend.

## What is authenticated

`release-manifest.json` has an exact allowlist: schema, canonical public GitHub repository, full source commit, pinned Node/npm versions, source-file paths/sizes/SHA-256 hashes, the generated asset-index hash, and public-asset paths/sizes/SHA-256 hashes. Source entries come from tracked `src/`, `infra/`, `package.json`, `package-lock.json` and `.nvmrc`. Public entries come from the build's asset index and must belong to the reviewed public filename families. Unexpected fields, private/escaping paths, duplicates, links, missing or extra files, unsupported tools and excessive inputs fail closed.

No code reads SSH targets, deployment baselines, environment values, service properties, process identities or user records. A hash of a tracked infrastructure template is public code metadata; installed configuration and its values are not part of the proof. The public manifest is generated independently of the private deployment manifest, without serializing or filtering a private operational object.

## Reproduction and signing

1. In a clean checkout of the desired commit, use exactly Node **24.14.0** and npm **11.9.0**. Run `npm ci --ignore-scripts`, then `npm run release:build`. No VPS or database access is needed. Output: `dist/release/release-manifest.json`.
2. The ordinary check workflow calls `release-build.yml`. Independent GitHub-hosted Mac and Linux jobs install the same lockfile and build the commit. A comparison job requires byte-equivalent canonical manifests, covering every declared source and public asset, including HTML, JS, WASM, workers, corresponding sources and Brotli sidecars. CI fails on a difference. Node's pinned compression/tool versions, a fixed GZip OS marker (255), and canonical USTAR metadata remove machine timestamps, usernames, permissions and archive-order variance.
3. After the exact main-commit CI succeeds, the owner may explicitly run **Publish authenticated release proof** on main. It reuses the existing exact-commit CI policy, repeats reproduction, compares both manifests and signs the Mac manifest with GitHub artifact attestations/Sigstore. All actions are pinned by commit. Build jobs have read-only repository permissions; only the final publisher can write attestations/releases and request the signing identity. No VPS credential is available to these jobs.
4. The publisher creates `proof-<full-commit>` with the manifest and Sigstore bundle. It never overwrites an existing proof. The public GitHub/Sigstore record contains release/workflow metadata, not VPS metadata. An ordinary branch/PR build cannot publish an accepted main proof. Publication is manual and does not deploy the app.

Mac remains the deployment build machine. Before an approved activation, its exact prepared release can be checked against the authenticated manifest. Keep using `npm run deploy:staging`; there is no alternate deployment script. This first delivery does not change the deployment gate to require a proof, and never treats a published proof as an activation receipt.

## Independent verification

Use a trusted checkout of the verifier outside the app, Node 24 and a GitHub CLI supporting `gh attestation verify`, `--source-digest`, `--source-ref` and `--deny-self-hosted-runners`. Obtain the expected full commit from an independently trusted release announcement/review, rather than a value supplied only by the VPS.

Download `release-manifest.json` from the matching public GitHub proof release. Then:

```sh
npm run release:verify -- public /path/to/release-manifest.json FULL_COMMIT
```

The verifier authenticates the manifest with the GitHub CLI, pins GitHub.com, the repository, the exact main signing workflow/certificate identity, the main source ref and the expected commit, and rejects self-hosted signers. It then observes actual response bodies from the fixed public origin. It sends no account credentials or cookies, refuses redirects and alternate content encodings, bypasses the browser's Service Worker/cache, and checks sizes and SHA-256 hashes rather than trusting server-reported ETags or version labels. HTML uses the existing fresh-update entry. At most one request runs at once, with a 300 ms interval, a 10-second per-request timeout and a 180-second overall bound. A file is bounded to its authenticated expected size; the public set is bounded to 96 MiB and 128 entries. The manifest has a 1 MiB limit, source sets 2,048 entries, individual files 40 MiB, and directory scans a bounded depth/entry budget. Errors do not print paths, file content or environment values.

An operator or auditor with local filesystem access can instead check an installed or prepared release, without sending any server details elsewhere:

```sh
npm run release:verify -- local /path/to/release-manifest.json FULL_COMMIT /path/to/release
```

That checks the exact source and public-build file sets on disk. It does not inspect private configuration, installed dependencies, executable memory, launch options or all host processes. Such runtime/preservation checks remain a separate private operational audit. Extra files inside the source/public-build directories fail verification; use a fresh source tree without local Python caches or diagnostics.

For two independently created manifests, an offline comparison is available:

```sh
npm run release:verify -- compare FIRST_MANIFEST SECOND_MANIFEST
```

This comparison checks equality only. It does not authenticate a manifest, attest deployment, or establish E2EE. The public/local commands have no option to skip authentication.

## Acceptance and limits

Tests cover privacy boundaries, canonical archive reproduction with changed machine metadata, unknown/private fields, traversal/links, extra/missing/tampered files, canonical manifests, independent build divergence, public response bodies, fixed-origin/credential/redirect/size controls, signer policy and CLI failure. Existing frontend-source tests also require identical archive bytes after extraction with changed times and modes. Reproduction covers frontend assembly using the exact npm packages and reviewed vendored inputs, including upstream precompiled WASM. It does not independently rebuild or audit every upstream cryptographic binary. The Mac/Linux CI must pass before integration. A real Sigstore signing/verification round trip remains a required acceptance step after the workflow is available on main; local synthetic tests do not establish it.

**Important:** the proof identifies authenticated release artifacts and the public responses observed by a verifier. It does not prove that a hostile VPS serves identical code to every user, nor remotely attest all backend execution. A malicious web frontend can expose plaintext or secrets while they are in use. The verifier therefore runs outside the app; a self-check delivered by the same server would not remove that trust boundary. Protocol/key-authentication review, synthetic E2EE tests and an independent security audit are separate work. No claim of absolute security or audited E2EE is introduced.

The existing `frontend-source.ts` has a growing, explicit source-distribution inventory. This task adds a cohesive archive module and one inventory entry, rather than a second packaging pipeline. A future dedicated refactor may separate authored-source inventory, vendor source selection and packaging; preserve coverage of every incorporated source and license, archive portability, size limits and offline rebuilds.

References: [Reproducible Builds definition](https://reproducible-builds.org/docs/definition/), [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations), [GitHub CLI verification policy](https://cli.github.com/manual/gh_attestation_verify), [W3C Web Cryptography security considerations](https://www.w3.org/TR/webcrypto/#security-considerations).
