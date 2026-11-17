import { networkAvailable } from '../connectivity/index.ts';
import { readReopen, writeReopen } from '../reopen-cache/index.ts';
import { withDraftVault, withSigner } from '../vault-authority/index.ts';
import type {
  SigningAuthority,
  VaultAccess,
  VaultAuthority,
  VaultLocator,
} from '../vault-authority/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';

interface Checkpoint<V extends DailyRow> {
  cut: string;
  views: readonly DailyView<V>[];
}
export interface GalleryCheckpoint<V extends DailyRow> {
  read: (signal: AbortSignal) => Promise<readonly DailyView<V>[] | null>;
  save: (value: Checkpoint<V>, signal: AbortSignal) => Promise<void>;
}

/** The account's existing shared reopen budget also bounds catalogue records.
 * Only a fresh, exact signed cut can authorize using one. */
export function galleryCheckpoint<V extends DailyRow>(input: {
  access: VaultAccess;
  session: VaultLocator;
  key: string;
  current: (
    authority: SigningAuthority,
    signal: AbortSignal,
  ) => Promise<string | null>;
  eligible?: (authority: VaultAuthority) => Promise<boolean>;
}): GalleryCheckpoint<V> {
  const { access, session, current, eligible } = input;
  const location = {
    scope: session.accountId,
    name: `reopen:gallery:${input.key}`,
    binding: ['gallery', 1, input.key],
  };
  return {
    read: async (signal) => {
      if (!networkAvailable()) return null;
      try {
        const saved = await withDraftVault(
          access,
          session,
          async (authority) => {
            signal.throwIfAborted();
            const value = await readReopen<Checkpoint<V>>(authority, location);
            if (!value || (eligible && !(await eligible(authority))))
              return null;
            return value;
          },
        );
        signal.throwIfAborted();
        if (!saved || !Array.isArray(saved.views)) return null;
        const cut = await withSigner(access, (authority) =>
          current(authority, signal),
        );
        signal.throwIfAborted();
        return cut === saved.cut ? saved.views : null;
      } catch (error: unknown) {
        if (signal.aborted) throw error;
        // An unavailable accelerator always returns to normal verified history.
        return null;
      }
    },
    save: async (value, signal) => {
      if (!networkAvailable() || signal.aborted) return;
      try {
        await withDraftVault(access, session, async (authority) => {
          signal.throwIfAborted();
          if (eligible && !(await eligible(authority))) return;
          signal.throwIfAborted();
          await writeReopen(authority, location, value);
        });
      } catch {
        // The current catalogue has already been published from verified reads.
      }
    },
  };
}
