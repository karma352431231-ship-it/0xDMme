// SPDX-License-Identifier: GPL-3.0-only
import {
  AccountError,
  boundedText,
  keys,
  object,
  uuid,
} from '../account/index.ts';

export const automaticPublicModeration = false;
export const publicModerationPolicy = '0xdmme-public-explicit-v2';
export type PublicModerationPolicyVersion =
  '0xdmme-public-explicit-v1' | typeof publicModerationPolicy;
export const publicModerationRetentionMs = 7 * 24 * 60 * 60 * 1_000;
export type PublicModerationKind =
  | 'avatar'
  | 'profile-banner'
  | 'community-photo'
  | 'community-banner'
  | 'post-media';
export type PublicModerationStatus =
  | 'pending'
  | 'analyzing'
  | 'approved'
  | 'rejected'
  | 'held'
  | 'failed'
  | 'discarding'
  | 'expired'
  | 'removed';
export interface PublicModerationNotice {
  id: string;
  kind: PublicModerationKind;
  target: string;
  status: PublicModerationStatus;
  createdAt: string;
  expiresAt: string;
  appeal: string | null;
  decision: string | null;
  unreviewed?: boolean;
  afterPublication?: boolean;
  warning?: boolean;
}
export function publicModerationKind(value: unknown): PublicModerationKind {
  if (
    value !== 'avatar' &&
    value !== 'profile-banner' &&
    value !== 'community-photo' &&
    value !== 'community-banner' &&
    value !== 'post-media'
  )
    throw new AccountError(400, 'Invalid analysis object.');
  return value;
}
export function publicModerationStatus(value: unknown): PublicModerationStatus {
  const statuses: readonly string[] = [
    'pending',
    'analyzing',
    'approved',
    'rejected',
    'held',
    'failed',
    'discarding',
    'expired',
    'removed',
  ];
  if (typeof value !== 'string' || !statuses.includes(value))
    throw new AccountError(400, 'Invalid analysis state.');
  return value as PublicModerationStatus;
}
function instant(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new AccountError(400, 'Invalid analysis deadline.');
  return value;
}
function optionalText(value: unknown, maximum: number): string | null {
  return value === null ? null : boundedText(value, maximum);
}
function videoNoticeFlags(
  data: Record<string, unknown>,
  kind: PublicModerationKind,
) {
  for (const field of ['afterPublication', 'warning'])
    if (data[field] !== undefined && typeof data[field] !== 'boolean')
      throw new AccountError(400, 'Invalid video notice.');
  if (
    (data['afterPublication'] === true && kind !== 'post-media') ||
    (data['warning'] === true && data['afterPublication'] !== true)
  )
    throw new AccountError(400, 'Invalid video notice.');
  return {
    ...(typeof data['afterPublication'] === 'boolean'
      ? { afterPublication: data['afterPublication'] }
      : {}),
    ...(typeof data['warning'] === 'boolean'
      ? { warning: data['warning'] }
      : {}),
  };
}
function unreviewedFlag(data: Record<string, unknown>) {
  if (data['unreviewed'] === undefined) return {};
  if (typeof data['unreviewed'] !== 'boolean')
    throw new AccountError(400, 'Invalid publication mode.');
  return { unreviewed: data['unreviewed'] };
}
export function publicModerationNotice(value: unknown): PublicModerationNotice {
  const data = object(value);
  keys(data, [
    'id',
    'kind',
    'target',
    'status',
    'createdAt',
    'expiresAt',
    'appeal',
    'decision',
    ...['afterPublication', 'warning', 'unreviewed'].filter((field) =>
      Object.hasOwn(data, field),
    ),
  ]);
  const kind = publicModerationKind(data['kind']);
  return {
    id: uuid(data['id']),
    kind,
    target: uuid(data['target']),
    status: publicModerationStatus(data['status']),
    createdAt: instant(data['createdAt']),
    expiresAt: instant(data['expiresAt']),
    appeal: optionalText(data['appeal'], 2_000),
    decision: optionalText(data['decision'], 1_000),
    ...videoNoticeFlags(data, kind),
    ...unreviewedFlag(data),
  };
}
