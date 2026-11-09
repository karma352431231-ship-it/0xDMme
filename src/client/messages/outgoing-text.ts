import { dailyViews } from '../daily-text/index.ts';
import { outgoingTextRows as sharedOutgoingRows } from '../text-send/index.ts';
import type { OutgoingText } from '../text-send/index.ts';
import type { MessageView } from './controller.ts';
export { OutgoingTexts } from '../text-send/index.ts';
export type { OutgoingText } from '../text-send/index.ts';

/** Private history supplies its verified quote text to the shared own-draft view. */
export function outgoingTextRows(input: {
  drafts: readonly OutgoingText[];
  verified: readonly MessageView[];
  retry: () => void;
}): { id: string; key: string; render: () => HTMLElement }[] {
  if (!input.drafts.length) return [];
  const quotes = new Map(
    dailyViews(input.verified).map((view) => [view.id, view.content.text]),
  );
  return sharedOutgoingRows({
    drafts: input.drafts,
    shown: new Set(input.verified.map((view) => view.id)),
    quote: (id) => quotes.get(id),
    retry: input.retry,
  });
}
