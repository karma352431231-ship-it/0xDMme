import type { ContactAuthority } from '../database/index.ts';
import type { MessageProof } from '../../shared/messages/index.ts';
/** Domain rules run only after the dispatcher establishes signed authority. */
export type MessageAction = (
  authority: ContactAuthority,
  data: Record<string, unknown>,
  proof: MessageProof,
) => Promise<unknown>;
