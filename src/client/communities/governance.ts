import { t, currentLanguage } from '../../shared/i18n/index.ts';
import type { CommunityActions } from './actions.ts';
import { communityTargetPicker } from './target-picker.ts';
import { keys, object } from '../../shared/account/index.ts';
import {
  communityArray,
  communityCursor,
  communityReport,
  sanction,
} from '../../shared/communities/index.ts';
import type {
  CommunityState,
  Sanction,
} from '../../shared/communities/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import {
  communityButton,
  communityCard,
  communityElement,
  communityField,
  communityLink,
} from './elements.ts';
export type { CommunityActions } from './actions.ts';
/** `ownership` receives the owner's transfer/archive card; moderation gets the rest. */
export function mountCommunityGovernance(
  hosts: { container: HTMLElement; ownership: HTMLElement },
  state: CommunityState,
  actions: CommunityActions,
): void {
  const { container } = hosts;
  if (state.role !== 'participant') {
    staff(container, state, actions);
    sanctionForm(container, state, actions);
  }
  reviews(container, state, actions);
  if (state.role === 'owner') ownership(hosts.ownership, state, actions);
  if (state.transfer && state.role !== 'owner')
    accept(container, state, actions);
  if (state.sanction && !state.sanction.appeal)
    appeal(container, state, actions, state.sanction);
  reports(container, state, actions);
}
function command(state: CommunityState): Record<string, unknown> {
  return { id: state.community.id, revision: state.community.revision };
}

