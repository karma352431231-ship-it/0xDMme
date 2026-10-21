# 0xDMme — Frontend corresponding sources

The **Source code and licenses** link (Profile → About the app, also available without an account) serves the corresponding sources of the exact build being served, without sign-up or authentication. The archive name contains its abbreviated SHA-256, and every build publishes it next to its assets. The archive never contains the backend, private configuration, `.local/`, account data, keys or inventories.

## Contents

- Authored sources of the interface and PWA, account and profile, devices, vault (authority, cryptography, storage, synchronization and interface), contacts, direct and group messages, photos/files and their Worker, independent backup, notifications, message actions, local search and privacy, wallet discovery and recovery, organizations/representatives (proof formats and the signature request in the wallet-connected browser), communities with their badge and social-control contracts, and chat actions (`src/client/message-forward/`, `src/client/message-presentation/`, `src/shared/message-presentation/`).
- Language modules: `src/shared/i18n/`, `src/client/language/`, the label/state adapters and the catalog scripts. The build generates separate public modules for app text and for emoji names/search, each containing both official languages and included in the offline shell. Search terms never leave the device.
- Relevant shared code, original assets, the build scripts, the npm manifest and lockfile, the TypeScript configuration, the GPL text and all notices.
- Third-party packages incorporated into the JavaScript ship under `node_modules/` with their notices and licenses; their original licenses keep applying. For `ethers@6.17.0`, its incorporated `@noble/curves`/`@noble/hashes` versions and `qr@0.7.2`, the archive contains every preferred TypeScript source provided by the exact package, its metadata, README/license and every incorporated JavaScript input. Only duplicate distributions (and, for `qr`, declarations) are excluded; nested versions are identified separately and may not be missing. For `libsodium`/`libsodium-wrappers`, the duplicate CommonJS distributions are omitted while the full ESM build, metadata/notices and every effective input are kept. Other packages ship complete.
- The build fails if an incorporated authored client/shared source is missing from the archive, and it checks every third-party input.

## Packaging limits

- Up to 2,048 distinct files. The ceiling was raised from 1,024 on 2026-10-19; tests preserve 1,025 distinct files exactly and reject 2,049.
- A 24 MiB budget for the intermediate tar tree, gzip level 9 with the portable OS marker 255, and a canonical USTAR format with sorted paths, zero timestamps and numeric owners, fixed 0644 file modes, and no ACLs, extended attributes, usernames or per-file extended headers from the build machine.
- The owner removed the individual 2 MiB ceiling for `source-<hash>.tar.gz` in October 2026, across packaging, serving and deployment HTTP verification. Other asset and attachment limits are unchanged, as are the total deploy artifact and release budgets.
- The source archive stays outside the PWA offline cache.
- No source, notice or license is ever omitted to fit a budget.

## Separate downloads

Larger preferred sources are separate downloads on the same origin. Place each one as described before building.

- **Emoji artwork** — the **Emoji artwork and licenses** link serves `/emoji-d7a2c1166a29ac85.json.gz` (1,957,171 bytes, SHA-256 `d7a2c1166a29ac85606f146f0ebf025606cc1ba0e597c6ef38cf0c691968b80a`). Copy it to `vendor/emoji/assets.json.gz`. See [vendor/emoji/README.md](../vendor/emoji/README.md).
- **Messaging engine** — the **Messaging engine sources** link opens `/matrix-crypto-18.9.0-sources.html`. Download the 18 parts, concatenate them in the listed order, verify SHA-256 `1da81a1b9089e833800becb0fbd3ac46dd323d445cd8856c53695db13d4bfc60` and copy the result to `vendor/matrix-crypto-18.9.0/preferred-source.tar.xz`. The 37,444,636-byte archive contains the Rust sources of the approved tag, the tool scripts/locks and the 323 `.crate` files verified against `Cargo.lock`. Parts are at most 2 MiB each and are not cached by the PWA; this archive has a specific 40 MiB budget and its WASM a specific 8 MiB budget. The WASM is served from the exact npm package on the same origin. See [vendor/matrix-crypto-18.9.0/README.md](../vendor/matrix-crypto-18.9.0/README.md).
- **libsodium 0.8.4** — `libsodium-0.8.4-sources-2528bcbb8a0ed0d1.tar.xz`, with the preferred C sources, generators, scripts and notices of the compiled library. Copy it to `vendor/libsodium-0.8.4/preferred-source.tar.xz`. See [vendor/libsodium-0.8.4/README.md](../vendor/libsodium-0.8.4/README.md).

The deploy command keeps its 16 MiB total artifact limit, so the messaging-engine parts are rebuilt in the release directory from the blob already synchronized to the dedicated Git repository, checking their hashes. Sources are never omitted to fit that limit.

## Rebuilding

1. Extract the main `.tar.gz` into a new folder and place the separate downloads as described above.
2. Use Node 24.14 or later in the 24 series and npm 11.
3. Run `npm ci` and `npm run build`. This installs the lockfile versions, including the esbuild compiler.

No database, backend access or credential is needed, and nothing is downloaded during the build: it validates the hashes, sizes and versions of the vendored inputs. The output is `dist/web/`; only those assets are public. The project's test, lint and backend scripts reference private files that are not in the archive and are not needed to rebuild the frontend.

## Licensing

GPL-3.0-only covers the authored sources listed in [LICENSES.md](../LICENSES.md) and the build scripts shipped in the archive. Third-party licenses are in the package directories and in the libraries' preferred-source archives. The same-origin downloads do not depend on making the whole repository public. Interface updates must update the corresponding sources; never replace these files with links to different versions.

## Public release verification

[Verifiable releases](VERIFIABLE_RELEASES.md) adds independent Mac/Linux build comparison, an explicitly published authenticated manifest and an external verifier. Exact reproduction uses Node 24.14.0 and npm 11.9.0. These proofs cover release artifacts and observed public bytes; they do not expose private VPS records or establish an E2EE audit.
