# 0xDMme interface fonts

Variable fonts served from the app's own origin. The browser does not contact third-party services to load them.

| File                        | Source                                                                                            | SHA-256                                                            | Bytes  |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| `figtree-latin-5.3.0.woff2` | `files/figtree-latin-wght-normal.woff2` from the npm package `@fontsource-variable/figtree@5.3.0` | `4ba7d3d096695818fe0686be4f1e82c6b05134e18a22260336130335027462dd` | 20,156 |
| `sora-latin-5.3.0.woff2`    | `files/sora-latin-wght-normal.woff2` from the npm package `@fontsource-variable/sora@5.3.0`       | `fa26406eeda9a3c6ec3d9ea8813c3045d6dc755e30c716d5c094e8ef43be5a7f` | 33,652 |

Figtree (body text) is by the Figtree Project Authors. Sora (headings) is by the Sora Project Authors. Both use the **SIL Open Font License 1.1**, reproduced in `LICENSE-FIGTREE.txt` and `LICENSE-SORA.txt`. The files were neither modified nor internally renamed. Only the Latin subset is shipped; other scripts use the system font.

The build (`src/tools/build-web.ts`) checks these hashes and publishes the two files as `/figtree-latin-5.3.0.woff2` and `/sora-latin-5.3.0.woff2`. To update, review the version and license, replace the files and the hashes recorded here and in the build, and check the visual result.
