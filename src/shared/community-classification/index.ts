import { AccountError, keys, object } from '../account/index.ts';

export const communityTopics = [
  { id: 'ai', label: 'community.topic.ai', symbol: '🤖' },
  { id: 'cat', label: 'community.topic.cat', symbol: '🐈' },
  { id: 'dog', label: 'community.topic.dog', symbol: '🐶' },
  { id: 'meme', label: 'community.topic.meme', symbol: '🏆' },
  { id: 'tech', label: 'community.topic.tech', symbol: '💻' },
  { id: 'stock', label: 'community.topic.stock', symbol: '📈' },
  { id: 'chinese', label: 'community.topic.chinese', symbol: '🇨🇳' },
  { id: 'brainrot', label: 'community.topic.brainrot', symbol: '🧠' },
  { id: 'celebrity', label: 'community.topic.celebrity', symbol: '⭐' },
  { id: 'nft', label: 'community.topic.nft', symbol: '🖼️' },
  { id: 'tiktok', label: 'community.topic.tiktok', symbol: '🎵' },
] as const;
export type CommunityTopic = (typeof communityTopics)[number]['id'];
export interface CommunityClassification {
  nsfw: boolean;
  topics: CommunityTopic[];
}
export function communityTopicSelection(
  value: unknown,
  maximum = 2,
): CommunityTopic[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new AccountError(400, 'Invalid community topics.');
  const selected = value.map((item: unknown) => {
    const topic = communityTopics.find((entry) => entry.id === item);
    if (!topic) throw new AccountError(400, 'Invalid community topics.');
    return topic.id;
  });
  if (new Set(selected).size !== selected.length)
    throw new AccountError(400, 'Invalid community topics.');
  return selected.sort();
}
export function communityClassification(
  value: unknown,
): CommunityClassification {
  if (value === undefined) return { nsfw: false, topics: [] };
  const data = object(value);
  keys(data, ['nsfw', 'topics']);
  if (typeof data['nsfw'] !== 'boolean')
    throw new AccountError(400, 'Invalid NSFW choice.');
  return {
    nsfw: data['nsfw'],
    topics: communityTopicSelection(data['topics']),
  };
}

/** New admission is stricter than decoding historical classifications or filters. */
export function communityCreationClassification(
  value: unknown,
): CommunityClassification {
  const classification = communityClassification(value);
  if (!classification.topics.length)
    throw new AccountError(400, 'Choose at least one community topic.');
  return classification;
}
