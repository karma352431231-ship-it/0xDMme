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
  const card = communityCard(t('Moderadores'));
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
      list.append(
        communityElement('p', t('Nenhum moderador.'), 'community-hint'),
      );
    after = communityCursor(data['next']);
    more.hidden = after === null;
  };
  const more = communityButton(card, t('Mais moderadores'), () =>
    actions.query(load),
  );
  more.hidden = true;
  void load().catch(() => {
    list.replaceChildren(
      communityElement(
        'p',
        t('Moderadores indisponíveis agora.'),
        'community-hint',
      ),
    );
  });
  if (state.role !== 'owner') return;
  const target = communityTargetPicker(card, actions);
  communityButton(card, t('Nomear moderador'), () =>
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
    `#publico?handle=${encodeURIComponent(profile.handle)}`,
  );
  if (state.role === 'owner')
    communityButton(row, t('Remover'), () =>
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
  const card = communityCard(t('Suspender participante'));
  container.append(card);
  card.append(
    communityElement(
      'p',
      t(
        'O motivo será visível ao participante e aos gestores. Gestores devem perder a função antes de serem sancionados.',
      ),
    ),
  );
  const target = communityTargetPicker(card, actions),
    reason = communityField(card, t('Motivo'), {
      maximum: 1000,
      multiline: true,
    });
  const label = communityElement('label', t('Duração')),
    days = communityElement('select');
  for (const [value, title] of [
    ['1', t('1 dia')],
    ['7', t('7 dias')],
    ['30', t('30 dias')],
    ['permanent', t('Banimento reversível')],
  ] as const) {
    const option = communityElement('option', title);
    option.value = value;
    days.append(option);
  }
  label.append(days);
  card.append(label);
  const record = crypto.randomUUID();
  communityButton(card, t('Aplicar sanção'), () =>
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
  const card = communityCard(t('Propriedade e arquivamento'));
  container.append(card);
  card.append(
    communityElement(
      'p',
      t(
        'A transferência depende do aceite do destinatário. Depois do aceite, você passa a participante e perde a gestão.',
      ),
    ),
  );
  const target = communityTargetPicker(card, actions);
  communityButton(card, t('Oferecer transferência'), () =>
    actions.mutate('transfer-offer', {
      ...command(state),
      target: target().id,
    }),
  );
  if (state.transfer) {
    card.append(
      communityElement(
        'p',
        t('Transferência aguardando @{0}.', [state.transfer.target.handle]),
      ),
    );
    communityButton(card, t('Cancelar transferência'), () =>
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
        ? t('Quero reabrir a participação.')
        : t('Quero arquivar, preservando conteúdo e registros.'),
    ),
  );
  card.append(label);
  communityButton(
    card,
    state.community.archived
      ? t('Reabrir comunidade')
      : t('Arquivar comunidade'),
    async () => {
      if (!confirm.checked)
        throw new Error('Confirme a alteração de participação.');
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
  const card = communityCard(t('Transferência para você'));
  container.append(card);
  card.append(
    communityElement(
      'p',
      t(
        'Ao aceitar, você assume a propriedade e a gestão desta comunidade. Confira as regras e o proprietário atual.',
      ),
    ),
  );
  communityButton(card, t('Aceitar propriedade'), () =>
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
  const card = communityCard(t('Contestar sanção'));
  container.append(card);
  const text = communityField(card, t('Sua contestação'), {
    maximum: 2000,
    multiline: true,
  });
  card.append(
    communityElement(
      'p',
      t('Uma contestação por sanção, visível aos gestores.'),
    ),
  );
  communityButton(card, t('Enviar contestação'), () =>
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
  const card = communityCard(t('Sanções e contestações'));
  container.append(card);
  const list = communityElement('div');
  card.append(list);
  let after: string | null = null;
  communityButton(card, t('Carregar sanções'), () =>
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
            record.target ? `@${record.target.handle}` : t('Perfil removido'),
          ),
          communityElement('p', record.reason),
        );
        row.append(
          communityElement(
            'p',
            record.lifted
              ? t('Sanção retirada')
              : record.until
                ? t('Até {0}', [
                    new Date(record.until).toLocaleString(currentLanguage()),
                  ])
                : t('Banimento reversível'),
          ),
        );
        if (record.appeal)
          row.append(
            communityElement('p', t('Contestação: {0}', [record.appeal])),
          );
        if (record.decision)
          row.append(
            communityElement('p', t('Resposta: {0}', [record.decision])),
          );
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
  const decision = communityField(row, t('Resposta / motivo da revisão'), {
    maximum: 1000,
    multiline: true,
  });
  const data = () => ({
    ...command(input.state),
    record: input.record,
    decision: decision.value,
  });
  communityButton(row, t('Retirar sanção'), () =>
    input.actions.mutate('decide-sanction', { ...data(), lift: true }),
  );
  if (input.appeal)
    communityButton(row, t('Manter sanção e responder'), () =>
      input.actions.mutate('decide-sanction', { ...data(), lift: false }),
    );
}
function reports(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  const card = communityCard(t('Denúncias da comunidade'));
  container.append(card);
  card.append(
    communityElement(
      'p',
      t(
        'A denúncia local é analisada pelos gestores. Sua identidade não aparece na resposta entregue a eles. Você pode acompanhar a análise abaixo.',
      ),
    ),
  );
  const reason = communityField(card, t('Motivo da denúncia'), {
      maximum: 1000,
      multiline: true,
    }),
    record = crypto.randomUUID();
  communityButton(card, t('Enviar denúncia'), () =>
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
    input.own
      ? t('Carregar minhas denúncias')
      : t('Carregar denúncias recebidas'),
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
                ? t('Encerrada: {0}', [report.decision ?? ''])
                : t('Aguardando análise'),
            ),
          );
          if (!input.own && !report.resolved) {
            const decision = communityField(row, t('Resposta'), {
              maximum: 1000,
              multiline: true,
            });
            communityButton(row, t('Encerrar denúncia'), () =>
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
