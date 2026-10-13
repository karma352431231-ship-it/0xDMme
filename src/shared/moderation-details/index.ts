import {
  AccountError,
  keys,
  object,
  uuid,
  boundedText,
} from '../account/index.ts';
import { communityMentionText } from '../communities/index.ts';
import {
  publicModerationNotice,
  publicModerationPolicy,
} from '../public-moderation/index.ts';
import type {
  PublicModerationNotice,
  PublicModerationPolicyVersion,
} from '../public-moderation/index.ts';

export interface ModeratedPostContext {
  id: string;
  community: string;
  communityName: string;
  title: string;
  text: string;
  reply: boolean;
  deleted: boolean;
}
export interface PublicModerationDetails {
  notice: PublicModerationNotice;
  policy: PublicModerationPolicyVersion;
  automaticVerdict: 'allow' | 'reject' | 'hold' | null;
  frames: number | null;
  post: ModeratedPostContext | null;
}
function context(value: unknown): ModeratedPostContext | null {
  if (value === null) return null;
  const data = object(value);
  keys(data, [
    'id',
    'community',
    'communityName',
    'title',
    'text',
    'reply',
    'deleted',
  ]);
  if (
    typeof data['reply'] !== 'boolean' ||
    typeof data['deleted'] !== 'boolean'
  )
    throw new AccountError(400, 'Contexto de análise inválido.');
  return {
    id: uuid(data['id']),
    community: uuid(data['community']),
    communityName: boundedText(data['communityName'], 100),
    title: communityMentionText(data['title'], 200, true),
    text: communityMentionText(data['text'], 4000, true),
    reply: data['reply'],
    deleted: data['deleted'],
  };
}
function policy(value: unknown): PublicModerationPolicyVersion {
  if (value !== publicModerationPolicy && value !== '0xdmme-public-explicit-v1')
    throw new AccountError(400, 'Política de análise inválida.');
  return value;
}
function automaticVerdict(
  value: unknown,
): PublicModerationDetails['automaticVerdict'] {
  if (
    value !== null &&
    value !== 'allow' &&
    value !== 'reject' &&
    value !== 'hold'
  )
    throw new AccountError(400, 'Resultado de análise inválido.');
  return value;
}
function frames(value: unknown): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 60001
  )
    throw new AccountError(400, 'Quantidade de quadros inválida.');
  return value;
}
export function publicModerationDetails(
  value: unknown,
): PublicModerationDetails {
  const data = object(value);
  keys(data, ['notice', 'policy', 'automaticVerdict', 'frames', 'post']);
  return {
    notice: publicModerationNotice(data['notice']),
    policy: policy(data['policy']),
    automaticVerdict: automaticVerdict(data['automaticVerdict']),
    frames: frames(data['frames']),
    post: context(data['post']),
  };
}
