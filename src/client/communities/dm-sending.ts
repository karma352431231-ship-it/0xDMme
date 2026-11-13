import { WorkInterruption } from '../synchronization-work/index.ts';
import type { DmOutgoingMedia } from './dm-outgoing-media.ts';
import { encodeDailyText } from '../../shared/daily/index.ts';
import type { SocialDms } from '../social-dm/index.ts';
import type { ChosenMedia } from './dm-composer.ts';

/** Owns the stable text admission ID and the existing text/media submission
 * sequence. Encryption, durable drafts and retries stay in SocialDms. */
export class DmSending {
  private messageId: string = crypto.randomUUID();
  private generation = 0;
  private readonly controller: Pick<
    SocialDms,
    'send' | 'stageMedia' | 'sendMedia'
  >;
  private readonly outgoing: Pick<DmOutgoingMedia, 'acceptance'> | undefined;
  constructor(
    controller: DmSending['controller'],
    outgoing?: Pick<DmOutgoingMedia, 'acceptance'>,
  ) {
    this.outgoing = outgoing;
    this.controller = controller;
  }
  reset(): void {
    this.generation++;
    this.messageId = crypto.randomUUID();
  }
  restore(id: string): void {
    this.messageId = id;
  }
  private capture(media: ChosenMedia | null) {
    const generation = this.generation;
    return {
      id: this.messageId,
      accepted: this.outgoing?.acceptance(media ? media.selection : null),
      current: () => {
        if (generation !== this.generation)
          throw new WorkInterruption('navigation');
      },
    };
  }
  async send(
    selected: string,
    input: {
      text: string;
      media: ChosenMedia | null;
      pending: boolean;
      replying?: string | null;
    },
  ): Promise<void> {
    const { text, media, pending } = input;
    const operation = this.capture(media);
    if (media) {
      await this.controller.stageMedia(
        selected,
        media.selection,
        media.media,
        input.replying
          ? encodeDailyText({
              text: text.trim(),
              reply: input.replying,
              forwarded: false,
            })
          : text.trim(),
      );
      operation.current();
      await this.controller.sendMedia(selected, operation.accepted);
    } else {
      if (pending)
        await this.controller.sendMedia(selected, operation.accepted);
      operation.current();
      if (text.trim()) {
        const payload = input.replying
          ? encodeDailyText({ text, reply: input.replying, forwarded: false })
          : text;
        await this.controller.send(selected, payload, operation.id);
        operation.current();
        this.messageId = crypto.randomUUID();
      }
    }
  }
}
