import {
  currentLanguage,
  t,
  translatedError,
} from '../../shared/i18n/index.ts';
import { accountRankingPage } from '../../shared/account-ranking/index.ts';
import type { AccountRankingEntry } from '../../shared/account-ranking/index.ts';
import type { RankingPeriod } from '../../shared/community-ranking/index.ts';
import { communityRead } from './controller.ts';
import { communityElement as el } from './elements.ts';
import { communityAvatar } from './presentation.ts';
import { showPublicAvatar } from '../public-media/index.ts';

/** Owns account paging and media; community discovery only selects this panel. */
export class AccountRankingView {
  readonly element = el('section', '', 'account-ranking');
  private readonly list = el('ol', '', 'account-ranking-list');
  private readonly status = el('p', '', 'ranking-side-status');
  private readonly more = el('button', '', 'account-ranking-more');
  private readonly periodButtons = new Map<RankingPeriod, HTMLButtonElement>();
  private period: RankingPeriod = 'day';
  private after: string | null = null;
  private generation = '';
  private busy = false;
  private offset = 0;
  private pageAfter: string | null = null;
  private pageOffset = 0;
  private pageLifetime = new AbortController();
  private epoch = 0;
  private lifetime: AbortController | null = null;
  private readonly signal: AbortSignal;
  constructor(signal: AbortSignal) {
    this.signal = signal;
    const periods = el('nav', '', 'ranking-periods');
    periods.setAttribute('aria-label', t('Período'));
    for (const [period, label] of [
      ['day', t('24 horas')],
      ['week', t('7 dias')],
      ['month', t('30 dias')],
    ] as const) {
      const button = el('button', label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(period === this.period));
      button.addEventListener('click', () => this.selectPeriod(period));
      periods.append(button);
      this.periodButtons.set(period, button);
    }
    this.status.setAttribute('role', 'status');
    this.more.type = 'button';
    this.more.textContent = t('Próxima página');
    this.more.hidden = true;
    this.more.addEventListener('click', () => {
      void this.load(true);
    });
    const restart = el(
      'button',
      t('ranking.reload'),
      'account-ranking-restart',
    );
    restart.type = 'button';
    restart.addEventListener('click', () => {
      this.resetPage();
      void this.refresh();
    });
    this.element.append(periods, this.list, this.status, this.more, restart);
    signal.addEventListener(
      'abort',
      () => {
        this.epoch++;
        this.pageLifetime.abort();
        this.lifetime?.abort();
      },
      { once: true },
    );
  }
  refresh(): Promise<void> {
    return this.load(false);
  }
  private selectPeriod(period: RankingPeriod): void {
    if (this.period === period) return;
    this.period = period;
    this.resetPage();
    for (const [value, button] of this.periodButtons)
      button.setAttribute('aria-pressed', String(value === period));
    void this.refresh();
  }
  private resetPage(): void {
    this.epoch++;
    this.after = null;
    this.generation = '';
    this.busy = false;
    this.pageLifetime.abort();
    this.pageLifetime = new AbortController();
    this.pageAfter = null;
    this.pageOffset = 0;
    this.lifetime?.abort();
    this.list.replaceChildren();
    this.offset = 0;
    this.more.hidden = true;
  }
  private async load(append: boolean): Promise<void> {
    if (this.busy || this.signal.aborted) return;
    this.busy = true;
    this.more.disabled = true;
    const epoch = this.epoch;
    try {
      const page = await this.readPage(append);
      if (!this.current(epoch)) return;
      const identity = JSON.stringify([page.generation, page.items, page.next]);
      if (!append && identity === this.generation) return;
      this.generation = identity;
      this.applyPage(page, append);
    } catch (error: unknown) {
      if (this.current(epoch)) {
        this.status.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('ranking.unavailable');
        this.after = null;
        this.more.hidden = true;
      }
    } finally {
      if (epoch === this.epoch) {
        this.busy = false;
        this.more.disabled = false;
      }
    }
  }
  private async readPage(append: boolean) {
    const query = new URLSearchParams({ period: this.period });
    const after = append ? this.after : this.pageAfter;
    if (after) query.set('after', after);
    return accountRankingPage(
      await communityRead(
        `/api/communities/accounts?${query}`,
        AbortSignal.any([
          this.signal,
          this.pageLifetime.signal,
          AbortSignal.timeout(8000),
        ]),
      ),
    );
  }
  private applyPage(
    page: ReturnType<typeof accountRankingPage>,
    append: boolean,
  ): void {
    if (append) {
      this.pageAfter = this.after;
      this.pageOffset = this.offset;
    }
    this.render(page.items);

    this.after = page.next;
    this.more.hidden = !this.after;
    this.status.textContent = this.offset ? '' : t('ranking.empty');
  }
  private current(epoch: number): boolean {
    return epoch === this.epoch && !this.signal.aborted;
  }
  private render(items: AccountRankingEntry[]): void {
    this.lifetime?.abort();
    this.lifetime = new AbortController();
    this.list.replaceChildren();
    this.offset = this.pageOffset;
    const signal = AbortSignal.any([this.signal, this.lifetime.signal]);
    for (const item of items) {
      const row = el('li'),
        link = el('a', '', 'account-ranking-row'),
        avatar = communityAvatar(item.profile.handle);
      link.href = `#users?handle=${encodeURIComponent(item.profile.handle)}`;
      avatar.classList.add('account-ranking-avatar');
      const copy = el('span', '', 'account-ranking-copy');
      copy.append(
        el('strong', `@${item.profile.handle}`),
        el('small', receivedSummary(item)),
      );
      if (!item.historyComplete)
        copy.append(
          el('small', t('ranking.partial-history'), 'ranking-partial'),
        );
      link.append(
        el('span', String(++this.offset), 'ranking-side-rank'),
        avatar,
        copy,
      );
      row.append(link);
      this.list.append(row);
      if (item.profile.avatar)
        showPublicAvatar(avatar, {
          kind: 'avatar',
          target: item.profile.id,
          reference: item.profile.avatar,
          signal,
        });
    }
  }
}
export function receivedSummary(item: {
  views: number;
  upvotes: number;
  comments: number;
  shares: number;
}): string {
  const format = new Intl.NumberFormat(currentLanguage(), {
    notation: 'compact',
  });
  return t(
    'ranking.received-summary',
    [item.views, item.upvotes, item.comments, item.shares].map((n) =>
      format.format(n),
    ),
  );
}

