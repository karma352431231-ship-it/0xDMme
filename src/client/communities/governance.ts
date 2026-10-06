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
import {
  publicHandle,
  publicProfile,
} from '../../shared/public-profile/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import {
  communityButton,
  communityCard,
  communityElement,
  communityField,
  communityLink,
} from './elements.ts';
export interface CommunityActions {
  mutate: (operation: string, data: Record<string, unknown>) => Promise<void>;
  query: (work: () => Promise<void>) => Promise<void>;
  request: (
    operation: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
}
export function mountCommunityGovernance(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  if (state.role !== 'participant') {
    staff(container, state, actions);
    sanctionForm(container, state, actions);
  }
  reviews(container, state, actions);
  if (state.role === 'owner') ownership(container, state, actions);
  if (state.transfer && state.role !== 'owner')
    accept(container, state, actions);
  if (state.sanction && !state.sanction.appeal)
    appeal(container, state, actions, state.sanction);
  reports(container, state, actions);
}
function command(state: CommunityState): Record<string, unknown> {
  return { id: state.community.id, revision: state.community.revision };
}
function targetPicker(
  container: HTMLElement,
  actions: CommunityActions,
): () => PublicProfile {
  const handle = communityField(container, '@ do perfil público', {
    maximum: 31,
  });
  const result = communityElement('p');
  container.append(result);
  let selected: PublicProfile | null = null;
  handle.addEventListener('input', () => {
    selected = null;
    result.textContent = '';
  });
  communityButton(container, 'Buscar perfil', () =>
    actions.query(async () => {
      selected = null;
      const requested = handle.value;
      const response = await fetch(
        `/api/public-profiles/${encodeURIComponent(publicHandle(requested))}`,
        {
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error('Perfil público indisponível.');
      const profile = publicProfile(await response.json());
      if (handle.value !== requested) return;
      selected = profile;
      result.textContent = `Perfil selecionado: @${selected.handle}. Confira antes de confirmar.`;
    }),
  );
  return () => {
    if (!selected)
      throw new Error('Busque e confira o perfil antes de continuar.');
    return selected;
  };
}
function staff(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  const card = communityCard('Moderadores');
  container.append(card);
  const list = communityElement('div');
  card.append(list);
  let after: string | null = null;
  communityButton(card, 'Carregar moderadores', () =>
    actions.query(async () => {
      const data = object(
        await actions.request('staff', { id: state.community.id, after }),
      );
      keys(data, ['items', 'next']);
      list.replaceChildren();
      for (const item of communityArray(data['items'])) {
        const profile = publicProfile(item),
          row = communityElement('div', '', 'community-row');
        communityLink(
          row,
          `@${profile.handle}`,
          `#publico?handle=${encodeURIComponent(profile.handle)}`,
        );
        if (state.role === 'owner')
          communityButton(row, 'Remover moderador', () =>
            actions.mutate('role', {
              ...command(state),
              target: profile.id,
              moderator: false,
            }),
          );
        list.append(row);
      }
      after = communityCursor(data['next']);
    }),
  );
  if (state.role !== 'owner') return;
  const target = targetPicker(card, actions);
  communityButton(card, 'Nomear moderador', () =>
    actions.mutate('role', {
      ...command(state),
      target: target().id,
      moderator: true,
    }),
  );
}
function sanctionForm(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  const card = communityCard('Suspender participante');
  container.append(card);
  card.append(
    communityElement(
      'p',
      'O motivo será visível ao participante e aos gestores. Gestores devem perder a função antes de serem sancionados.',
    ),
  );
  const target = targetPicker(card, actions),
    reason = communityField(card, 'Motivo', { maximum: 1000, multiline: true });
  const label = communityElement('label', 'Duração'),
    days = communityElement('select');
  for (const [value, title] of [
    ['1', '1 dia'],
    ['7', '7 dias'],
    ['30', '30 dias'],
    ['permanent', 'Banimento reversível'],
  ] as const) {
    const option = communityElement('option', title);
    option.value = value;
    days.append(option);
  }
  label.append(days);
  card.append(label);
  const record = crypto.randomUUID();
  communityButton(card, 'Aplicar sanção', () =>
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
  const card = communityCard('Propriedade e arquivamento');
  container.append(card);
  card.append(
    communityElement(
      'p',
      'A transferência depende do aceite do destinatário. Depois do aceite, você passa a participante e perde a gestão.',
    ),
  );
  const target = targetPicker(card, actions);
  communityButton(card, 'Oferecer transferência', () =>
    actions.mutate('transfer-offer', {
      ...command(state),
      target: target().id,
    }),
  );
  if (state.transfer) {
    card.append(
      communityElement(
        'p',
        `Transferência aguardando @${state.transfer.target.handle}.`,
      ),
    );
    communityButton(card, 'Cancelar transferência', () =>
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
        ? 'Quero reabrir a participação.'
        : 'Quero arquivar, preservando conteúdo e registros.',
    ),
  );
  card.append(label);
  communityButton(
    card,
    state.community.archived ? 'Reabrir comunidade' : 'Arquivar comunidade',
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
  const card = communityCard('Transferência para você');
  container.append(card);
  card.append(
    communityElement(
      'p',
      'Ao aceitar, você assume a propriedade e a gestão desta comunidade. Confira as regras e o proprietário atual.',
    ),
  );
  communityButton(card, 'Aceitar propriedade', () =>
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
  const card = communityCard('Contestar sanção');
  container.append(card);
  const text = communityField(card, 'Sua contestação', {
    maximum: 2000,
    multiline: true,
  });
  card.append(
    communityElement('p', 'Uma contestação por sanção, visível aos gestores.'),
  );
  communityButton(card, 'Enviar contestação', () =>
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
  const card = communityCard('Sanções e contestações');
  container.append(card);
  const list = communityElement('div');
  card.append(list);
  let after: string | null = null;
  communityButton(card, 'Carregar sanções', () =>
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
            record.target ? `@${record.target.handle}` : 'Perfil removido',
          ),
          communityElement('p', record.reason),
        );
        row.append(
          communityElement(
            'p',
            record.lifted
              ? 'Sanção retirada'
              : record.until
                ? `Até ${new Date(record.until).toLocaleString('pt-BR')}`
                : 'Banimento reversível',
          ),
        );
        if (record.appeal)
          row.append(communityElement('p', `Contestação: ${record.appeal}`));
        if (record.decision)
          row.append(communityElement('p', `Resposta: ${record.decision}`));
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
  const decision = communityField(row, 'Resposta / motivo da revisão', {
    maximum: 1000,
    multiline: true,
  });
  const data = () => ({
    ...command(input.state),
    record: input.record,
    decision: decision.value,
  });
  communityButton(row, 'Retirar sanção', () =>
    input.actions.mutate('decide-sanction', { ...data(), lift: true }),
  );
  if (input.appeal)
    communityButton(row, 'Manter sanção e responder', () =>
      input.actions.mutate('decide-sanction', { ...data(), lift: false }),
    );
}
function reports(
  container: HTMLElement,
  state: CommunityState,
  actions: CommunityActions,
): void {
  const card = communityCard('Denúncias da comunidade');
  container.append(card);
  card.append(
    communityElement(
      'p',
      'A denúncia local é analisada pelos gestores. Sua identidade não aparece na resposta entregue a eles. Você pode acompanhar a análise abaixo.',
    ),
  );
  const reason = communityField(card, 'Motivo da denúncia', {
      maximum: 1000,
      multiline: true,
    }),
    record = crypto.randomUUID();
  communityButton(card, 'Enviar denúncia', () =>
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
    input.own ? 'Carregar minhas denúncias' : 'Carregar denúncias recebidas',
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
                ? `Encerrada: ${report.decision ?? ''}`
                : 'Aguardando análise',
            ),
          );
          if (!input.own && !report.resolved) {
            const decision = communityField(row, 'Resposta', {
              maximum: 1000,
              multiline: true,
            });
            communityButton(row, 'Encerrar denúncia', () =>
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
