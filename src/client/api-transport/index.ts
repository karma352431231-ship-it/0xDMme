import { installedApplication } from '../application-origin/index.ts';
import type { NativeApiTransport } from '../native-api/index.ts';

let native: NativeApiTransport | undefined;

/** Called once by the installed entry after its private bridge is initialized.
 * Web builds never activate a native transport. A missing native implementation
 * fails closed rather than making account requests to the local asset server.
 */
export function installNativeApiTransport(transport: NativeApiTransport): void {
  if (!installedApplication() || native)
    throw new Error('Native API transport is unavailable.');
  native = transport;
}

export function requestApi(
  path: string,
  input: RequestInit,
): Promise<Response> {
  if (!installedApplication()) return fetch(path, input);
  if (!native)
    return Promise.reject(
      new TypeError('Native API transport is unavailable.'),
    );
  return native.fetch(path, input);
}
