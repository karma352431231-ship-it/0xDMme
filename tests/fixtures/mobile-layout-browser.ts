import { t } from '../../src/shared/i18n/index.ts';
import { accountTemplate } from '../../src/client/account/template.ts';
import { WalletPicker } from '../../src/client/account/wallet-picker.ts';
import { discoverWallets } from '../../src/client/wallet/index.ts';
import {
  discoveryMenu,
  discoveryPeriods,
  feedOrders,
} from '../../src/client/communities/discovery-menu.ts';
import { mountPublicSearchToolbar } from '../../src/client/public-search/index.ts';
import { communityIcon } from '../../src/client/communities/presentation.ts';
import { editorTemplate } from '../../src/client/contacts/template.ts';
import { openImageViewer } from '../../src/client/image-viewer/index.ts';
import { showProfilePage } from '../../src/client/public-profile/page.ts';
import type { PublicProfiles } from '../../src/client/public-profile/controller.ts';

const shell = document.getElementById('app-shell')!;
const page = document.getElementById('page-content')!;
const mode = new URLSearchParams(location.search).get('screen');
const phone = matchMedia('(max-width:700px)').matches;
const checks: string[] = [];
const report = document.createElement('pre');
report.dataset['layoutReport'] = 'running';
document.body.append(report);

