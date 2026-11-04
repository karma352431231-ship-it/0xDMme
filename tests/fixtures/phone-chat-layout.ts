import { dmConversationView } from '../../src/client/communities/dm-chat.ts';
import {
  EmojiPicker,
  emojiIntoComposer,
} from '../../src/client/emoji/index.ts';
import { startPhoneViewport } from '../../src/client/phone-viewport/index.ts';
import { pageContent } from '../../src/client/app/pages.ts';

// Uses the authored app document, compiled app stylesheet and real @ chat view.
// The native layout test drives DOM controls; it never opens an account/API.
startPhoneViewport();
const shell = document.getElementById('app-shell')!;
const page = document.getElementById('page-content')!;
shell.dataset['account'] = 'connected';
shell.dataset['page'] = 'comunidades';
page.innerHTML = pageContent('comunidades', true);
const host = page.querySelector<HTMLElement>('[data-communities]') ?? page;
const view = dmConversationView(host);
view.title.textContent = '@synthetic_peer';
view.state.textContent = 'Synthetic layout check';
view.gate.hidden = true;
view.text.disabled = false;
view.form.hidden = false;
for (let i = 0; i < 24; i++) {
  const row = document.createElement('article');
  row.className = i % 2 ? 'chat-message own' : 'chat-message';
  const text = document.createElement('p');
  text.textContent = `Synthetic message ${String(i)}`;
  row.append(text);
  view.history.append(row);
}
const picker = new EmojiPicker();
const anchor = view.form.querySelector<HTMLButtonElement>(
  '[data-public-emoji]',
)!;
anchor.addEventListener('click', () => {
  void emojiIntoComposer(picker, anchor, view.text, {
    pane: (host) => {
      host.textContent = 'Synthetic GIF layout';
    },
  });
});
const privateFrame = document.createElement('button');
privateFrame.id = 'fixture-private';
privateFrame.hidden = true;
privateFrame.addEventListener('click', () => {
  picker.close();
  shell.dataset['page'] = 'conversas';
  shell.dataset['chatOpen'] = 'true';
  view.panel.classList.remove('social-dm-panel');
  const conversation = document.createElement('div');
  conversation.className = 'conversation-content';
  conversation.append(view.panel);
  page.replaceChildren(conversation);
});
const leave = document.createElement('button');
leave.id = 'fixture-leave';
leave.hidden = true;
leave.addEventListener('click', () => {
  picker.close();
  shell.dataset['page'] = 'comunidades';
  shell.dataset['chatOpen'] = 'false';
  page.replaceChildren();
});
shell.append(privateFrame, leave);
document.body.dataset['layoutReady'] = 'true';
