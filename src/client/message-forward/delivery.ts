import { encodeDailyText } from '../../shared/daily/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';
/** The source grants reading capability; the destination grants only staging. */
export async function stageForwardedMessage(input: {
  view: DailyView<DailyRow>;
  encode?: (content: import('../../shared/daily/index.ts').DailyText) => string;
  load: (thumbnail: boolean) => Promise<Uint8Array<ArrayBuffer>>;
  destination: {
    text: (value: string) => Promise<void>;
    attachment: (
      selection: AttachmentSelection,
      caption: string,
    ) => Promise<void>;
  };
}): Promise<void> {
  const { view, destination, load } = input;
  if (view.content.viewOnce)
    throw new Error('View-once content cannot be forwarded.');
  const text = (input.encode ?? encodeDailyText)({
    ...view.content,
    reply: null,
    forwarded: true,
  });
  if (view.kind === 'text') {
    await destination.text(text);
    return;
  }
  if (view.kind !== 'attachment') return;
  const content = attachmentContent(JSON.parse(view.text) as unknown),
    bytes = await load(false);
  let thumbnail: Uint8Array<ArrayBuffer> | null = null;
  try {
    if (content.thumbnail) thumbnail = await load(true);
    await destination.attachment(
      {
        name: content.name,
        type: content.type,
        image: content.image,
        ...(content.voice ? { voice: content.voice } : {}),
        bytes,
        thumbnail,
      },
      text,
    );
  } finally {
    bytes.fill(0);
    thumbnail?.fill(0);
  }
}
