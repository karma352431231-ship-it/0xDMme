import { timedLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { Contacts } from './controller.ts';
import type { ContactDirectory } from './directory.ts';

/** The complete verified vault gates both independent contact sources. */
export async function refreshContactSources(input: {
  sync: Pick<VaultSync, 'refresh' | 'complete' | 'pending' | 'retry'>;
  contacts: Pick<Contacts, 'snapshot'>;
  directory: Pick<ContactDirectory, 'load' | 'entries'>;
  trace: LoadTrace | undefined;
}): Promise<number> {
  const { sync, contacts, directory, trace } = input;
  const deadline = Date.now() + 60000;
  do {
    if (Date.now() >= deadline)
      throw new Error('Synchronization interrupted. Try again.');
    await timedLoad(trace, 'vault', () => sync.refresh());
  } while (!sync.complete);
  if (sync.pending) await timedLoad(trace, 'vault', () => sync.retry());
  const results = await Promise.allSettled([
    timedLoad(trace, 'permissions', () => contacts.snapshot()),
    timedLoad(trace, 'agenda', () => directory.load()),
  ]);
  for (const result of results) {
    if (result.status !== 'rejected') continue;
    const error: unknown = result.reason;
    throw error;
  }
  return directory.entries.length;
}
