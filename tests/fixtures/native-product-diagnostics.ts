import {
  readCheckpoint,
  storedIdentity,
} from '../../src/client/device-storage/index.ts';
import { canonical, digest } from '../../src/shared/devices/index.ts';

/** Private fixture metadata. Error-constructor observation is opt-in for a
 * dedicated investigation; ordinary acceptance keeps the built-in constructors.
 * Record locations only, never messages, payloads, keys or decrypted content.
 */
export function installNativeProductDiagnostics(): void {
  const directory: string[] = [];
  const native: string[] = [];
  const errors: string[] = [];
  const state: {
    directory: string[];
    native: string[];
    errors: string[];
    captured: boolean;
    metadata: unknown;
    capture: (account: string) => void;
  } = {
    directory,
    native,
    errors,
    captured: false,
    metadata: null,
    capture(account: string) {
      state.captured = false;
      void captureCheckpoint(account).then(
        (value) => {
          state.metadata = value;
          state.captured = true;
        },
        () => {
          state.metadata = { readable: false };
          state.captured = true;
        },
      );
    },
  };
  Object.assign(window, { syntheticNativeDiagnostics: state });
  if (document.documentElement.dataset['nativeDiagnostics'] !== 'observe')
    return;
  Object.assign(window, {
    Error: observedError(
      window.Error,
      ['Diretório de dispositivos inválido.'],
      directory,
      errors,
    ),
    TypeError: observedError(
      window.TypeError,
      [
        'Native API exchange failed.',
        'The installed app connection is unavailable.',
        'Native API transport is unavailable.',
      ],
      native,
      errors,
    ),
  });
}

function observedError(
  constructor: ErrorConstructor,
  messages: readonly string[],
  output: string[],
  errors: string[],
): ErrorConstructor {
  return new Proxy(constructor, {
    construct(target, args: unknown[], newTarget) {
      const error = Reflect.construct(target, args, newTarget) as Error;
      const stack = error.stack?.split('\n').slice(1, 9).join('\n');
      const location = stack?.slice(0, 1600) || 'Stack unavailable.';
      if (!errors.includes(location)) {
        if (errors.length >= 12) errors.shift();
        errors.push(location);
      }
      if (typeof args[0] === 'string' && messages.includes(args[0])) {
        if (output.length < 4) output.push(location);
      }
      return error;
    },
  });
}

/** Reads through the storage owner's public operations. Only booleans/counts
 * leave this client; private CryptoKeys and encrypted records are never exported.
 */
async function captureCheckpoint(account: string): Promise<object> {
  if (!/^[a-f0-9-]{36}$/u.test(account))
    throw new Error('Expected a synthetic account.');
  const id = localStorage.getItem('hash-talk:login-device');
  if (!id) throw new Error('Expected the synthetic login device.');
  const checkpoint = await readCheckpoint(account);
  const latest = checkpoint.events.at(-1);
  const identity = await storedIdentity(account, id);
  if (!latest) return { readable: true, events: 0 };
  const device = latest.devices.find((candidate) => candidate.id === id);
  return {
    ...(await runtimeMetadata()),
    readable: true,
    events: checkpoint.events.length,
    epoch: latest.epoch,
    trusted: checkpoint.trustedRoot === (await digest(canonical(latest.root))),
    rootPinned: checkpoint.trustedRoot !== null,
    expectedAccount: latest.accountId === account,
    identityDeviceMatches: identity.public.id === id,
    deviceListed: !!device,
    deviceRevoked: latest.revoked.includes(id),
    localPublicIdentityMatches:
      !!device &&
      device.signing === identity.public.signing &&
      device.wrapping === identity.public.wrapping,
  };
}

async function runtimeMetadata(): Promise<object> {
  const locks = await navigator.locks.query();
  return {
    heldLocks: locks.held?.length ?? 0,
    pendingLocks: locks.pending?.length ?? 0,
    online: navigator.onLine,
    visibility: document.visibilityState,
    visibleConversation: !!document
      .querySelector('[data-direct-conversation]')
      ?.getClientRects().length,
  };
}
