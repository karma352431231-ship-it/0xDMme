import { t } from '../../shared/i18n/index.ts';
import {
  communityTopics,
  communityTopicSelection,
  communityCreationClassification,
} from '../../shared/community-classification/index.ts';
import type {
  CommunityClassification,
  CommunityTopic,
} from '../../shared/community-classification/index.ts';
import type { CommunityState } from '../../shared/communities/index.ts';
import {
  communityElement as el,
  communityButton as button,
} from './elements.ts';

export function classificationBadges(
  value: CommunityClassification | undefined,
): HTMLElement {
  const row = el('span', '', 'community-classification-badges');
  row.setAttribute('aria-label', t('community.topics.title'));
  if (!value) return row;
  if (value.nsfw) {
    const badge = el(
      'span',
      t('community.nsfw.label'),
      'community-topic-badge community-nsfw-badge',
    );
    badge.title = t('community.nsfw.hint');
    row.append(badge);
  }
  for (const id of value.topics) {
    const topic = communityTopics.find((entry) => entry.id === id)!;
    row.append(topicLabel(topic, 'community-topic-badge'));
  }
  return row;
}
function topicLabel(
  topic: (typeof communityTopics)[number],
  className: string,
) {
  const node = el('span', '', className),
    icon = el('span', topic.symbol);
  icon.setAttribute('aria-hidden', 'true');
  node.append(icon, el('span', t(topic.label)));
  return node;
}
export function topicPicker(
  host: HTMLElement,
  options: {
    selected: CommunityTopic[];
    maximum: number;
    label?: string;
    change?: (topics: CommunityTopic[]) => void;
  },
) {
  const field = el('fieldset', '', 'community-topic-picker');
  field.append(el('legend', options.label ?? t('community.topics.title')));
  const selected = new Set(options.selected);
  const inputs: HTMLInputElement[] = [];
  for (const topic of communityTopics) {
    const label = el('label', '', 'community-topic-choice'),
      input = el('input');
    input.type = 'checkbox';
    input.value = topic.id;
    input.checked = selected.has(topic.id);
    input.addEventListener('change', () => {
      if (input.checked) selected.add(topic.id);
      else selected.delete(topic.id);
      for (const other of inputs)
        other.disabled = !other.checked && selected.size >= options.maximum;
      options.change?.(communityTopicSelection([...selected], options.maximum));
    });
    inputs.push(input);
    label.append(input, topicLabel(topic, 'community-topic-label'));
    field.append(label);
  }
  for (const input of inputs)
    input.disabled = !input.checked && selected.size >= options.maximum;
  host.append(field);
  return () => communityTopicSelection([...selected], options.maximum);
}
function nsfwChoice(host: HTMLElement, checked: boolean): HTMLInputElement {
  const label = el('label', '', 'community-nsfw-choice'),
    input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  label.append(
    input,
    el('strong', t('community.nsfw.label')),
    el('span', t('community.nsfw.hint')),
  );
  host.append(label);
  return input;
}
export function classificationForm(
  host: HTMLElement,
): () => CommunityClassification {
  const section = el('section', '', 'community-classification-form');
  const nsfw = nsfwChoice(section, false);
  const disclosure = el('details', '', 'community-topic-disclosure');
  const toggle = el(
    'summary',
    t('Community topics · {0}/2 selected (required)', [0]),
  );
  disclosure.append(
    toggle,
    el('p', t('community.topics.fixed-hint'), 'community-classification-hint'),
  );
  const topics = topicPicker(disclosure, {
    selected: [],
    maximum: 2,
    change: (value) => {
      toggle.textContent = t('Community topics · {0}/2 selected (required)', [
        value.length,
      ]);
    },
  });
  section.append(disclosure);
  host.append(section);
  return () => {
    const value = { nsfw: nsfw.checked, topics: topics() };
    if (!value.topics.length) disclosure.setAttribute('open', '');
    return communityCreationClassification(value);
  };
}
export function classificationSettings(
  host: HTMLElement,
  state: CommunityState,
  save: (nsfw: boolean) => Promise<void>,
): void {
  if (state.role !== 'owner' || !state.community.classification) return;
  const section = el('section', '', 'community-classification-settings');
  section.append(
    classificationBadges(state.community.classification),
    el('p', t('community.topics.fixed-hint')),
  );
  const nsfw = nsfwChoice(section, state.community.classification.nsfw);
  button(section, t('community.nsfw.save'), () => save(nsfw.checked));
  host.append(section);
}

export function rankingTopicFilter(
  host: HTMLElement,
  options: {
    active: boolean;
    selected: CommunityTopic[];
    change: (topics: CommunityTopic[]) => void;
  },
): void {
  if (!options.active) return;
  const topics = el('div', '', 'community-ranking-topics');
  host.append(topics);
  topicPicker(topics, {
    selected: options.selected,
    maximum: communityTopics.length,
    label: t('community.topics.filter'),
    change: options.change,
  });
}
