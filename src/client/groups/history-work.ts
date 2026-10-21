import type { MessageWork } from '../synchronization-work/index.ts';
import type { GroupController } from './controller.ts';
interface HistoryOptions {
  controller: GroupController;
  schedule?:
    | ((work: MessageWork, settled?: () => Promise<void>) => Promise<boolean>)
    | undefined;
  settled: () => Promise<void>;
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
  }): Promise<void> {
    const { controller, schedule } = this.options;
    const work = () => controller.open(input.id, input.older, input.localOnly);
    const settled = async () => {
      if (controller.selected?.state.groupId === input.id)
        await this.options.settled();
    };
    if (schedule) await schedule(work, settled);
    else {
      await work();
      await settled();
    }
  }
}
