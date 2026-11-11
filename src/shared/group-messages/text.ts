import { encodeDailyText, decodeDailyText } from '../daily/index.ts';
import type { DailyText } from '../daily/index.ts';
/** Existing group plaintext budget, before the authenticated encryption envelope. */
export const groupTextBytes = 3_000_000;
export function encodeGroupText(content: DailyText): string {
  return encodeDailyText(content, groupTextBytes);
}
export function decodeGroupText(text: string): DailyText {
  return decodeDailyText(text, groupTextBytes);
}
