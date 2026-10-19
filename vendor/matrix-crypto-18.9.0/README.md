# Corresponding sources — Matrix Crypto WASM 18.9.0

`preferred-source.tar.xz` contains the official `v18.9.0` tag in `upstream.tar.gz`, `sources.json` and the 323 original `.crate` files pinned by the tag's `Cargo.lock`, with preferred sources and their notices/licenses. Build, test and platform files are also included conservatively. No file contains private 0xDMme data or configuration. Preserve the Apache/MIT/MPL licenses and other original notices; do not relicense third-party code as authored code.

Provenance:

- [Upstream tag](https://github.com/matrix-org/matrix-sdk-crypto-wasm/tree/v18.9.0); archive obtained from `https://codeload.github.com/matrix-org/matrix-sdk-crypto-wasm/tar.gz/refs/tags/v18.9.0`, SHA-256 `0c39d2cf436422eb54ea70e3c8e975059e433573192a427ba5fcbaf728cec077`.
- `Cargo.lock` SHA-256 `f8d1c00a2210fd2869f37bcf693dd5028b7c59fda0125c52e6c6b6ad90844302`, identical to the one reviewed in the cryptography proof.
- Each `.crate` came from `https://static.crates.io/crates/NAME/NAME-VERSION.crate`; its SHA-256 was compared with the lock checksum. `sources.json` records every public result.
- Final archive: 37,444,636 bytes; SHA-256 `1da81a1b9089e833800becb0fbd3ac46dd323d445cd8856c53695db13d4bfc60`.

The build checks the npm version, the SHA-256 and a specific 40 MiB ceiling. It splits the delivery into 18 parts of at most 2 MiB on the same origin, reachable from `/matrix-crypto-18.9.0-sources.html`. These parts are not cached by the PWA. Download them all and concatenate them in order, for example `cat matrix-crypto-18.9.0-source-1da81a1b9089e833-*.bin > preferred-source.tar.xz`; verify the hash and copy the file to this folder before `npm run build`. The main source archive provides the exact incorporated JavaScript and this README; npm and the lockfile provide the exact approved WASM artifact.

To modify or rebuild the engine, extract `preferred-source.tar.xz` and then `upstream.tar.gz` into a separate folder, and follow the development/build section of the upstream README with its included tool scripts and locks, using the preserved `Cargo.lock` and the indicated tool versions. The `.crate` files can be extracted and used as a local registry/vendor directory; verify the checksums first. Do not run downloaded scripts without reviewing the change. This source delivery does not claim that recompiling produces a WASM binary byte-identical to the npm one. Changing the engine requires repeating the technical, license and advisory review and the tests; the normal frontend build keeps the npm 18.9.0 version.
