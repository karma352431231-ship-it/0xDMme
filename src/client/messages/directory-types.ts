import type { ConversationPreview } from '../conversation-preview/index.ts';
import type { MenuIconName } from '../menu-icons/index.ts';

export interface DirectoryMenu {
  update: (entries: readonly ConversationEntry[]) => void;
  bind: (
    row: HTMLElement,
    entry: ConversationEntry,
    trigger: HTMLButtonElement,
  ) => void;
}
export type ConversationFilter =
  'all' | 'unread' | 'favorites' | 'groups' | 'archived';
export interface ConversationAction {
  id: string;
  label: string;
  icon?: MenuIconName;
  perform: () => void;
  choices?: readonly ConversationAction[];
}
export interface ConversationEntry {
  id: string;
  title: string;
  detail: string;
  kind: 'contact' | 'group';
  /** Wallet seed keeps the avatar tone aligned with Contacts. */
  seed?: string;
  avatar?: (host: HTMLElement, signal: AbortSignal) => void;
  /** A versioned avatar owns one observer until its version or row changes. */
  avatarVersion?: string;
  status?: boolean;
  searchText: string;
  selected: boolean;
  open: () => void;
  archived?: boolean;
  pinned?: boolean;
  favorite?: boolean;
  unread?: number;
  hidden?: boolean;
  actions?: readonly ConversationAction[];
  menuNote?: string;
  preview?: ConversationPreview;
}
