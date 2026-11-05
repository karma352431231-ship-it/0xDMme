import { t } from '../../src/shared/i18n/index.ts';
import { accountTemplate } from '../../src/client/account/template.ts';
import { WalletPicker } from '../../src/client/account/wallet-picker.ts';
import { discoverWallets } from '../../src/client/wallet/index.ts';
import {
  discoveryMenu,
  discoveryPeriods,
  feedOrders,
} from '../../src/client/communities/discovery-controls.ts';
import { mountPublicSearchToolbar } from '../../src/client/public-search/index.ts';
import { communityIcon } from '../../src/client/communities/presentation.ts';

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
function feed(): void {
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
  );
  const toolbar = page.querySelector<HTMLElement>('.community-feed-filters')!;
  page
    .querySelector('.community-more > summary')!
    .replaceChildren(communityIcon('more'));
  mountPublicSearchToolbar(toolbar, new AbortController().signal);
  if (!phone) return;
  const fields = row.querySelectorAll<HTMLElement>('a,select');
  const tops = [...fields]
    .filter((field) => field.getBoundingClientRect().width)
    .map((field) => field.getBoundingClientRect().top);
  check(
    Math.max(...tops) - Math.min(...tops) < 6,
    'All feed filters occupy one horizontal row',
  );
  row.scrollLeft = row.scrollWidth;
  const last = bounds('select[aria-label="Period"]');
  check(
    last.right <= row.getBoundingClientRect().right + 1,
    'The period remains reachable by scrolling',
  );
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
    '<article class="card public-profile-card"><div data-editor></div></article>';
  page.querySelector('[data-editor]')!.innerHTML = t('html.b1c18c8a59fa', [
    '',
    '',
  ]);
  if (!phone) return;
  for (const selector of ['.public-profile-card', '.profile-editor'])
    check(
      getComputedStyle(page.querySelector(selector)!).borderTopWidth === '0px',
      'Profile editor frame removed: ' + selector,
    );
  const card = bounds('.public-profile-card');
  const description = bounds('.profile-editor-description');
  check(
    Math.abs(card.width - description.width) < 2,
    'Description uses the available editor width',
  );
  check(
    parseFloat(
      getComputedStyle(page.querySelector('textarea')!).borderTopWidth,
    ) > 0,
    'Description retains its field boundary',
  );
}
function profile(): void {
  shell.dataset['page'] = 'publico';
  page.innerHTML =
    '<section class="public-profile-page"><header class="public-profile-header"><div class="public-profile-banner"></div><div class="public-profile-identity"><span class="public-profile-avatar">S</span><div class="public-profile-title"><h1>@synthetic_profile</h1></div></div><p class="public-profile-description">Synthetic public description</p></header><div class="public-profile-layout"><aside class="public-profile-about">Synthetic public metrics</aside><div class="public-profile-timeline"><nav class="public-profile-tabs"><button>Overview</button><button>Posts</button><button>Replies</button><button>Shared</button></nav><section class="public-profile-activity community-scope"><article class="card community-card"><h2>Synthetic post</h2><div class="post-actions"><span class="post-votes"><button>↑</button><button class="post-score">12</button></span><a class="post-action">Reply 3</a><button class="post-action">Share 4</button><button class="post-action post-save">Save</button><span class="post-action post-views">Views 5</span></div></article></section></div></div></section>';
  page
    .querySelector('.post-votes button')!
    .replaceChildren(communityIcon('up'));
  const actionNodes = page.querySelectorAll('.post-action');
  for (const [index, icon, count] of [
    [0, 'comment', '3'],
    [1, 'share', '4'],
    [2, 'bookmark', ''],
    [3, 'eye', '5'],
  ] as const) {
    actionNodes[index]!.replaceChildren(communityIcon(icon), count);
  }
  if (!phone) return;
  for (const selector of ['.public-profile-header', '.public-profile-about'])
    check(
      getComputedStyle(page.querySelector(selector)!).borderTopWidth === '0px',
      'Public profile frame removed: ' + selector,
    );
  check(
    bounds('.public-profile-banner').width >= innerWidth - 1,
    'Public profile banner uses the full phone width',
  );
  const actions = page.querySelector('.post-actions')!;
  const boxes = [...actions.children].map((child) =>
    child.getBoundingClientRect(),
  );
  check(
    Math.max(...boxes.map((box) => box.top)) -
      Math.min(...boxes.map((box) => box.top)) <
      5,
    'Profile post actions stay on one compact line',
  );
  check(
    boxes.at(-1)!.right <= actions.getBoundingClientRect().right + 1,
    'Profile post actions stay within the card',
  );
}

try {
  if (mode === 'feed') feed();
  else if (mode === 'edit') editor();
  else if (mode === 'profile') profile();
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
