import {
  HistoryFloors,
  historyPage,
  reachFloor,
} from '../history-window/index.ts';
import type { HistoryFloor } from '../history-window/index.ts';
import { watchOlderHistory } from '../chat-ui/index.ts';
import type { OlderHistory } from '../chat-ui/index.ts';
import type { DmPage } from './dm-history.ts';

/** How far back each handle conversation reaches, and the frame's scroll
 * trigger that asks for one page further. Cleared with the session. */
export class DmHistoryDepth {
  private readonly floors = new HistoryFloors();
  private requested = false;
  private watch: { stop: AbortController; older: OlderHistory } | null = null;
  /** Watches one conversation frame until the next frame replaces it;
   * `load` reloads the conversation. */
  bind(input: {
    history: HTMLElement;
    button: HTMLButtonElement | null;
    conversation: () => string | null;
    shown: () => number;
    load: () => Promise<void>;
  }): void {
    this.requested = false;
    this.watch?.stop.abort();
    const stop = new AbortController();
    const older = watchOlderHistory({
      history: input.history,
      button: input.button,
      signal: stop.signal,
      available: () => {
        const id = input.conversation();
        return (
          !!id &&
          !this.floors.complete(id) &&
          (this.floors.floor(id) !== null || input.shown() >= historyPage)
        );
      },
      load: async () => {
        const id = input.conversation(),
          shown = input.shown();
        this.requested = true;
        await input.load();
        return input.conversation() === id && input.shown() > shown;
      },
    });
    this.watch = { stop, older };
  }
  /** The latest page extended back to the floor, and further when asked. */
  async window(
    conversation: string,
    latest: DmPage,
    page: (before: number) => Promise<DmPage>,
  ): Promise<DmPage> {
    const older = this.requested;
    this.requested = false;
    const reached = await readDmWindow({
      latest,
      floor: this.floors.floor(conversation),
      older,
      page,
    });
    this.floors.update(conversation, reached);
    return reached.page;
  }
  check(): void {
    this.watch?.older.check();
  }
  clear(): void {
    this.floors.clear();
    this.requested = false;
  }
}

/**
 * A handle conversation from its floor to the newest message (history-window,
 * 24/10/2026). Pages come from this device's verified copy, which the latest
 * read has just synchronized, so reaching back costs local reads only.
 */
export async function readDmWindow(input: {
  latest: DmPage;
  floor: HistoryFloor;
  older: boolean;
  page: (before: number) => Promise<DmPage>;
}): Promise<{
  page: DmPage;
  floor: HistoryFloor;
  complete: boolean | null;
}> {
  const reactions = new Set(input.latest.reactionReads);
  const reached = await reachFloor({
    rows: input.latest.items,
    floor: input.floor,
    older: input.older,
    page: async (before) => {
      const page = await input.page(before);
      for (const id of page.reactionReads) reactions.add(id);
      return page.items;
    },
    merge: (newer, older) => {
      const rows = new Map(older.map((item) => [item.id, item]));
      for (const item of newer) rows.set(item.id, item);
      return [...rows.values()].sort((a, b) => a.sequence - b.sequence);
    },
  });
  return {
    page: {
      ...input.latest,
      items: reached.rows,
      reactionReads: [...reactions],
    },
    floor: reached.floor,
    complete: reached.complete,
  };
}
