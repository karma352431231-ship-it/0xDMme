import type { MenuIconName } from '../menu-icons/index.ts';
export interface ConversationAction {
  id: string;
  label: string;
  icon?: MenuIconName;
  perform: () => void;
  choices?: readonly ConversationAction[];
}
export interface ConversationMenuEntry {
  id: string;
  kind: string;
  title: string;
  hidden?: boolean;
  actions?: readonly ConversationAction[];
  menuNote?: string;
}
