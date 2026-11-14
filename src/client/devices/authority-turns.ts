import type { PrivateSendFields } from '../../shared/chat-sync-diagnostics/private-send.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { exclusive } from '../device-storage/index.ts';

/** Admit only one maintenance contender to the cross-tab turn gate. Shared
 * foreground contenders already waiting there precede the next maintenance
 * turn; a queued exclusive turn in turn prevents foreground starvation of it.
 * The original SDK lock remains innermost and exclusive for every operation. */
export async function authorityTurn<T>(
  accountId: string,
  operation: () => Promise<T>,
  options: {
    waitMs: number;
    priority?: 'interactive';
    platform?: (
      phase: NonNullable<PrivateSendFields['lockPhase']>,
      coverage?: PrivateSendFields['lockCoverage'],
    ) => void;
  },
): Promise<T> {
  const queuedAt = performance.now();
  const measured = () =>
    measureWork(operation, 'storage-exclusive', operation, queuedAt);
  const locks = navigator.locks;
  if (!locks) {
    options.platform?.('storage-queued', 'unavailable');
    return exclusive(accountId, measured, options.waitMs);
  }
  const deadline = performance.now() + options.waitMs;
  const signal = AbortSignal.timeout(options.waitMs);
  const acquire = () => {
    options.platform?.('turn-acquired');
    signal.throwIfAborted();
    const remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0)
      throw new DOMException(
        t('Wait for conversations to update, then try again.'),
        'TimeoutError',
      );
    options.platform?.('storage-queued');
    return exclusive(
      accountId,
      () => {
        options.platform?.('storage-acquired');
        signal.throwIfAborted();
        return measured();
      },
      remaining,
    );
  };
  const turn = () => {
    options.platform?.('turn-queued');
    return locks.request(
      `0xdmme-authority-turn:${accountId}`,
      {
        mode: options.priority === 'interactive' ? 'shared' : 'exclusive',
        signal,
      },
      acquire,
    );
  };
  if (options.priority === 'interactive') return turn();
  options.platform?.('maintenance-queued');
  return locks.request(
    `0xdmme-authority-maintenance:${accountId}`,
    { mode: 'exclusive', signal },
    () => {
      options.platform?.('maintenance-acquired');
      return turn();
    },
  );
}
