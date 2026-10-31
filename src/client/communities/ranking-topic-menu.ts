import { t } from '../../shared/i18n/index.ts';
import {
  communityTopics,
  type CommunityTopic,
} from '../../shared/community-classification/index.ts';
import { communityElement as el } from './elements.ts';
import { topicDot } from './classification.ts';

/**
 * Topic filter of the ranking sidebar (31/10/2026): a "Topics" pill that opens
 * a small window listing every topic, one per line, scrollable. Any number of
 * topics can be picked; while at least one is picked the others are dimmed,
 * and clearing all of them colors every topic again. The window stays open
 * while picking and closes on a click outside, Escape or the pill itself.
 *
 * The pill sits inside a horizontally scrolling row, which would clip a
 * window placed beside it, so the window is returned separately for the
 * caller to place outside that row.
 */
export function rankingTopicMenu(options: {
  signal: AbortSignal;
  change: (topics: CommunityTopic[]) => void;
}): { toggle: HTMLButtonElement; panel: HTMLElement } {
  const selected = new Set<CommunityTopic>();
  const toggle = el('button', t('community.topics.toggle'));
  toggle.type = 'button';
  toggle.className = 'ranking-side-topics-toggle';
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  const panel = el('div', '', 'ranking-side-topics');
  panel.id = `ranking-topics-${crypto.randomUUID()}`;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', t('community.topics.filter'));
  panel.hidden = true;
  toggle.setAttribute('aria-controls', panel.id);
  for (const topic of communityTopics) {
    const choice = el('button', '', 'ranking-side-topic');
    choice.type = 'button';
    choice.setAttribute('aria-pressed', 'false');
    choice.append(topicDot(topic.id), el('span', t(topic.label)));
    choice.addEventListener('click', () => {
      if (selected.has(topic.id)) selected.delete(topic.id);
      else selected.add(topic.id);
      choice.setAttribute('aria-pressed', String(selected.has(topic.id)));
      panel.toggleAttribute('data-filtering', selected.size > 0);
      toggle.textContent = selected.size
        ? t('community.topics.toggle-count {0}', [String(selected.size)])
        : t('community.topics.toggle');
      toggle.toggleAttribute('data-active', selected.size > 0);
      // Server order, so the same choice always builds the same request.
      options.change(
        communityTopics
          .map((entry) => entry.id)
          .filter((id) => selected.has(id)),
      );
    });
    panel.append(choice);
  }
  const outside = (event: PointerEvent) => {
    if (
      event.target instanceof Node &&
      !panel.contains(event.target) &&
      !toggle.contains(event.target)
    )
      setOpen(false);
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    setOpen(false);
    toggle.focus();
  };
  let isOpen = false;
  function setOpen(open: boolean): void {
    if (open === isOpen) return;
    isOpen = open;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', escape);
    } else {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    }
  }
  toggle.addEventListener('click', () => setOpen(!isOpen));
  options.signal.addEventListener('abort', () => setOpen(false), {
    once: true,
  });
  return { toggle, panel };
}
