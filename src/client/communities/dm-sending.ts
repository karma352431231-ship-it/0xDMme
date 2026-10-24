import type { SocialDms } from '../social-dm/index.ts';
import type { ChosenMedia } from './dm-composer.ts';

/** Owns the stable text admission ID and the existing text/media submission
 * sequence. Encryption, durable drafts and retries stay in SocialDms. */
export class DmSending {
  private messageId: string = crypto.randomUUID();
  private readonly controller: Pick<
    SocialDms,
    'send' | 'edit' | 'stageMedia' | 'sendMedia'
  >;
  constructor(controller: DmSending['controller']) {
    this.controller = controller;
  }
  reset(): void {
    this.messageId = crypto.randomUUID();
  }
  restore(id: string): void {
    this.messageId = id;
  }
  async send(
    selected: string,
    input: {
      text: string;
      media: ChosenMedia | null;
      pending: boolean;
      editing: Parameters<SocialDms['edit']>[1] | null;
    },
  ): Promise<void> {
    const { text, media, pending, editing } = input;
    if (editing) {
      await this.controller.edit(selected, editing, text);
    } else if (media) {
      await this.controller.stageMedia(
        selected,
        media.selection,
        media.media,
        text.trim(),
      );
      await this.controller.sendMedia(selected);
    } else {
      if (pending) await this.controller.sendMedia(selected);
      if (text.trim()) {
        await this.controller.send(selected, text, this.messageId);
        this.messageId = crypto.randomUUID();
      }
    }
  }
}
