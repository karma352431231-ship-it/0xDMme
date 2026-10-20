# libsodium 0.8.4 preferred sources

This directory accompanies the local Phantom/Solana proof. The library keeps its ISC license; notices of the auxiliary tools stay in their own files. No authored 0xDMme source was moved into this archive.

`preferred-source.tar.xz` contains the library's C sources, headers, configuration, tests and build scripts, plus the wrappers' generators, symbols, templates, manifest, notices and Makefile. Root after extraction: `libsodium.js/`, with the C sources in `libsodium.js/libsodium/`. Already generated JS/WASM distributions, browser demos, benchmarks and JS tests were excluded from the wrappers repository; the C sources and their tests were kept in full. The JS artifacts used by the app and their notices ship in the npm packages included in the main source archive.

- JS wrappers/core: commit `2830fcf2ce8cefd3fdc7e1efc9fc1cee1d2d95b7`, declared in the `gitHead` of npm 0.8.4: [official source](https://github.com/jedisct1/libsodium.js/tree/2830fcf2ce8cefd3fdc7e1efc9fc1cee1d2d95b7).
- C: submodule `33cc75ab1565d9dcbe808354191bd572ad6b64d0` of that commit: [official source](https://github.com/jedisct1/libsodium/tree/33cc75ab1565d9dcbe808354191bd572ad6b64d0).
- SHA-256 of the preferred archive: `2528bcbb8a0ed0d1a5492916f455e9a73adeb165f5cf54113834de193c50e29e`.
- Pinned public name: `libsodium-0.8.4-sources-2528bcbb8a0ed0d1.tar.xz`, delivered with the build on the same origin, without authentication. On the canonical environment: [download the preferred sources](https://0xdmme.app/libsodium-0.8.4-sources-2528bcbb8a0ed0d1.tar.xz).

## Rebuilding the frontend

The main **Source code and licenses** archive includes this README and the npm packages, while the complete preferred sources are a separate download on the same origin. Download the `.tar.xz` named above and copy it to `vendor/libsodium-0.8.4/preferred-source.tar.xz` in the tree extracted from the main archive. The build checks version and SHA-256 before copying it as a public asset; it downloads no code. Then follow [docs/FRONTEND_SOURCES.md](../../docs/FRONTEND_SOURCES.md): Node 24.14 in the 24 series, npm 11, `npm ci` and `npm run build`. This path runs no C, Bun or Emscripten, and needs no wallet or server access.

## Optional library regeneration

To modify or regenerate the library, extract the `.tar.xz` into a separate working folder. The original Makefile provides the `standard` and `pack` targets: `make standard` generates the standard modules; `make pack` also generates types and minifies. This requires GNU Make, Bun and an activated Emscripten toolchain (`emcc`/`emconfigure`/`emmake`), plus the generation tools referenced by the original scripts. The upstream manifest declares Terser `^5.46.1`; keep the versions actually chosen in your reproduction environment. The C scripts `dist-build/emscripten.sh` and the generators `wrapper/build-wrappers.ts` are included. Do not run the browser test target, which references omitted demos.

The review compared the two ESM files published on npm with the `dist/modules-esm/` files of the official commit: both match byte for byte. The vendors do not record every compiler version used for publication in the manifest. Bit-for-bit C/WASM regeneration is not claimed; no C recompilation was run in this review. Changing or recompiling the primitives requires a new review and interoperability proofs, instead of silently reusing the current hash.
