import type { ConversationProjection, MessageView } from './controller.ts';

/** The selected latest verified window supplies its own preview. Keep this
 * eligibility separate from list lifetime, so older pages and offline windows
 * cannot suppress an online latest-preview read. No message content is held. */
export class SelectedPreviewAdmission {
  private peer: string | null = null;
  observe(input: {
    rows: readonly MessageView[] | null;
    projection: ConversationProjection | undefined;
    online: boolean;
    localOnly: boolean;
  }): void {
    this.peer =
      input.rows && input.projection?.latest && input.online && !input.localOnly
        ? input.projection.peer
        : null;
  }
  exclude(selected: string | null, visible: boolean): readonly string[] {
    return visible && selected && selected === this.peer ? [selected] : [];
  }
}