function staff(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  const card = communityCard(t('Moderators'));
  container.append(card);
  const list = communityElement('div');
  card.append(list);
  let after: string | null = null;
  // Loads on open: the screen is drawn inside a running operation, so this
  // read cannot wait for the shared queue.
  const load = async (): Promise<void> => {
    const data = object(
      await actions.request('staff', { id: state.community.id, after }),
    );
    keys(data, ['items', 'next']);
    list.replaceChildren();
    for (const item of communityArray(data['items']))
      list.append(staffRow(publicProfile(item), state, actions));
    if (!list.children.length)
      list.append(communityElement('p', t('No moderators.'), 'community-hint'));
    after = communityCursor(data['next']);
    more.hidden = after === null;
  };
  const more = communityButton(card, t('More moderators'), () =>
    actions.query(load),
  );
  more.hidden = true;
  void load().catch(() => {
    list.replaceChildren(
      communityElement(
        'p',
        t('Moderators currently unavailable.'),
        'community-hint',
      ),
    );
  });
  if (state.role !== 'owner') return;
  const target = communityTargetPicker(card, actions);
  communityButton(card, t('Appoint moderator'), () =>
    actions.mutate('role', {
      ...command(state),
      target: target().id,
      moderator: true,
    }),
  );
}
function staffRow(
  profile: PublicProfile,
  state: CommunityState,
  actions: CommunityActions,
): HTMLElement {
  const row = communityElement('div', '', 'community-row');
  communityLink(
    row,
    `@${profile.handle}`,
    `#users?handle=${encodeURIComponent(profile.handle)}`,
  );
  if (state.role === 'owner')
    communityButton(row, t('Remove'), () =>
      actions.mutate('role', {
        ...command(state),
        target: profile.id,
        moderator: false,
      }),
    );
  return row;
}
function sanctionForm(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  const card = communityCard(t('Suspend participant'));
  container.append(card);
  card.append(
    communityElement(
      'p',
      t(
        'The reason is visible to the participant and managers. Managers must lose their role before being sanctioned.',
      ),
    ),
  );
  const target = communityTargetPicker(card, actions),
    reason = communityField(card, t('Reason'), {
      maximum: 1000,
      multiline: true,
    });
  const label = communityElement('label', t('Duration')),
    days = communityElement('select');
  for (const [value, title] of [
    ['1', t('1 day')],
    ['7', t('7 days')],
    ['30', t('30 days')],
    ['permanent', t('Reversible ban')],
  ] as const) {
    const option = communityElement('option', title);
    option.value = value;
    days.append(option);
  }
  label.append(days);
  card.append(label);
  const record = crypto.randomUUID();
  communityButton(card, t('Apply sanction'), () =>
    actions.mutate('sanction', {
      ...command(state),
      target: target().id,
      record,
      reason: reason.value,
      days: days.value === 'permanent' ? null : Number(days.value),
    }),
  );
}
function ownership(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  const card = communityCard(t('Ownership and archiving'));
  container.append(card);
  card.append(
    communityElement(
      'p',
      t(
        'The recipient must accept the transfer. After acceptance, you become a participant and lose management access.',
      ),
    ),
  );
  const target = communityTargetPicker(card, actions);
  communityButton(card, t('Offer transfer'), () =>
    actions.mutate('transfer-offer', {
      ...command(state),
      target: target().id,
    }),
  );
  if (state.transfer) {
    card.append(
      communityElement(
        'p',
        t('Transfer awaiting @{0}.', [state.transfer.target.handle]),
      ),
    );
    communityButton(card, t('Cancel transfer'), () =>
      actions.mutate('transfer-offer', { ...command(state), target: null }),
    );
  }
  const label = communityElement('label'),
    confirm = communityElement('input');
  confirm.type = 'checkbox';
  label.append(
    confirm,
    document.createTextNode(
      state.community.archived
        ? t('I want to reopen participation.')
        : t('I want to archive, preserving content and records.'),
    ),
  );
  card.append(label);
  communityButton(
    card,
    state.community.archived ? t('Reopen community') : t('Archive community'),
    async () => {
      if (!confirm.checked) throw new Error('Confirm the membership change.');
      await actions.mutate('archive', {
        ...command(state),
        archived: !state.community.archived,
      });
    },
  );
}
function accept(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  const transfer = state.transfer;
  if (!transfer) return;
  const card = communityCard(t('Transfer to you'));
  container.append(card);
  card.append(
    communityElement(
      'p',
      t(
        'By accepting, you take ownership and management of this community. Check its rules and current owner.',
      ),
    ),
  );
  communityButton(card, t('Accept ownership'), () =>
    actions.mutate('transfer-accept', {
      ...command(state),
      offer: transfer.id,
    }),
  );
}
function appeal(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
  current: Sanction,
): void {
  const card = communityCard(t('Appeal sanction'));
  container.append(card);
  const text = communityField(card, t('Your appeal'), {
    maximum: 2000,
    multiline: true,
  });
  card.append(
    communityElement('p', t('One appeal per sanction, visible to managers.')),
  );
  communityButton(card, t('Submit appeal'), () =>
    actions.mutate('appeal', {
      id: state.community.id,
      record: current.id,
      text: text.value,
    }),
  );
}
function reviews(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  const card = communityCard(t('Sanctions and appeals'));
  container.append(card);
  const list = communityElement('div');
  card.append(list);
  let after: string | null = null;
  communityButton(card, t('Load sanctions'), () =>
    actions.query(async () => {
      const data = object(
        await actions.request('sanctions', { id: state.community.id, after }),
      );
      keys(data, ['items', 'next']);
      list.replaceChildren();
      for (const item of communityArray(data['items'])) {
        const record = sanction(item),
          row = communityElement('section');
        row.append(
          communityElement(
            'h3',
            record.target ? `@${record.target.handle}` : t('Removed profile'),
          ),
          communityElement('p', record.reason),
        );
        row.append(
          communityElement(
            'p',
            record.lifted
              ? t('Sanction lifted')
              : record.until
                ? t('Until {0}', [
                    new Date(record.until).toLocaleString(currentLanguage()),
                  ])
                : t('Reversible ban'),
          ),
        );
        if (record.appeal)
          row.append(communityElement('p', t('Appeal: {0}', [record.appeal])));
        if (record.decision)
          row.append(communityElement('p', t('Reply: {0}', [record.decision])));
        recordActions(row, state, actions, record);
        list.append(row);
      }
      after = communityCursor(data['next']);
    }),
  );
}
function recordActions(
  row: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
  record: Sanction,
): void {
  if (record.lifted) return;
  if (state.role !== 'participant') {
    reviewButtons(row, {
      state,
      actions,
      record: record.id,
      appeal: Boolean(record.appeal) && !record.decision,
    });
    return;
  }
  if (!record.appeal && record.id !== state.sanction?.id)
    appeal(row, state, actions, record);
}
function reviewButtons(
  row: HTMLElement,
  input: {
    state: CommunityState;
    actions: CommunityActions;
    record: string;
    appeal: boolean;
  },
): void {
  const decision = communityField(row, t('Response / review reason'), {
    maximum: 1000,
    multiline: true,
  });
  const data = () => ({
    ...command(input.state),
    record: input.record,
    decision: decision.value,
  });
  communityButton(row, t('Lift sanction'), () =>
    input.actions.mutate('decide-sanction', { ...data(), lift: true }),
  );
  if (input.appeal)
    communityButton(row, t('Keep sanction and respond'), () =>
      input.actions.mutate('decide-sanction', { ...data(), lift: false }),
    );
}
function reports(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  const card = communityCard(t('Community reports'));
  container.append(card);
  card.append(
    communityElement(
      'p',
      t(
        'Community managers review the local report. Your identity is not shown in the response delivered to them. You can track the review below.',
      ),
    ),
  );
  const reason = communityField(card, t('Report reason'), {
      maximum: 1000,
      multiline: true,
    }),
    record = crypto.randomUUID();
  communityButton(card, t('Submit report'), () =>
    actions.mutate('report', {
      id: state.community.id,
      record,
      reason: reason.value,
    }),
  );
  const list = communityElement('div');
  card.append(list);
  reportListButton(card, list, { state, actions, own: true });
  if (state.role !== 'participant')
    reportListButton(card, list, { state, actions, own: false });
}
function reportListButton(
  card: HTMLElement,
  list: HTMLElement,
  input: { state: CommunityState; actions: CommunityActions; own: boolean },
): void {
  let after: string | null = null;
  communityButton(
    card,
    input.own ? t('Load my reports') : t('Load received reports'),
    () =>
      input.actions.query(async () => {
        const data = object(
          await input.actions.request('reports', {
            id: input.state.community.id,
            after,
            own: input.own,
          }),
        );
        keys(data, ['items', 'next']);
        list.replaceChildren();
        for (const item of communityArray(data['items'])) {
          const report = communityReport(item),
            row = communityElement('section');
          row.append(
            communityElement('p', report.reason),
            communityElement(
              'p',
              report.resolved
                ? t('Ended: {0}', [report.decision ?? ''])
                : t('Awaiting analysis'),
            ),
          );
          if (!input.own && !report.resolved) {
            const decision = communityField(row, t('Reply'), {
              maximum: 1000,
              multiline: true,
            });
            communityButton(row, t('Close report'), () =>
              input.actions.mutate('resolve-report', {
                ...command(input.state),
                record: report.id,
                decision: decision.value,
              }),
            );
          }
          list.append(row);
        }
        after = communityCursor(data['next']);
      }),
  );
}
