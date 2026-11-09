import { readFile } from 'node:fs/promises';
import {
  appExternalContent,
  contentPolicy,
} from '../shared/content-policy/index.ts';
import { frontendAssets } from './frontend-assets.ts';

/** Packages the shared UI with the installed entry and explicit CSP. Native
 * networking stays behind the guarded session channel; no remote page is used.
 */
export async function mobileProductAssets(
  root: URL,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const files = new Map(
    await frontendAssets(root, {
      application: 'src/client/mobile-entry/index.ts',
      recovery: 'src/client/recovery-return/mobile-entry.ts',
      defines: { INSTALLED_APP: 'true' },
    }),
  );
  for (const [name, bytes] of files) {
    if (!name.endsWith('.html')) continue;
    const external = name === 'index.html' ? appExternalContent : undefined;
    const policy = contentPolicy("'self' 'wasm-unsafe-eval'", external, 'meta');
    const html = new TextDecoder()
      .decode(bytes)
      .replace(
        '<head>',
        `<head><meta http-equiv="Content-Security-Policy" content="${policy}" /><meta name="referrer" content="no-referrer" />`,
      );
    files.set(name, new TextEncoder().encode(html));
  }
  files.set(
    'native-keyboard-license.txt',
    await readFile(
      new URL('mobile/ios/licenses/CAPACITOR_KEYBOARD_MIT.txt', root),
    ),
  );
  return files;
}
