import type { ConversationEntry } from './directory-types.ts';
export interface SearchItem {
  id: string;
  peer: string;
  sequence: number;
  excerpt: string;
  sentAt?: number;
}
export interface SearchPage {
  items: SearchItem[];
  next: string | null;
  entries?: readonly ConversationEntry[];
}
