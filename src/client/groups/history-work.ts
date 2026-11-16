import {
  historyWait,
  startHistoryLoad,
  presentHistoryLoad,
} from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import type { HistoryLoadMode } from '../../shared/chat-sync-diagnostics/load.ts';
import {
  MessageContinuation,
  expectedInterruption,
} from '../synchronization-work/index.ts';
import type { MessageWork } from '../synchronization-work/index.ts';
import type { GroupController } from './controller.ts';
import type { GroupMetadataPolicy } from './receipt.ts';
interface HistoryOptions {
  controller: GroupController;
  schedule?:
    | ((work: MessageWork, settled?: () => Promise<void>) => Promise<boolean>)
    | undefined;
  settled: (trace: LoadTrace | undefined) => Promise<HTMLElement | null>;
  metadata?: GroupMetadataPolicy | undefined;
}
/** The read tail belongs to the selected group, not to the first partial turn. */
export class GroupHistoryWork {
  private readonly options: HistoryOptions;
  constructor(options: HistoryOptions) {
    this.options = options;
  }
  async open(input: {
    id: string;
    older: boolean;
    localOnly: boolean;
    mode: HistoryLoadMode;
  }): Promise<void> {
    const { controller, schedule } = this.options;
    const trace = startHistoryLoad('group-history', input.mode, input.id);
    const work = this.observe(
      () =>
        controller.open(input.id, input.older, input.localOnly, {
          metadata: this.options.metadata,
          trace,
        }),
      trace,
    );
    const current = () => controller.selected?.state.groupId === input.id;
    const settled = async () => {
      if (!current()) {
        trace?.point('cancelled', { loadOutcome: 'cancelled' });
        return;
      }
      const host = await this.options.settled(trace);
      presentHistoryLoad(trace, host, controller.views.length, current);
    };
    if (schedule) await schedule(work, settled);
    else {
      await work();
      await settled();
    }
  }
  private observe(
    work: MessageWork,
    trace: LoadTrace | undefined,
  ): MessageWork {
    if (!trace) return work;
    const acquired = historyWait(trace, 'queue');
    return async () => {
      try {
        acquired();
        const next = await work();
        if (next)
          return new MessageContinuation(
            this.observe(next.resume, trace),
            () => {
              trace.point('cancelled', { loadOutcome: 'cancelled' });
              next.cancel();
            },
          );
        trace.point('verified');
      } catch (error: unknown) {
        if (expectedInterruption(error))
          trace.point('cancelled', { loadOutcome: 'cancelled' });
        else trace.point('failed', { loadOutcome: 'failed' });
        throw error;
      }
    };
  }
}
