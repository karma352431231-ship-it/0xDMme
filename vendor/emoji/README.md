# 0xDMme emoji

## Official languages — 2026-10-13

The panel derives names and keywords in English and Simplified Chinese without
changing the graphics package below. The four additional files are CLDR
**48.2.3** originals under the same [Unicode-3.0](https://github.com/unicode-org/cldr-json/blob/48.2.3/LICENSE)
license. The upstream notice was checked byte for byte against `LICENSE-CLDR.txt`.
The build downloads nothing: it validates the hashes and derives both complete
lists of 3,963 sequences, keeping categories, skin tones and graphic keys.

- [`annotations-en.json`](https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-annotations-full/annotations/en/annotations.json): 438,314 bytes; SHA-256 `f22083cb86dffb63a643d5bacb5d9899f82d2fa5d388ad4f3aed72184acef505`.
- [`annotationsDerived-en.json`](https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-annotations-derived-full/annotationsDerived/en/annotations.json): 782,906 bytes; SHA-256 `15c9457afa703a32dcc78d54626418a91e820fe0ddd67b7d491c4c4d9f5846ab`.
- [`annotations-zh.json`](https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-annotations-full/annotations/zh/annotations.json): 420,265 bytes; SHA-256 `8d2dfe9bf41894bd17c9c1a1906a31bf0ccc06204bf4b77c2ab2b0d8f79a5fdf`.
- [`annotationsDerived-zh.json`](https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-annotations-derived-full/annotationsDerived/zh/annotations.json): 682,370 bytes; SHA-256 `1ff96249af6fc69067f2dfabc26b450786a93d8048f2764ecfad53fd64953f92`.

These originals and `src/tools/frontend-emoji-locales.ts` are part of the main
source download. `src/tools/frontend-emoji.ts` keeps the Unicode catalog of the
original package as the inventory; new names without an annotation get an
explicit local complement, and a missing Chinese entry never silently falls
back to English. The public module `emoji-catalog-<hash>.js` contains both
languages and is part of the offline shell. Only the local choice decides which
list is shown; searches, selections and recents never leave the device. Artwork
licenses and attributions are unchanged, and no parser or new npm package was
added.

## Original graphics package

`assets.json.gz` is gzip-compressed UTF-8 JSON (mtime zero), SHA-256 `d7a2c1166a29ac85606f146f0ebf025606cc1ba0e597c6ef38cf0c691968b80a`, 1,957,171 bytes. It contains 4,009 original SVGs from [Twemoji 17.0.3](https://github.com/jdecked/twemoji/releases/tag/v17.0.3), the upstream README, the original [emoji-test.txt 18.0](https://www.unicode.org/Public/18.0.0/emoji/emoji-test.txt), the `pt` annotations and annotationsDerived from [CLDR 48.2.3](https://github.com/unicode-org/cldr-json/tree/48.2.3) used by the first catalog, provenance URLs and complete licenses. Third-party data is distributed under its own licenses; the authored picker/renderer code remains GPL-3.0-only.

Twemoji: graphics by Twitter, Inc. and other contributors, **CC-BY-4.0**; the project's README and notices are preserved. The SVGs were not redrawn, only gathered into an `svg` JSON map whose key is the original file name without `.svg`. To recover the originals, decompress with gzip, read that map and write each value to `<key>.svg`. Catalog and annotations: **Unicode-3.0**, with complete notices in the `licenses` fields and in the files of this directory. The MIT Twemoji parser code is not used or incorporated. Nineteen Emoji 18 sequences have no Twemoji 17 artwork; they remain Unicode and use the native rendering.

The public asset is `/emoji-d7a2c1166a29ac85.json.gz`, served from the same origin. The **Emoji artwork and licenses** link downloads the complete package without authentication. No chosen emoji, search term or recent is sent with that request: the package is static, identical for everyone and also part of the shell's public cache.

To rebuild the frontend from **Source code and licenses**, download that asset, verify its SHA-256 and copy it to `vendor/emoji/assets.json.gz`. Then run the build described in [docs/FRONTEND_SOURCES.md](../../docs/FRONTEND_SOURCES.md); it validates hash, size and repertoire before deriving the catalog. Nothing is downloaded during the build. To update data or artwork, review versions and licenses, regenerate the map from the originals, compress whitespace-free UTF-8 JSON with gzip level 9 and mtime zero, record the new hash and validate coverage and sizes. The originals and the derivation logic ship with the sources; a different gzip tool is not promised to produce identical bytes.
