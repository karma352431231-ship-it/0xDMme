import { t } from '../../src/shared/i18n/index.ts';
import { startProfileEditor } from '../../src/client/public-profile/profile-editor.ts';
import { PublicProfiles } from '../../src/client/public-profile/controller.ts';
import {
  EmojiPicker,
  emojiIntoComposer,
} from '../../src/client/emoji/index.ts';
import { chatComposer } from '../../src/client/chat-ui/index.ts';

const root = document.querySelector<HTMLElement>('[data-fixture]');
if (!root) throw new Error('UI fixture is missing.');
const access = {
  withVault: () =>
    Promise.reject(new Error('No account access in this UI fixture.')),
  withLocalVault: () =>
    Promise.reject(new Error('No account access in this UI fixture.')),
};
const controller = new PublicProfiles(access);
controller.profile = {
  profile: {
    id: '11111111-1111-4111-8111-111111111111',
    handle: 'synthetic_ui',
    avatar: null,
  },
  revision: 1,
  pendingAvatar: null,
};
let description = 'Synthetic profile';
controller.perform = (operation, payload) => {
  if (operation === 'banner-state')
    return Promise.resolve({ revision: 0, banner: null });
  if (operation === 'description-state')
    return Promise.resolve({ revision: 1, description });
  if (operation === 'description') {
    description = String(payload['description']);
    return Promise.resolve({ revision: 2, description });
  }
  return Promise.reject(new Error('Unexpected UI fixture operation.'));
};
root.innerHTML = `<section data-profile-fixture>${t('html.d3072845e018')}</section><div id="app-shell" class="ui-chat-fixture"><article class="card chat-panel"><header class="chat-header"><h2>Synthetic conversation</h2></header><div class="chat-conversation"><section class="chat-thread"><div class="chat-history"><p>Synthetic older message</p><p>Synthetic newer message</p></div></section>${chatComposer('public')}</div></article></div><pre data-checks role="status">Preparing checks</pre>`;
const owned = root.querySelector<HTMLElement>('[data-public-owned]')!;
owned.hidden = false;
root.querySelector<HTMLElement>('[data-public-create]')!.hidden = true;
const editor = startProfileEditor(controller, {
  run: (work) => work(),
  prepare: (work) => work(),
  changed: () => Promise.resolve(),
});
editor.mount(owned);
editor.paint();
await editor.refresh();
const input = root.querySelector<HTMLTextAreaElement>(
  '.chat-composer textarea',
)!;
const anchor =
  root.querySelector<HTMLButtonElement>('[data-public-emoji]') ??
  document.createElement('button');
if (!anchor.isConnected) {
  anchor.type = 'button';
  anchor.textContent = 'Emoji';
  input.before(anchor);
}
const picker = new EmojiPicker();
anchor.addEventListener('click', () => {
  void emojiIntoComposer(picker, anchor, input, {
    pane: (host, close) => {
      host.textContent = 'Synthetic GIF pane';
      const done = document.createElement('button');
      done.type = 'button';
      done.textContent = 'Close synthetic GIF pane';
      done.addEventListener('click', close);
      host.append(done);
    },
  });
});
const report = root.querySelector<HTMLElement>('[data-checks]')!;
const checks: string[] = [];
function check(value: boolean, message: string): void {
  if (!value) throw new Error(message);
  checks.push(message);
}
const field = owned.querySelector<HTMLTextAreaElement>(
  '[data-public-description]',
)!;
const confirm = owned.querySelector<HTMLButtonElement>(
  '[data-confirm-profile]',
)!;
check(confirm.hidden === true, 'Unchanged profile hides confirmation');
field.value = 'Edited synthetic profile';
field.dispatchEvent(new Event('input', { bubbles: true }));
check(!confirm.hidden, 'Actual description edit reveals confirmation');
field.value = description;
field.dispatchEvent(new Event('input', { bubbles: true }));
check(confirm.hidden === true, 'Reverting the description hides confirmation');
check(
  !root.querySelector('[data-public-action="external-media"]'),
  'Public editor has no external-media control',
);
if (matchMedia('(max-width: 700px)').matches) {
  const history = root.querySelector<HTMLElement>('.chat-history')!;
  const before = history.getBoundingClientRect().height;
  input.value = 'AB';
  input.setSelectionRange(1, 1);
  input.focus();
  anchor.click();
  const dock = root.querySelector<HTMLElement>('.emoji-composer-panel')!;
  check(
    !!dock && !document.querySelector('dialog[open]'),
    'Mobile composer uses a dock instead of a modal overlay',
  );
  check(
    document.activeElement !== dock.querySelector('[data-query]'),
    'Opening emoji does not focus search or call the keyboard',
  );
  check(
    history.getBoundingClientRect().height < before,
    'Conversation shrinks while the emoji dock is open',
  );
  const choice = dock.querySelector<HTMLButtonElement>('[data-grid] button')!;
  check(!!choice, 'The real emoji catalog is rendered');
  choice.click();
  choice.click();
  check(
    input.value.startsWith('A') &&
      input.value.endsWith('B') &&
      input.value.length > 2,
    'Multiple emoji insert at the caret without losing the draft',
  );
  check(dock.isConnected, 'Choosing emoji keeps the dock open');
  dock.querySelector<HTMLButtonElement>('[data-close]')!.click();
  check(
    !root.querySelector('.emoji-composer-panel') &&
      document.activeElement === input,
    'Arrow restores normal typing and closes the dock',
  );
  anchor.click();
  check(
    !root.querySelector<HTMLElement>('[data-recent-section]')!.hidden,
    'Recent emoji appear when the picker reopens',
  );
  input.disabled = true;
  await Promise.resolve();
  check(
    !root.querySelector('.emoji-composer-panel'),
    'Disabling the composer closes the panel',
  );
  input.disabled = false;
  anchor.click();
  const reopened = root.querySelector<HTMLElement>('.emoji-composer-panel')!;
  reopened.querySelector<HTMLButtonElement>('[data-mode="gif"]')!.click();
  check(
    reopened.querySelector<HTMLButtonElement>('[data-close]')!.offsetHeight > 0,
    'Return arrow remains visible in the GIF tab',
  );
  picker.close();
  check(
    !root.querySelector('.emoji-composer-panel'),
    'Conversation cleanup disposes the dock',
  );
}
report.textContent = checks.join('\n');
report.dataset['passed'] = String(checks.length);
