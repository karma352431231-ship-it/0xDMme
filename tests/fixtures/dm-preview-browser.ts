import { conversationButton } from '../../src/client/messages/directory.ts';
import { dmDirectoryRow } from '../../src/client/communities/dm-directory.ts';
import {
  dmConversationView,
  dmBubble,
} from '../../src/client/communities/dm-chat.ts';
import { startDmComposer } from '../../src/client/communities/dm-composer.ts';
import {
  conversationPreview,
  paintConversationPreview,
} from '../../src/client/conversation-preview/index.ts';
import { setActiveLanguage } from '../../src/shared/i18n/index.ts';
import type { ExternalMediaConsent } from '../../src/client/external-media/index.ts';
import { VoicePlayback } from '../../src/client/voice-playback/index.ts';

setActiveLanguage(
  new URL(location.href).searchParams.get('lang') === 'zh-CN' ? 'zh-CN' : 'en',
);
const root = document.querySelector<HTMLElement>('[data-fixture]')!;
const lifetime = new AbortController();
const privacy = {
  authorize: () => Promise.resolve(false),
  signal: lifetime.signal,
} as unknown as ExternalMediaConsent;
const directory = document.createElement('section'),
  chat = document.createElement('section');
directory.className = 'fixture-directory';
root.append(directory, chat);
const own = crypto.randomUUID();
for (const kind of ['private', 'public']) {
  const title = document.createElement('h2');
  title.textContent = kind;
  directory.append(title);
  for (let i = 0; i < 3; i++) {
    const id = crypto.randomUUID();
    const preview = conversationPreview({
      id: crypto.randomUUID(),
      sequence: i + 1,
      kind: 'text',
      text: 'Latest message',
      displayText: i === 1 ? 'Latest received message' : 'Latest sent message',
      own: i !== 1,
      sentAt: new Date(2026, 9, 15, 13, 4 + i).getTime(),
      delivery: i === 2 ? 'accepted' : 'received',
      read: i === 0,
    });
    const row =
      kind === 'private'
        ? conversationButton({
            id,
            title: `Synthetic ${i + 1}`,
            detail: '',
            kind: 'contact',
            searchText: '',
            selected: false,
            open: () => {},
            preview,
          })
        : dmDirectoryRow({
            peer: { id, handle: `synthetic${i + 1}`, avatar: null },
            requester: own,
            state: 'approved',
            revision: 1,
            blocked: false,
            blockRevision: 0,
            canSend: true,
          });
    if (kind === 'public')
      paintConversationPreview(
        row.querySelector<HTMLElement>('.conversation-copy')!,
        preview,
      );
    directory.append(row);
  }
}
const view = dmConversationView(chat),
  peer = { id: crypto.randomUUID(), handle: 'synthetic', avatar: null };
view.title.textContent = '@synthetic';
view.state.textContent = 'Message via @';
const composer = startDmComposer({
  playback: new VoicePlayback(),
  privacy,
  run: (work) => work(),
  submit: () => Promise.resolve(),
  discardPending: () => Promise.resolve(),
  changed: () => {},
});
composer.bind(view, peer.id);
composer.update({ writable: true, pending: false, busy: false });
const message = {
  type: 'dm-message' as const,
  id: crypto.randomUUID(),
  hash: 'a'.repeat(64),
  self: own,
  peer,
  sequence: 1,
  own: true,
  kind: 'text' as const,
  media: null,
  text: 'Original text',
  displayText: 'Original text',
  sentAt: new Date(2026, 9, 15, 13, 4).getTime(),
};
const bubble = dmBubble(message, {
  own: true,
  handle: peer.handle,
  privacy,
  signal: lifetime.signal,
});
view.history.append(bubble.row);
composer.edit(message);
document.documentElement.dataset['fixtureReady'] = 'true';
window.addEventListener(
  'pagehide',
  () => {
    lifetime.abort();
    composer.leave();
    bubble.stop();
  },
  { once: true },
);
