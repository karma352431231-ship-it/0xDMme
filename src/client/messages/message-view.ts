import type { MessagePacket } from '../../shared/messages/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import type { DeliveryState } from '../message-status/index.ts';
import type { MessageItem } from './history.ts';

export interface MessageView {
  sentAt?: number;
  archived?: boolean;
  delivery?: DeliveryState;
  relation?: MessageRelation;
  sequence?: number;
  author?: string;
  kind: MessagePacket['kind'];
  id: string;
  peer: string;
  own: boolean;
  text: string;
  state: string;
  hash: string;
}
export interface ConversationProjection {
  peer: string | null;
  latest: boolean;
}
/** A committed receiver page; its views are verified and durably stored. */
export interface ReceiptCommit {
  account: string;
  /** Whether the page belongs to an append journal cut. */
  journal: boolean;
  /** The page's live change items, without recovery ranges. */
  items: readonly MessageItem[];
  views: readonly MessageView[];
  /** Retained windows that published this page themselves. */
  covered: ReadonlySet<string>;
}

/** Events emitted by verified conversation projection and receiver coverage. */
export interface MessageReaderEvents {
  verified?: (peer: string, views: MessageView[]) => void;
  stale?: () => void;
  elsewhere?: () => void;
  receipt?: (receipt: ReceiptCommit) => void;
}
