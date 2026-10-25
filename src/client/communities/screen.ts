/** A mounted community page's lifetime and shell transition, without writable
 * routing, session or feature state. The shell remains its authoritative owner. */
export interface CommunityScreen {
  readonly host: HTMLElement;
  readonly signal: AbortSignal;
  readonly current: () => boolean;
  readonly present: () => void;
}
