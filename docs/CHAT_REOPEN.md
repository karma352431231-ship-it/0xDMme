# Confirmed chat reopening

The owner approved faster reopening of ordinary text and photos in private conversations, groups and public-handle conversations. Ordinary videos are included for private conversations and groups. The owner explicitly chose to preserve the existing photo/GIF/voice formats for public-handle DMs.

## Ownership and authorization

`reopen-cache` owns optional, versioned, vault-encrypted local accelerators and their bounded eviction. It accepts an already established vault authority and cannot import conversation controllers or rendering. Its values never authorize presentation. Account, device, authority directory, namespace and source identity are authenticated inside each envelope.

The private conversation reader persists one completed recent projection after final confirmation and restores it as an unexposed candidate. Its existing snapshot, bounded delta, delivery and final visibility checks control publication. Group message windows similarly restore their completed projection only under matching group governance, then reconcile the current delta and confirm it. Public-handle history retains its existing confirmed cursor and caches an explicit complete recent page bound to the public profile, peer and history snapshot. The public peer access check and final snapshot check precede return to the renderer.

Each cache entry is limited to 512 KiB. A scope retains at most 16 recent window entries. Large windows fall back to the established reader. Profile bodies remain in their existing encrypted store. Windows containing view-once declarations do not create a recent-window accelerator. Existing same-session reuse, independent imported history, pagination and read receipts retain their owners.

## Media

`media-preview` owns encrypted derivatives and bounded canvas encoding. Route media owners authorize the current message, then open the preview and confirm authorization before returning its bytes. Group preview identities include the group, message hash and message epoch. Public-handle preview identities include both public identities. No vault authority enters the renderer.

A photo bubble uses its authenticated thumbnail when available. Otherwise it attempts a saved derivative and falls back to the original. Zooming and saving a thumbnail-backed bubble explicitly open the original. Animated GIFs keep their existing original playback path. Original images can create a 320-pixel JPEG derivative after their first successful visible decode.

A private/group video can show a saved poster without reading the full original. The normal play surface starts source loading and playback on interaction. A missing poster preserves the existing full-source path, which may create a poster from a decoded frame. Public feed callers retain their existing source-loading behavior.

Previews are at most 64 KiB each, with at most 128 entries per existing account/group/media scope. Ciphertext and record overhead remain inside that scope's existing local quota. Original attachment-cache eviction leaves the lightweight derivative available. Explicit message deletion removes both. Local derivatives have no new upload or server quota charge. Encoding stops on cancellation or after four seconds. Rows release object URLs, observers and pending work during their normal cleanup. Photo admission prioritizes the viewport and its 200-pixel margin.

## Verification

Use synthetic content. Check the three routes independently, both with empty caches and after recreating the reader while retaining its encrypted store. Cover changed/deleted messages, changed authority and public identity, membership rejection, unavailable group media and cancellation before presentation. A cached photo/poster must display with zero original reads or decryptions. Zoom/save/play must still open the original.

The implementation brief also requests matched before/after timings and physical-runtime coverage. Record those measurements and any unavailable runtimes in private operational evidence under `.local/`. Node fixtures establish reader and transport contracts. Assembled-browser tests establish rendering, poster playback and actual browser persistence. Physical iOS/Android results must be identified separately.

**Ponto importante** — Fresh authorization remains necessary before private content appears after restart. These local accelerators are encrypted, evictable copies. Their presence does not establish backup completeness or deployment readiness.
