import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LiveRequest } from '../src/client/message-live/request.ts';
import type {
  VaultAccess,
  VaultWorkOptions,
} from '../src/client/vault-authority/index.ts';

// A visible page's directory refresh waits for this handshake.
for (const visibilityState of ['visible', 'hidden'] as const)
  await test(`a ${visibilityState} page signs the live handshake with ${visibilityState === 'visible' ? 'interactive' : 'maintenance'} priority`, async (t) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { visibilityState },
    });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, 'document', previous);
      else Reflect.deleteProperty(globalThis, 'document');
    });
    const seen: (VaultWorkOptions | undefined)[] = [];
    const access: VaultAccess = {
      withVault: (_offline, _work, options) => {
        seen.push(options);
        return Promise.reject(new Error('Synthetic authority stop.'));
      },
      withLocalVault: () => Promise.reject(new Error('Not used.')),
    };
    await assert.rejects(
      new LiveRequest().open({
        access,
        session: undefined,
        signal: new AbortController().signal,
        current: () => true,
      }),
    );
    assert.equal(
      seen[0]?.priority,
      visibilityState === 'visible' ? 'interactive' : undefined,
    );
  });
