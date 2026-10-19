/** Fixed public startup assets only. Private/API responses never use this path. */
export function compressiblePublicAsset(path: string): boolean {
  return (
    path === '/matrix-crypto-18.9.0.wasm' ||
    /^\/(?:app|i18n-catalog|emoji-catalog|language-start)-[a-f0-9]{16}\.(?:js|css)$/u.test(
      path,
    )
  );
}