/** Reusable scope control; each panel keeps its own filters and resource lifetime. */
export function rankingScopes(
  host: HTMLElement,
  communities: HTMLElement,
  signal: AbortSignal,
) {
  const accounts = new AccountRankingView(signal),
    bar = el('nav', '', 'ranking-scopes');
  bar.setAttribute('aria-label', t('ranking.scope'));
  accounts.element.hidden = true;
  let active = false;
  const buttons: HTMLButtonElement[] = [];
  for (const [isAccount, label] of [
    [false, 'ranking.title'],
    [true, 'ranking.accounts'],
  ] as const) {
    const button = el('button', t(label));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(!isAccount));
    button.addEventListener('click', () => {
      active = isAccount;
      communities.hidden = active;
      accounts.element.hidden = !active;
      buttons.forEach((b, index) =>
        b.setAttribute('aria-pressed', String((index === 1) === active)),
      );
      if (active) void accounts.refresh();
    });
    buttons.push(button);
    bar.append(button);
  }
  host.append(bar, communities, accounts.element);
  return { active: () => active, refresh: () => accounts.refresh() };
}

export function mountDiscoveryRanking(
  host: HTMLElement,
  view: string,
  signal: AbortSignal,
) {
  if (view !== 'explore') return { element: host, scope: null };
  const element = el('div', '', 'ranking-community-pane');
  return { element, scope: rankingScopes(host, element, signal) };
}