function check(pass: boolean, message: string): void {
  if (!pass) throw new Error(message);
  checks.push(message);
}
function bounds(selector: string): DOMRect {
  const target = page.querySelector(selector);
  if (!target) throw new Error('Fixture element missing: ' + selector);
  return target.getBoundingClientRect();
}
function account(): void {
  shell.dataset['page'] = mode === 'wallet' ? 'perfil' : 'conversas';
  shell.dataset['account'] = 'guest';
  const host = document.createElement('div');
  host.className = 'account-section';
  host.dataset['connected'] = 'false';
  host.innerHTML = accountTemplate;
  page.replaceChildren(host);
  const wallets = discoverWallets();
  const picker = new WalletPicker(
    { read: () => ({ mounted: host, busy: false }), request: () => {} },
    wallets,
    { visible: () => true, choose: () => {}, render: () => picker.render() },
  );
  picker.mount(host);
  if (phone)
    check(
      bounds('.account-card').left >= 15 &&
        bounds('.account-card').right <= innerWidth - 15,
      'Guest account content has phone insets on both sides',
    );
  if (mode !== 'wallet') return;
  picker.request();
  picker.render();
  check(
    !host.textContent?.includes('Detection indicates availability'),
    'The wallet chooser omits redundant detection instructions',
  );
  host
    .querySelector<HTMLButtonElement>('[data-wallet-brand="MetaMask"]')!
    .click();
  const back = bounds('[data-wallet-picker-back]');
  if (phone) {
    check(back.width < 180 && back.height <= 40, 'Change wallet stays compact');
    check(
      bounds('[data-wallet-network-title]').top - back.bottom >= 8,
      'Change wallet is separated from the selected wallet name',
    );
  }
  const hint = host.querySelector(
    '[data-wallet-mobile-instructions]',
  )!.textContent;
  check(
    hint.includes(
      new URLSearchParams(location.search).get('installed') === 'true'
        ? 'Return to this app'
        : 'Return to this browser',
    ),
    'Wallet return instructions match the installed or browser context',
  );
}
async function feed(): Promise<void> {
  shell.dataset['page'] = 'comunidades';
  page.innerHTML =
    '<div data-feed><div class="community-tools"><details class="community-more"><summary aria-label="More community options">…</summary></details></div><div class="post-toolbar community-feed-filters"><div class="community-feed-filter-row"><nav class="community-feed-scopes"><a href="#discover" aria-current="page">Discover</a><a href="#following">Following</a></nav></div></div></div>';
  const row = page.querySelector<HTMLElement>('.community-feed-filter-row')!;
  discoveryMenu(row, 'Sort', { value: 'mixed', options: feedOrders }, () => {});
  const period = document.createElement('div');
  period.className = 'community-ranking-period';
  row.append(period);
  discoveryMenu(
    period,
    'Period',
    { value: 'day', options: discoveryPeriods },
    () => {},
  ).dataset['period'] = 'true';
  const toolbar = page.querySelector<HTMLElement>('.community-feed-filters')!;
  page
    .querySelector('.community-more > summary')!
    .replaceChildren(communityIcon('more'));
  mountPublicSearchToolbar(toolbar, new AbortController().signal);
  if (!phone) return;
  const fields = [...row.querySelectorAll<HTMLElement>('a,summary')];
  const boxes = fields.map((field) => field.getBoundingClientRect());
  check(
    Math.max(...boxes.map((box) => box.top)) -
      Math.min(...boxes.map((box) => box.top)) <
      2,
    'All feed filters occupy one horizontal row',
  );
  check(
    Math.max(...boxes.map((box) => box.height)) -
      Math.min(...boxes.map((box) => box.height)) <
      1,
    'Order and period controls match the scope pills in height',
  );
  check(
    new Set(fields.map((field) => getComputedStyle(field).fontSize)).size === 1,
    'Order and period controls match the scope pills in text size',
  );
  check(
    !row.querySelector('select'),
    'Order and period use the compact menu, not a system dialog',
  );
  row.scrollLeft = row.scrollWidth;
  const last = bounds('details[data-period] > summary');
  check(
    last.right <= row.getBoundingClientRect().right + 1,
    'The period remains reachable by scrolling',
  );
  const opened = page.querySelector<HTMLDetailsElement>(
    'details[data-period]',
  )!;
  opened.querySelector('summary')!.click();
  const panel = opened
    .querySelector('.discovery-menu-options')!
    .getBoundingClientRect();
  const option = opened.querySelector('button')!.getBoundingClientRect();
  check(
    panel.height > 100 && panel.left >= 12 && panel.right <= innerWidth - 11,
    'The open period panel is whole on screen despite the scrolling row',
  );
  check(
    document.elementFromPoint(option.left + 10, option.top + 8) ===
      opened.querySelector('button'),
    'The open panel is on top and its options can be tapped',
  );
  check(option.height <= 34, 'Filter options stay compact on phones');
  await new Promise((resolve) => setTimeout(resolve, 20));
  row.dispatchEvent(new Event('scroll'));
  check(!opened.open, 'Scrolling the row closes the panel');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const search = bounds('.public-search');
  const more = bounds('.community-more > summary');
  check(
    Math.abs(search.top - more.top) < 6 && search.right + 6 <= more.left,
    'Search and community options share a row with a gap',
  );
  check(
    getComputedStyle(page.querySelector('.public-search input')!).fontSize ===
      '16px',
    'Phone search avoids small-text focus zoom',
  );
}
function editor(): void {
  shell.dataset['page'] = 'perfil';
  page.innerHTML =
    '<div class="profile-settings"><details class="settings-section" open><summary><span><strong>Public profile</strong></span></summary><div class="settings-body"><div data-public-profile-settings><article class="card public-profile-card"><div data-editor></div></article></div></div></details></div>';
  page.querySelector('[data-editor]')!.innerHTML = t('html.b1c18c8a59fa', [
    '',
    '',
  ]);
  if (!phone) return;
  for (const selector of [
    '.settings-section',
    '.public-profile-card',
    '.profile-editor',
  ])
    check(
      getComputedStyle(page.querySelector(selector)!).borderTopWidth === '0px',
      'Profile editor frame removed: ' + selector,
    );
  check(
    bounds('.profile-editor-banner').width >= innerWidth - 1,
    'Editor banner uses the full phone width',
  );
  const description = bounds('.profile-editor-description');
  check(
    description.width >= innerWidth - 1,
    'Description uses the available editor width',
  );
  check(
    parseFloat(
      getComputedStyle(page.querySelector('textarea')!).borderTopWidth,
    ) > 0,
    'Description retains its field boundary',
  );
}
function inviteDialogs(): void {
  shell.dataset['page'] = 'conversas';
  page.innerHTML = editorTemplate;
  const editorDialog = page.querySelector<HTMLDialogElement>(
    '[data-contact-editor]',
  )!;
  const invites = page.querySelector<HTMLDialogElement>(
    '[data-contact-invites]',
  )!;
  editorDialog.showModal();
  const tabs = [...editorDialog.querySelectorAll('.contact-subtabs button')];
  const tops = tabs.map((tab) => tab.getBoundingClientRect().top);
  check(
    Math.max(...tops) - Math.min(...tops) < 1,
    'The three ways to add a contact share one row',
  );
  check(
    tabs.at(-1)!.getBoundingClientRect().right <=
      editorDialog.getBoundingClientRect().right,
    'The add-contact row fits inside the dialog',
  );
  editorDialog.close();
  invites.showModal();
  invites.querySelector<HTMLElement>('[data-contact-own-invite]')!.hidden =
    false;
  const box = invites.getBoundingClientRect();
  check(box.top >= 0, 'The invitation dialog starts on the screen');
  check(box.bottom <= innerHeight, 'The invitation dialog ends on the screen');
}
async function imageViewer(): Promise<void> {
  const trigger = document.createElement('button');
  page.append(trigger);
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  canvas.getContext('2d')!.fillRect(0, 0, 1200, 800);
  openImageViewer({
    url: canvas.toDataURL(),
    alt: 'Synthetic photo',
    trigger,
    signal: new AbortController().signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const image = document.querySelector<HTMLImageElement>(
      '.public-image-frame img',
    )!,
    viewer = document.querySelector<HTMLDialogElement>('.public-image-viewer')!;
  const fit = image.getBoundingClientRect();
  const y = fit.top + fit.height / 2;
  const pointer = (name: string, id: number, x: number) =>
    image.dispatchEvent(
      new PointerEvent(name, {
        bubbles: true,
        pointerId: id,
        clientX: x,
        clientY: y,
      }),
    );
  pointer('pointerdown', 1, 150);
  pointer('pointerdown', 2, 210);
  pointer('pointermove', 1, 90);
  pointer('pointermove', 2, 270);
  check(
    viewer.classList.contains('zoomed'),
    'Two fingers moving apart zoom the image',
  );
  const zoomed = image.getBoundingClientRect();
  check(zoomed.width > fit.width * 2.5, 'The image grows with the fingers');
  pointer('pointerup', 1, 90);
  pointer('pointerup', 2, 270);
  check(
    document.body.contains(viewer) && viewer.open,
    'Ending a pinch keeps the viewer open',
  );
  pointer('pointerdown', 3, 180);
  pointer('pointermove', 3, 120);
  pointer('pointerup', 3, 120);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const panned = image.getBoundingClientRect();
  check(panned.left !== zoomed.left, 'One finger moves a zoomed image');
  check(
    panned.left <= 16 && panned.right >= innerWidth - 16,
    'A zoomed image cannot be dragged off its edge',
  );
}
const profileId = '11111111-1111-4111-8111-111111111111';
const communityId = '22222222-2222-4222-8222-222222222222';
function syntheticPost() {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    community: communityId,
    author: { id: profileId, handle: 'synthetic_profile', avatar: null },
    title: 'Synthetic post title',
    text: 'Synthetic post text',
    tags: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    editedAt: null,
    revision: 1,
    status: 'visible',
    score: 3,
    replies: 1,
    parent: null,
    root: null,
  };
}
async function profile(): Promise<void> {
  shell.dataset['page'] = 'publico';
  const summary = {
    profile: { id: profileId, handle: 'synthetic_profile', avatar: null },
    description: 'Synthetic public description',
    banner: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    conversations: 0,
    posts: 1,
    replies: 0,
    communities: 1,
    followers: 1,
  };
  window.fetch = (input) =>
    Promise.resolve(
      Response.json(
        (input instanceof Request ? input.url : input.toString()).includes(
          '/communities',
        )
          ? {
              items: [
                {
                  id: communityId,
                  name: 'Synthetic community',
                  description: '',
                  rules: '',
                  revision: 1,
                  archived: false,
                  avatar: null,
                  owner: null,
                  followers: 1,
                },
              ],
              next: null,
            }
          : summary,
      ),
    );
  const controller = {
    profile: { profile: { id: crypto.randomUUID() } },
    hasSession: () => true,
    refresh: () => Promise.resolve(),
    perform: (action: string) =>
      Promise.resolve(
        {
          'block-state': { blocked: false, revision: 0 },
          'follow-state': { following: true, revision: 1 },
          'notification-state': { enabled: false, revision: 1 },
          'mutual-followers': { items: [], total: 0, next: null },
          activity: {
            items: [
              {
                post: syntheticPost(),
                community: { id: communityId, name: 'Synthetic community' },
              },
            ],
            next: null,
          },
        }[action] ?? null,
      ),
  } as unknown as PublicProfiles;
  showProfilePage(page, 'synthetic_profile', { controller });
  await new Promise((resolve) => setTimeout(resolve, 200));
  check(
    page.querySelector('.public-profile-bar-title')?.textContent ===
      '@synthetic_profile',
    'The top bar names the profile',
  );
  check(
    !!page.querySelector('.public-profile-bar-menu .post-more'),
    'The options menu lives in the top bar',
  );
  check(
    !page.querySelector('.public-profile-metrics, .public-profile-about'),
    'The separate metrics table is gone',
  );
  check(
    page
      .querySelector('.public-profile-meta')
      ?.textContent?.startsWith('1 follower') === true,
    'One follower reads in the singular',
  );
  check(
    !!page.querySelector('.community-post-community'),
    'The first post leads with its community',
  );
  const tabs = [...page.querySelectorAll('.public-profile-tabs button')];
  check(
    tabs.map((tab) => tab.textContent).join('|') ===
      'Posts 1|Replies 0|Shared|Communities 1',
    'Tabs carry their counts',
  );
  check(
    tabs[0]?.getAttribute('aria-current') === 'true',
    'Posts is the first tab shown',
  );
  check(
    !page.querySelector('.community-post-author'),
    'Entries omit the author the page already names',
  );
  (tabs.at(-1) as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  check(
    page
      .querySelector('.profile-community-row')
      ?.textContent?.includes('Synthetic community') === true,
    'The Communities tab lists names',
  );
  check(
    page.querySelector<HTMLElement>('.public-profile-activity')?.hidden ===
      true,
    'The Communities tab replaces the activity list',
  );
  if (!phone) return;
  check(
    bounds('.public-profile-banner').width >= innerWidth - 1,
    'Public profile banner uses the full phone width',
  );
  const message = bounds('.profile-message'),
    follow = bounds('.profile-follow'),
    bell = bounds('.profile-bell');
  check(
    Math.abs(message.top - follow.top) < 1 &&
      Math.abs(follow.top - bell.top) < 1,
    'Message, Following and the bell share one row',
  );
  check(
    Math.abs(message.width - follow.width) < 2,
    'Message and Following have equal widths',
  );
}

try {
  if (mode === 'feed') await feed();
  else if (mode === 'edit') editor();
  else if (mode === 'profile') await profile();
  else if (mode === 'invite') inviteDialogs();
  else if (mode === 'viewer') await imageViewer();
  else account();
  check(
    document.documentElement.scrollWidth <= innerWidth + 1,
    'The page does not overflow horizontally',
  );
  report.dataset['layoutReport'] = 'passed';
  report.textContent = checks.join('\n');
  report.hidden = true;
} catch (error) {
  report.dataset['layoutReport'] = 'failed';
  report.textContent = checks.join('\n') + '\n' + String(error);
}
