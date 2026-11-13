import { messageGestures } from '../../src/client/message-menu/gestures.ts';
import { DmComposition } from '../../src/client/communities/dm-composition.ts';
import { withMenuIcon } from '../../src/client/menu-icons/index.ts';
import { anchoredMessageMenu } from '../../src/client/message-menu/index.ts';
import { dmConversationView } from '../../src/client/communities/dm-chat.ts';
import {
  EmojiPicker,
  emojiIntoComposer,
} from '../../src/client/emoji/index.ts';
import { GifSearch, mountGifPane } from '../../src/client/gif-search/index.ts';
import { startPhoneViewport } from '../../src/client/phone-viewport/index.ts';
import { startProfileEditor } from '../../src/client/public-profile/profile-editor.ts';
import { PublicProfiles } from '../../src/client/public-profile/controller.ts';
import { mountLanguageSettings } from '../../src/client/language/index.ts';
import { editorTemplate } from '../../src/client/contacts/template.ts';
import { t } from '../../src/shared/i18n/index.ts';

const checks: string[] = [];
function check(pass: boolean, label: string): void {
  if (!pass) throw new Error(label);
  checks.push(label);
}
function box(element: Element) {
  return element.getBoundingClientRect();
}
const report = document.createElement('pre');
report.dataset['uiChecks'] = 'running';
document.body.append(report);
try {
  startPhoneViewport();
  const shell = document.getElementById('app-shell')!;
  shell.dataset['account'] = 'connected';
  shell.dataset['page'] = 'conversas';
  shell.dataset['chatOpen'] = 'true';
  shell.dataset['chatScope'] = 'public';
  const page = document.getElementById('page-content')!;
  page.innerHTML =
    '<section class="public-chat"><div class="public-chat-body"></div></section>';
  const host = page.querySelector<HTMLElement>('.public-chat-body')!;
  const view = dmConversationView(host);
  view.title.textContent = '@synthetic_peer';
  view.state.textContent = 'Message via @';
  view.gate.textContent = '';
  view.text.disabled = false;
  view.form.hidden = false;
  if (matchMedia('(max-width:700px)').matches) {
    for (const panel of [
      view.panel,
      page.querySelector<HTMLElement>('.public-chat')!,
    ]) {
      check(
        parseFloat(getComputedStyle(panel).borderTopWidth) === 0 &&
          parseFloat(getComputedStyle(panel).borderRadius) === 0,
        'Phone handle conversation has no inner or outer card frame',
      );
    }
    check(
      Math.abs(box(view.panel).left - box(shell).left) < 1 &&
        Math.abs(box(view.panel).right - box(shell).right) < 1,
      'Handle conversation spans the phone width like the private chat',
    );
  }
  const profileBlock = withMenuIcon(document.createElement('button'), 'block');
  profileBlock.dataset['conversationAction'] = 'public-block';
  const messageBlock = withMenuIcon(document.createElement('button'), 'block');
  messageBlock.dataset['conversationAction'] = 'dm-block';
  profileBlock.textContent = messageBlock.textContent = 'Synthetic block';
  // Set labels before adding the same authored icons used by the real options renderer.
  withMenuIcon(profileBlock, 'block');
  withMenuIcon(messageBlock, 'block');
  view.options.append(profileBlock, messageBlock);
  const danger = document.createElement('span');
  danger.style.color = 'var(--danger)';
  view.options.append(danger);
  check(
    getComputedStyle(profileBlock.querySelector('svg')!).color ===
      getComputedStyle(danger).color,
    'Public profile and post block uses the danger glyph color',
  );
  check(
    getComputedStyle(messageBlock.querySelector('svg')!).color ===
      getComputedStyle(messageBlock).color,
    'Message-only block keeps its normal glyph color',
  );

  const photo = document.createElement('img');
  photo.src =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="180"><rect width="100" height="180" fill="gray"/></svg>',
    );
  view.avatar.replaceChildren(photo);
  for (let i = 0; i < 20; i++) {
    const row = document.createElement('article');
    row.className = i % 2 ? 'chat-message own' : 'chat-message';
    row.textContent = `Synthetic conversation message ${String(i)}`;
    view.history.append(row);
  }
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  check(
    getComputedStyle(view.gate).display === 'none',
    'Empty status reserves no history space',
  );
  const header = view.panel.querySelector('.chat-header')!;
  check(
    box(view.history).top - box(header).bottom < 100,
    'Message area starts below the compact header and warning',
  );
  check(
    Math.abs(box(view.avatar).width - box(view.avatar).height) < 1,
    'Handle avatar stays square even with a portrait image',
  );
  check(
    Math.abs(box(view.title).left - box(view.state).left) < 1,
    'Handle and subtitle align',
  );
  const previousWidth = view.panel.style.maxWidth;
  view.panel.style.maxWidth = '280px';
  const headerOptions = view.options.parentElement as HTMLDetailsElement;
  headerOptions.open = true;
  check(
    box(view.options).left >= box(header).left &&
      box(view.options).right <= box(header).right,
    'Header options fit inside a narrow conversation column',
  );
  headerOptions.open = false;
  view.panel.style.maxWidth = previousWidth;
  const bubble = view.history.querySelector<HTMLElement>('article')!;
  const selectionChoice = document.createElement('input');
  selectionChoice.type = 'checkbox';
  selectionChoice.className = 'message-select';
  bubble.prepend(selectionChoice);
  const expectedChoice = matchMedia(
    '(min-width: 701px) and (hover: hover) and (pointer: fine)',
  ).matches
    ? 16
    : 24;
  check(
    Math.abs(
      parseFloat(getComputedStyle(selectionChoice).width) - expectedChoice,
    ) < 0.1 &&
      Math.abs(
        parseFloat(getComputedStyle(selectionChoice).height) - expectedChoice,
      ) < 0.1,
    'Deletion marks stay compact for a mouse and retain their touch size',
  );
  selectionChoice.remove();
  const menuLifetime = new AbortController();
  const menu = anchoredMessageMenu({
    signal: menuLifetime.signal,
    row: bubble,
    reply: () => {},
  });
  const choice = document.createElement('button');
  choice.textContent = 'Synthetic action';
  menu.panel.append(choice);
  bubble.append(menu.host);
  view.text.focus({ preventScroll: true });
  bubble.dispatchEvent(
    new PointerEvent('pointerdown', {
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 1,
    }),
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 520));
  check(
    menu.panel.popover === 'manual' && menu.panel.matches(':popover-open'),
    'A held message opens a manually managed popover',
  );
  bubble.dispatchEvent(
    new PointerEvent('pointerup', {
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 1,
    }),
  );
  window.dispatchEvent(new Event('resize'));
  check(
    menu.panel.matches(':popover-open') && document.activeElement === view.text,
    'Releasing a hold preserves its menu and the existing composer focus',
  );
  document.body.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true }),
  );
  check(
    !menu.panel.matches(':popover-open'),
    'A new outside press closes the message menu',
  );
  menuLifetime.abort();
  const switching = new DmComposition();
  switching.bind(view.form, view.text, () => {});
  const touchLifetime = new AbortController();
  const replyRows = [
    ...view.history.querySelectorAll<HTMLElement>('article'),
  ].slice(0, 2);
  const originals = replyRows.map((_row, index) => ({
    type: 'dm-message' as const,
    id: crypto.randomUUID(),
    hash: 'synthetic',
    self: 'self',
    peer: { id: 'peer', handle: 'synthetic', avatar: null },
    sequence: index + 1,
    own: index === 1,
    kind: 'text' as const,
    media: null,
    text: 'Synthetic original',
    displayText: 'Synthetic original',
  }));
  replyRows.forEach((row, index) =>
    messageGestures(row, {
      signal: touchLifetime.signal,
      menu: () => {},
      reply: () => switching.reply(originals[index]!),
    }),
  );
  view.text.value = 'Unsent draft';
  for (let pass = 0; pass < 6; pass++) {
    const index = pass % 2,
      row = replyRows[index]!;
    const down = new PointerEvent('pointerdown', {
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 7,
      clientX: 10,
      clientY: 10,
      cancelable: true,
    });
    row.dispatchEvent(down);
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'touch',
        pointerId: 7,
        clientX: 70,
        clientY: 12,
      }),
    );
    row.dispatchEvent(
      new PointerEvent('pointerleave', { pointerType: 'touch', pointerId: 7 }),
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerType: 'touch',
        pointerId: 7,
        clientX: 70,
        clientY: 12,
      }),
    );
    check(
      down.defaultPrevented &&
        switching.replying?.id === originals[index]!.id &&
        document.activeElement === view.text &&
        view.text.value === 'Unsent draft',
      'Successive replies replace the target without losing composer focus or draft',
    );
  }
  touchLifetime.abort();
  switching.clear();
  view.text.value = '';
  view.text.blur();
  const picker = new EmojiPicker();
  const anchor = view.form.querySelector<HTMLButtonElement>(
    '[data-public-emoji]',
  )!;
  if (matchMedia('(max-width:700px)').matches)
    check(
      box(anchor).width >= 44 && box(anchor).height >= 44,
      'Phone emoji touch target is at least 44 by 44',
    );
  const gifs = {
    page: () => Promise.resolve({ items: [], next: false }),
  } as unknown as GifSearch;
  const opening = emojiIntoComposer(picker, anchor, view.text, {
    start: 'gif',
    pane: (pane) => mountGifPane(pane, gifs, () => {}),
  });
  await Promise.resolve();
  const query = document.querySelector<HTMLInputElement>('[data-gif-query]')!;
  const search = query.closest('label')!;
  check(
    box(query).left >= box(search).left &&
      box(query).right <= box(search).right + 1,
    'GIF search fits its field',
  );
  check(
    parseFloat(getComputedStyle(query).fontSize) >= 16,
    'GIF search prevents iPhone focus zoom',
  );
  if (matchMedia('(max-width:700px)').matches) {
    check(
      document.activeElement !== query,
      'Opening GIF does not open the phone keyboard',
    );
    check(
      getComputedStyle(document.querySelector('.mobile-nav')!).display ===
        'none',
      'Global navigation is absent in the phone conversation',
    );
  }
  if (matchMedia('(max-width:700px)').matches) {
    const dock = document.querySelector<HTMLElement>('.emoji-composer-panel')!;
    const height = box(dock).height,
      scroll = window.scrollY;
    dock.querySelector<HTMLButtonElement>('[data-close]')!.click();
    const reserved = document.querySelector<HTMLElement>(
      '.emoji-keyboard-handoff',
    )!;
    check(
      !!reserved && Math.abs(box(reserved).height - height) < 1,
      'Returning to typing retains dock space until the keyboard arrives',
    );
    check(
      document.activeElement === view.text && window.scrollY === scroll,
      'Returning to typing focuses the composer without scrolling the document',
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 650));
    check(
      !document.querySelector('.emoji-keyboard-handoff'),
      'Keyboard handoff cleans up if the keyboard does not resize',
    );
  } else picker.close();
  await opening;
  if (matchMedia('(max-width:700px)').matches) {
    const nextOpening = emojiIntoComposer(picker, anchor, view.text, {
      start: 'gif',
      pane: (pane) => mountGifPane(pane, gifs, () => {}),
    });
    await Promise.resolve();
    document.querySelector<HTMLInputElement>('[data-gif-query]')!.focus();
    const back = document.querySelector<HTMLButtonElement>(
      '.emoji-composer-panel [data-close]',
    )!;
    const press = new Event('pointerdown', { cancelable: true });
    back.dispatchEvent(press);
    check(
      press.defaultPrevented,
      'Return control preserves the existing search keyboard',
    );
    back.click();
    check(
      document.activeElement === view.text &&
        !document.querySelector('.emoji-keyboard-handoff'),
      'An existing search keyboard transfers directly without an extra layout reservation',
    );
    await nextOpening;
  }
  const warning = document.querySelector<HTMLButtonElement>('.dm-safety-close');
  warning?.click();
  check(
    !document.querySelector('.dm-safety-notice'),
    'Safety notice can be dismissed',
  );
  const settings = document.createElement('div');
  settings.className = 'profile-settings';
  page.replaceChildren(settings);
  shell.dataset['page'] = 'perfil';
  settings.innerHTML = t('html.d3072845e018');
  const own = settings.querySelector<HTMLElement>('[data-public-owned]')!;
  own.hidden = false;
  settings.querySelector<HTMLElement>('[data-public-create]')!.hidden = true;
  const controller = new PublicProfiles({
    withVault: () => Promise.reject(new Error('Synthetic UI only')),
    withLocalVault: () => Promise.reject(new Error('Synthetic UI only')),
  });
  controller.profile = {
    profile: {
      id: '11111111-1111-4111-8111-111111111111',
      handle: 'synthetic',
      avatar: null,
    },
    revision: 1,
    pendingAvatar: null,
  };
  const editor = startProfileEditor(controller, {
    run: (work) => work(),
    prepare: (work) => work(),
    changed: () => Promise.resolve(),
  });
  editor.mount(own);
  editor.paint();
  if (matchMedia('(max-width:700px)').matches)
    check(
      parseFloat(
        getComputedStyle(own.querySelector('.profile-editor')!).borderTopWidth,
      ) === 0 &&
        parseFloat(
          getComputedStyle(own.closest('.public-profile-card')!).borderTopWidth,
        ) === 0,
      'Phone public profile editor has no inner or outer card frame',
    );
  const language = document.createElement('div');
  settings.append(language);
  mountLanguageSettings(
    language,
    () => Promise.resolve(),
    () => null,
  );
  const select = language.querySelector('select')!,
    save = language.querySelector('button')!;
  check(
    box(save).top - box(select).bottom >= 10,
    'Language selection and save have a separate gap',
  );
  const editorHost = document.createElement('div');
  editorHost.innerHTML = editorTemplate;
  check(
    !!editorHost.querySelector(
      '[data-contact-editor] [data-contact-tab="editor"][data-tab="own"]',
    ),
    'Invite creation is a tab beside invitation entry',
  );
  check(
    !!editorHost.querySelector(
      '[data-contact-editor] [data-contact-own-invite]',
    ),
    'Invitation management is available without a Contacts page',
  );
  report.dataset['uiChecks'] = 'passed';
  report.textContent = checks.join('\n');
} catch (error: unknown) {
  report.dataset['uiChecks'] = 'failed';
  report.textContent =
    error instanceof Error ? error.message : 'UI fixture failed';
}
