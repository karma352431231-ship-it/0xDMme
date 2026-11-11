import { t, setActiveLanguage } from '../../src/shared/i18n/index.ts';
import {
  bindChatComposer,
  chatCollapse,
  chatComposer,
  chatIcon,
  directChat,
  historyPosition,
  watchHistoryPosition,
  renderSearchReturn,
} from '../../src/client/chat-ui/index.ts';
import { dmConversationView } from '../../src/client/communities/dm-chat.ts';
import { EmojiPicker } from '../../src/client/emoji/index.ts';
import { startPhoneViewport } from '../../src/client/phone-viewport/index.ts';

// Real templates, viewport, composer and emoji dialog; synthetic messages only.
const language = new URLSearchParams(location.search).get('language');
setActiveLanguage(language === 'zh-CN' ? 'zh-CN' : 'en');
startPhoneViewport();
const shell = document.getElementById('app-shell')!;
const page = document.getElementById('page-content')!;
shell.dataset['account'] = 'connected';
shell.dataset['page'] = 'conversas';
shell.dataset['chatOpen'] = 'true';
let lifetime = new AbortController();
const picker = new EmojiPicker();
let history: HTMLElement;

function mount(scope: 'private' | 'group' | 'public'): void {
  lifetime.abort();
  lifetime = new AbortController();
  picker.close();
  const host = document.createElement('div');
  host.className = 'conversation-content';
  page.replaceChildren(host);
  if (scope === 'private') host.innerHTML = directChat();
  else if (scope === 'public') dmConversationView(host);
  else {
    const panel = document.createElement('article');
    panel.className = 'card chat-panel';
    panel.innerHTML = t('html.e652af8025ee', [
      chatIcon('back'),
      chatIcon('more'),
      chatCollapse(),
      chatComposer('group'),
    ]);
    host.append(panel);
  }
  const panel = host.querySelector<HTMLElement>('.chat-panel')!;
  panel.classList.add('active');
  panel
    .querySelectorAll<HTMLElement>(
      '.chat-welcome, .chat-feedback, .chat-gate, .compose-notice',
    )
    .forEach((node) => {
      node.hidden = true;
    });
  const form = panel.querySelector<HTMLElement>('.chat-composer')!;
  form.hidden = false;
  panel
    .querySelectorAll<HTMLInputElement | HTMLButtonElement>('textarea, button')
    .forEach((node) => {
      node.disabled = false;
    });
  bindChatComposer(form, () => {});
  history = panel.querySelector<HTMLElement>('.chat-history')!;
  history.hidden = false;
  for (let i = 0; i < 40; i++) append();
  history.scrollTop = history.scrollHeight;
  watchHistoryPosition(history, lifetime.signal);
  const reaction = document.createElement('button');
  reaction.textContent = 'React';
  reaction.dataset['fixtureReact'] = '';
  reaction.addEventListener('click', () => {
    void picker.choose(reaction);
  });
  history.lastElementChild!.append(reaction);
  history.scrollTop = history.scrollHeight;
}
function append(): void {
  const restore = historyPosition(history);
  const row = document.createElement('article');
  row.className = 'chat-message';
  const text = document.createElement('p');
  text.textContent = `Synthetic message ${String(history.childElementCount + 1)}`;
  row.append(text);
  history.append(row);
  restore();
}
Object.assign(window, {
  inputFixture: {
    mount,
    append,
    anchor: () =>
      renderSearchReturn(history, {
        active: () => true,
        latest: () => {
          renderSearchReturn(history);
          append();
        },
      }),
  },
});
mount('private');
document.body.dataset['layoutReady'] = 'true';
