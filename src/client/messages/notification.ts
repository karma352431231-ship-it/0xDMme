import { Messages } from './controller.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';

/** A headless reader uses the ordinary verified packet/cache/recovery path.
 * No selected chat, DOM, daily-read, outbox send or background account sweep. */
export function notificationMessages(input: {
  session: AccountSession;
  access: VaultAccess;
  sync: VaultSync;
  signal: AbortSignal;
}) {
  const messages = new Messages(input.access, input.sync, () => {});
  messages.setSession(input.session);
  input.signal.addEventListener('abort', () => messages.setSession(null), {
    once: true,
  });
  return {
    profile: (peer: string) => messages.knownProfile(peer),
    read: async (peer: string, id: string) => {
      await messages.loadPins();
      input.signal.throwIfAborted();
      const preview = (await messages.directoryPreviews([peer])).get(peer);
      input.signal.throwIfAborted();
      return preview?.id === id && !preview.own ? preview.text : null;
    },
    close: () => messages.setSession(null),
  };
}
