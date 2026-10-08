import type { CommunityMediaStore } from '../database/index.ts';
import { CommunityMediaFiles } from './files.ts';

/** Byte collection does not load/claim the processing runtime or reset active jobs. */
export class CommunityMediaCollector {
  private readonly store: CommunityMediaStore;
  private readonly files: CommunityMediaFiles;
  private initialized = false;
  constructor(store: CommunityMediaStore, directory: string) {
    this.store = store;
    this.files = new CommunityMediaFiles(directory);
  }
  async collect(): Promise<void> {
    if (!this.initialized) {
      await this.files.initialize();
      this.initialized = true;
    }
    for (const id of await this.store.unsettled()) {
      await this.files.prune(id);
      await this.store.settled(id);
    }
    for (const id of await this.store.garbage()) {
      await this.files.discard(id);
      await this.store.collected(id);
    }
  }
}
