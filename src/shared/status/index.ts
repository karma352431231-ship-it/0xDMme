import { AccountError, uuid } from '../account/index.ts';
import { integer } from '../vault/index.ts';
export {
  statusPacket,
  statusPacketProof,
  statusEnvelope,
  statusEnvelopes,
  statusEnvelopeProof,
  statusEnvelopeHash,
  statusAudienceHead,
  verifyStatusPacket,
  verifyStatusEnvelope,
  statusRoom,
} from './protocol.ts';
export type {
  StatusPacket,
  StatusEnvelope,
  StatusRecipient,
} from './protocol.ts';

export const statusLifetime = 24 * 60 * 60 * 1000;
export const statusPageSize = 16;
export interface StatusAudiencePage {
  // Approved contacts supplied by the consent module at publication time.
  contacts: readonly string[];
  excluded: ReadonlySet<string>;
  author: string;
}

/** No audience-size product cap: enumerate approved contacts in bounded pages. */
export function statusAudiencePage(input: StatusAudiencePage): string[] {
  if (input.contacts.length > statusPageSize)
    throw new AccountError(400, 'Página de audiência excedida.');
  const author = uuid(input.author),
    contacts = input.contacts.map(uuid);
  if (new Set(contacts).size !== contacts.length || contacts.includes(author))
    throw new AccountError(400, 'Audiência de status inválida.');
  return contacts.filter((account) => !input.excluded.has(account));
}
export function statusExpiresAt(publishedAt: number): number {
  return (
    integer(publishedAt, Number.MAX_SAFE_INTEGER - statusLifetime) +
    statusLifetime
  );
}
export function statusIsActive(input: {
  publishedAt: number;
  now: number;
}): boolean {
  const now = integer(input.now, Number.MAX_SAFE_INTEGER);
  return now >= input.publishedAt && now < statusExpiresAt(input.publishedAt);
}

/** Contact/exclusion edits affect future posts; blocking remains the approved immediate access rule. */
export function statusCanRead(input: {
  viewer: string;
  author: string;
  audience: ReadonlySet<string>;
  blocked: boolean;
  publishedAt: number;
  now: number;
}): boolean {
  const viewer = uuid(input.viewer),
    author = uuid(input.author);
  if (!statusIsActive(input)) return false;
  if (viewer === author) return true;
  return !input.blocked && input.audience.has(viewer);
}
