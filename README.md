# 0xDMme

**0xDMme** is a private web/PWA messenger with wallet-based sign-in and end-to-end encryption: message content and decryption secrets stay on the user's devices. The canonical origin is **https://0xdmme.app**, currently an isolated [test environment](https://0xdmme.app/) with valid public HTTPS. It is not a V1 release and not yet intended for real chat data.

Wallet authentication and end-to-end encryption are requirements being implemented and validated, not guarantees of already available software.

## Status

Implemented areas include:

- Wallet sign-in by signature for EVM and Solana (EIP-6963, Wallet Standard and a same-origin return flow for mobile wallet browsers), with an encrypted profile.
- Verifiable device authorization, QR/code linking, recovery with the original wallet and a secret, and revocation with key rotation.
- An encrypted vault with preserved versions, explicit conflicts, an offline local copy and recovery on another device.
- Wallet-based contacts with encrypted nicknames, revocable invites, owner-chosen discovery, mutual consent and server-side blocking.
- Direct and group messages through Matrix Crypto (Olm/Megolm), with a non-expiring queue, per-device confirmation and recovery since acceptance.
- Photos and files with verified metadata removal, encrypted thumbnails, resumable uploads and two-sided deletion.
- Independent backups, notifications, message actions, encrypted local search, voice messages and public communities with profiles and feeds.

Voice calls (WebRTC with a dedicated TURN server) are implemented locally but not active in the test environment. Physical mobile acceptance and the final security acceptance are still pending.

## Local setup

Requirements: Node 24 (24.14.0 in `.nvmrc`), npm 11 and PostgreSQL 16 for the persistent backend. Docker is not required. Unit checks and the build need no database; integration tests need a dedicated database. Never point the app at another project's database.

If you use nvm, run `nvm use` in this folder first. Check `node --version` and `npm --version`; installs outside the declared ranges are refused.

```bash
npm ci --ignore-scripts
npm run probe:zk:prepare
npm run check
npm run build
```

After preparing the dedicated database and configuring `.env` from `.env.example`, `npm run dev` builds the app and serves it only on `http://127.0.0.1:45100`. External database hosts and unknown profiles fail explicitly. Ctrl+C closes HTTP and the pool. The `staging` profile is exclusive to the isolated test environment, with its canonical origin, its own database and role, a Unix socket and fixed directories; `.env.staging.example` is only a template without credentials. There is no production profile yet; never publish the development profile.

`npm run check` runs type-aware lint, strict TypeScript, module boundaries, npm license checks, formatting, localization checks, the builds and the tests. `npm run test:integration` checks a real database and the service lifecycle, with the test URL in `.local/web-test.env` or in the environment; the violations used by the tests are temporary. `npm run format` applies the single adopted formatter.

CI in `.github/workflows/check.yml` repeats the checks and runs the integration tests against a temporary PostgreSQL 16 on Ubuntu, without deployment or real credentials.

For the cryptography lab, run `npm run probe:crypto` and open `http://127.0.0.1:45101/`; vault and ZK probes are also available. The lab is temporary and uses only fictitious data. `probe:zk:prepare` downloads pinned public artifacts before private use, with no CDN during the probe; `npm run probe:measure` keeps measurements in ignored local records. For an iPhone on the same private network, the optional `npm run probe:mobile` profile uses HTTPS and temporary access; it needs configuration and certificates in `.local/` and explicit trust of the test certificate on the device. The default profile stays on loopback.

Local PostgreSQL metrics: `npm run observe:database`, with the same private `.env` as the app. An aggregated snapshot replaces the previous one only in `.local/metrics/database.json`.

## Documentation

- [Localization](docs/I18N.md): official languages and how app text is added.
- [Licenses](LICENSES.md): frontend distribution and third-party components.
- [Frontend corresponding sources](docs/FRONTEND_SOURCES.md): contents of the source download and how to rebuild the frontend.

## Workflow

- Use `main` as the base and one branch per task.
- Configure authorship and authentication only in this repository, with the owner account and its GitHub `noreply` email. Keep credentials separate per repository.
- Keep the code checks of the base: cyclomatic complexity 10, nesting depth 3 and four parameters are blocking errors, with no line limit.
- Review the files staged for each commit and confirm before pushing to the remote.

## Private data

[.gitignore](.gitignore) excludes private configuration, keys, local data directories, dependencies and generated output. [.env.example](.env.example) contains only the setup profile; future examples must contain only fictitious values.

**Important:** never commit private keys, recovery secrets, credentials, conversation content or backups, even encrypted. `.gitignore` does not inspect file contents and does not protect files that are already tracked; review the diff before every commit.
