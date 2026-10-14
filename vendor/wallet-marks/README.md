# Wallet Identification Marks

Owner-approved source selection on 14/10/2026. These marks identify wallet
choices only; they do not imply sponsorship or endorsement. Do not redraw,
recolor or relicense the artwork as app-authored GPL code. No wallet SDK is
installed. Browser requests remain same-origin, including offline PWA assets.

Website icons were excluded after the Phantom website's terms required written
consent for its marks. The selected originals come from explicitly licensed
official developer/brand repositories instead, with their notices preserved.
This selection does not grant general trademark rights or authorize promotional
reuse. The owner approved this source selection before inclusion.

| File           | Official Source                                                                                                                                                            | Revision                                   | License                                           | SHA-256                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------ |
| `metamask.svg` | [MetaMask brand resources, original color icon](https://github.com/MetaMask/brand-resources/blob/e9cddbf787c62bb387f9b586e7433ab6be440206/SVG/SVG_MetaMask_Icon_Color.svg) | `e9cddbf787c62bb387f9b586e7433ab6be440206` | MIT, Copyright (c) 2018 MetaMask                  | `a927489dbf4bdf79726e0bfff6c5c4c8336452e65da43c50d5ca96b323ffdd2b` |
| `phantom.svg`  | [Phantom Connect SDK, PHANTOM_ICON](https://github.com/phantom/phantom-connect-sdk/blob/daa18efa5d653baf254bc8c010260a2cf2d6ba0a/packages/constants/src/icons.ts)          | `daa18efa5d653baf254bc8c010260a2cf2d6ba0a` | MIT, Copyright (c) 2024 Phantom Technologies, Inc | `f0568a024a8290d744ee7a548839ab9db336357a3fe1b8efcd881d8da1e57013` |
| `backpack.png` | [Backpack Wallet Standard, icon](https://github.com/coral-xyz/backpack/blob/5a538a41d060d2c48507007f96c766483115aecc/packages/wallet-standard/src/icon.ts)                 | `5a538a41d060d2c48507007f96c766483115aecc` | Apache-2.0, package-specific license              | `1b6e91e5c3778ca6a51a8ecbc9fcf05330c3060cec12ef4ea05cf873586a970d` |

MetaMask is the historical official MIT-licensed mark, not a copy of the newer
website artwork. Phantom and Backpack files are exact Base64 decodings of the
upstream constants. The two `.original.txt` files preserve their complete
TypeScript source bytes verbatim; they are external reference material, not
authored app logic. Original licenses are the three `LICENSE-*.txt` files.

`src/tools/frontend-wallet-marks.ts` verifies graphics hashes and publishes
`/wallet-metamask.svg`, `/wallet-phantom.svg` and `/wallet-backpack.png`.
`frontend-source.ts` includes this directory and its originals/notices in the
same-origin corresponding-source download. Updating an asset requires a new
provenance/license review and hash update, never a runtime CDN fallback.
