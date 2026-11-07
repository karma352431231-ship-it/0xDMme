import { t } from '../../shared/i18n/index.ts';
import { messageSearchMatches } from '../message-search/index.ts';
import { conversationButton } from './directory.ts';
import type { ConversationEntry } from './directory.ts';
import type { SearchItem } from './search-types.ts';
import { searchResultTime } from './search-results.ts';

/** Search presentation reuses directory avatars and their cancellation lifecycle. */
export function searchMessageRow(input: {
  item: SearchItem;
  entry: ConversationEntry | undefined;
  query: string;
  open: () => void;
}): HTMLElement {
  const { item, entry } = input;
  const row = document.createElement('li');
  const presentation: ConversationEntry = entry
    ? { ...entry, open: input.open, detail: '' }
    : {
        id: item.peer,
        kind: 'contact',
        selected: false,
        searchText: '',
        title: t('Local history conversation'),
        detail: '',
        open: input.open,
      };
  delete presentation.preview;
  const button = conversationButton(presentation);
  button.disabled = !entry;
  const copy = button.querySelector('.conversation-copy')!;
  const text = document.createElement('p');
  text.className = 'search-result-excerpt';
  let end = 0;
  for (const match of messageSearchMatches(item.excerpt, input.query)) {
    text.append(document.createTextNode(item.excerpt.slice(end, match.start)));
    const mark = document.createElement('mark');
    mark.textContent = item.excerpt.slice(match.start, match.end);
    text.append(mark);
    end = match.end;
  }
  text.append(document.createTextNode(item.excerpt.slice(end)));
  copy.querySelector('small')?.remove();
  copy.append(text, searchResultTime(item.sentAt));
  row.append(button);
  return row;
}
