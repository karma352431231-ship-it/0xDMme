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
  options: { waitMs: number; priority?: 'interactive' },
): Promise<T> {
  const queuedAt = performance.now();
  const measured = () =>
    measureWork(operation, 'storage-exclusive', operation, queuedAt);
  const locks = navigator.locks;
  if (!locks) return exclusive(accountId, measured, options.waitMs);
  const deadline = performance.now() + options.waitMs;
  const signal = AbortSignal.timeout(options.waitMs);
  const acquire = () => {
    signal.throwIfAborted();
    const remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0)
      throw new DOMException(
        t('Wait for conversations to update, then try again.'),
        'TimeoutError',
      );
    return exclusive(
      accountId,
      () => {
        signal.throwIfAborted();
        return measured();
      },
      remaining,
    );
  };
  const turn = () =>
    locks.request(
      `0xdmme-authority-turn:${accountId}`,
      {
        mode: options.priority === 'interactive' ? 'shared' : 'exclusive',
        signal,
      },
      acquire,
    );
  if (options.priority === 'interactive') return turn();
  return locks.request(
    `0xdmme-authority-maintenance:${accountId}`,
    { mode: 'exclusive', signal },
    turn,
  );
}
