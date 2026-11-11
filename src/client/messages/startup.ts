import { measuredLoad, timedLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import { prepareMessageRuntime } from '../message-runtime/index.ts';

interface DirectoryStartup {
  /** Completes the verified vault heads the address book reads. */
  loadVault: () => Promise<void>;
  loadContacts: () => Promise<void>;
  /** Opens identity pins from those heads; histories and sends wait for it. */
  loadPins: () => Promise<void>;
  guard: () => void;
  settled?: () => void;
}
/** Load the authenticated directory alongside the public runtime download.
 * SDK/store preparation is scheduled separately. Each history and send keeps
 * its own authority, identity, removal and final confirmation checks. */
export async function loadMessageDirectory(
  operations: DirectoryStartup,
): Promise<void> {
  return measuredLoad('directory-startup', async (trace) => {
    operations.guard();
    const results = await Promise.allSettled([
      timedLoad(trace, 'runtime', () => prepareMessageRuntime()),
      loadDirectory(operations, trace),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        const error: unknown = result.reason;
        throw error;
      }
    }
    operations.guard();
  });
}
/** Contacts render once the vault is current, before every identity entry is
 * opened; a row grants no message authority, and startup still resolves only
 * after the pins are loaded. */
async function loadDirectory(
  operations: DirectoryStartup,
  trace: LoadTrace | undefined,
): Promise<void> {
  try {
    await timedLoad(trace, 'vault', operations.loadVault);
    operations.guard();
    await timedLoad(trace, 'permissions', operations.loadContacts);
    operations.guard();
  } finally {
    operations.guard();
    operations.settled?.();
  }
  await timedLoad(trace, 'pins', operations.loadPins);
  operations.guard();
}
