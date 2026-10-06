import type { AccountSession } from '../../shared/account/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { socialRelation } from '../../shared/social-dm/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import { SocialDms } from '../social-dm/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import {
  communityButton,
  communityCard,
  communityElement,
  communityField,
  communityLink,
} from './elements.ts';
import { postText } from './post-text.ts';

export function startSocialDmUi(access: VaultAccess, sync: VaultSync) {
  const controller = new SocialDms(access, sync);
  let container: HTMLElement | null = null,
    session: AccountSession | null = null,
    output: HTMLElement | null = null;
  let generation = 0,
    busy = false,
    peer: string | null = null,
    cursor: string | null = null,
    before: number | null = null;
  let draft = '',
    messageId: string = crypto.randomUUID();
  let ownProfile: string | null = null;
  function feedback(error: unknown): void {
    if (output)
      output.textContent =
        error instanceof Error ? error.message : 'DM indisponível.';
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    const old = generation;
    busy = true;
    container
      ?.querySelectorAll<HTMLButtonElement>('button')
      .forEach((b) => (b.disabled = true));
    try {
      await work();
    } catch (error: unknown) {
      if (old === generation) feedback(error);
    } finally {
      busy = false;
      if (old === generation)
        container
          ?.querySelectorAll<HTMLButtonElement>('button')
          .forEach((b) => (b.disabled = false));
    }
  }
  function card(title: string): HTMLElement {
    if (!container) throw new Error('DM encerrada.');
    container.replaceChildren();
    const navigation = communityElement('nav', '', 'community-tabs');
    navigation.setAttribute('aria-label', 'Mensagens pelo @');
    communityLink(
      navigation,
      'Voltar às comunidades',
      '#comunidades?view=feed',
    );
    if (peer)
      communityLink(navigation, 'Lista de mensagens', '#comunidades?view=dms');
    container.append(navigation);
    const node = communityCard(title);
    container.append(node);
    output = communityElement('p', '', 'community-feedback');
    output.setAttribute('role', 'status');
    node.append(output);
    return node;
  }
  async function list(): Promise<void> {
    const old = generation,
      page = await controller.list(cursor);
    if (old !== generation || !container) return;
    const node = card('Mensagens pelo @');
    node.append(
      communityElement(
        'p',
        'DMs privadas com identidade pública. Solicitações não compartilham seu perfil privado.',
      ),
    );
    for (const row of page.items) {
      const item = communityElement('div', '', 'community-row');
      communityLink(
        item,
        `@${row.peer.handle} · ${row.blocked ? 'Bloqueada' : row.state === 'approved' ? 'Conversa' : row.state === 'pending' ? 'Solicitação' : 'Recusada'}`,
        `#comunidades?view=dms&dm=${row.peer.id}`,
      );
      node.append(item);
    }
    if (!page.items.length)
      node.append(
        communityElement(
          'p',
          'Sem DMs nesta página. Abra um perfil público para solicitar uma conversa.',
        ),
      );
    cursor = page.next;
    if (page.next) communityButton(node, 'Próxima página', () => run(list));
    communityButton(node, 'Recarregar lista', () =>
      run(async () => {
        cursor = null;
        await list();
      }),
    );
  }
  async function identity(id: string): Promise<PublicProfile> {
    // UUID is not a directory of private contacts. Only already-approved public identities are returned.
    const rows = await controller.list(null);
    const known = rows.items.find((row) => row.peer.id === id);
    if (known) return known.peer;
    const raw = await controller.request('profile', { peer: id });
    return publicProfile(raw);
  }
  async function conversation(): Promise<void> {
    if (!peer) return;
    const old = generation,
      selected = peer,
      value = await controller.state(selected),
      profile = value ? value.peer : await identity(selected);
    if (old !== generation || !container) return;
    const node = card(`DM com @${profile.handle}`);
    communityLink(
      node,
      'Ver perfil público',
      `#publico?handle=${encodeURIComponent(profile.handle)}`,
    );
    node.append(
      communityElement(
        'p',
        'Somente @ e avatar públicos. Texto e links com E2EE; mensagens ficam ilegíveis no servidor.',
      ),
    );
    if (canRequest(value)) {
      communityButton(node, 'Solicitar DM', () =>
        run(async () => {
          socialRelation(
            await controller.request('request', { peer: selected }),
          );
          await conversation();
        }),
      );
      blockControl(node, selected, value);
      return;
    }
    if (!value) throw new Error('Relação da DM ausente.');
    await consentControls({ node, selected, value, old });
    if (old !== generation) return;
    blockControl(node, selected, value);
    communityButton(node, 'Recarregar conversa', () =>
      run(async () => {
        before = null;
        await conversation();
      }),
    );
  }
  function blockControl(
    node: HTMLElement,
    selected: string,
    value: SocialRelation | null,
  ): void {
    const blocked = value?.blocked ?? false;
    communityButton(
      node,
      blocked ? 'Desbloquear esta DM' : 'Bloquear esta DM',
      () =>
        run(async () => {
          await controller.request('block', {
            peer: selected,
            blocked: !blocked,
            revision: value?.blockRevision ?? 0,
          });
          before = null;
          await conversation();
        }),
    );
  }
  async function consentControls(input: {
    node: HTMLElement;
    selected: string;
    value: SocialRelation;
    old: number;
  }): Promise<void> {
    const { node, selected, value, old } = input;
    if (value.state === 'pending') {
      const own = ownProfile;
      if (old !== generation) return;
      node.append(
        communityElement(
          'p',
          value.requester === own
            ? 'Aguardando aceite. Nenhuma mensagem livre pode ser enviada.'
            : 'Solicitação de conversa pelo @.',
        ),
      );
      if (value.requester !== own)
        for (const [accept, label] of [
          [true, 'Aceitar DM'],
          [false, 'Recusar'],
        ] as const)
          communityButton(node, label, () =>
            run(async () => {
              await controller.request('decide', {
                peer: selected,
                revision: value.revision,
                accept,
              });
              await conversation();
            }),
          );
    } else if (!value.canSend)
      node.append(
        communityElement('p', 'Esta DM está recusada ou indisponível.'),
      );
    if (value.state === 'approved' && value.canSend)
      await messages(node, selected, old);
  }
  function canRequest(value: SocialRelation | null): boolean {
    return (
      !value ||
      ((value.state === 'none' || value.state === 'rejected') &&
        !value.blocked &&
        value.requester !== ownProfile)
    );
  }
  async function messages(
    node: HTMLElement,
    selected: string,
    old: number,
  ): Promise<void> {
    const page = await controller.read(selected, before);
    const pending = await controller.pending(selected);
    if (pending) {
      draft = pending.text;
      messageId = pending.id;
    }
    if (old !== generation) return;
    const history = communityElement('section', '', 'social-dm-history');
    node.append(history);
    for (const item of [...page.items].reverse()) {
      const row = communityElement('article', '', 'card');
      row.append(
        communityElement(
          'strong',
          item.sender === page.self ? 'Você' : 'Mensagem recebida',
        ),
        postText(item.text),
      );
      history.append(row);
    }
    if (!page.items.length)
      history.append(communityElement('p', 'Nenhuma mensagem nesta página.'));
    if (page.next !== null)
      communityButton(node, 'Mensagens anteriores', () =>
        run(async () => {
          before = page.next;
          await conversation();
        }),
      );
    const text = communityField(node, 'Mensagem de texto', {
      value: draft,
      multiline: true,
      maximum: 1000000,
    });
    text.addEventListener('input', () => {
      draft = text.value;
    });
    communityButton(node, 'Enviar mensagem', () =>
      run(async () => {
        await controller.send(selected, draft, messageId);
        if (old !== generation) return;
        draft = '';
        messageId = crypto.randomUUID();
        before = null;
        await conversation();
      }),
    );
  }
  function leave(): void {
    generation++;
    controller.cancel();
    container = null;
    output = null;
    draft = '';
    messageId = crypto.randomUUID();
  }
  return {
    mount(node: HTMLElement, id: string | null): void {
      leave();
      container = node;
      peer = id;
      cursor = null;
      before = null;
      const target = card(id ? 'Abrindo DM…' : 'Mensagens pelo @');
      if (!session) {
        communityLink(
          target,
          'Entre pelo Perfil para abrir suas DMs',
          '#perfil',
        );
        return;
      }
      const old = generation;
      void run(async () => {
        const profile = await controller.initialize();
        if (old !== generation) return;
        ownProfile = profile;
        await (peer ? conversation() : list());
      });
    },
    leave,
    setSession(value: AccountSession | null): void {
      if (sameSession(value, session)) return;
      session = value;
      ownProfile = null;
      generation++;
      controller.setSession(value);
      container?.replaceChildren();
    },
    canActivate: () => !busy,
    async directory(node: HTMLElement, valid: () => boolean): Promise<void> {
      node.append(communityElement('h2', 'Mensagens pelo @'));
      communityLink(node, 'Ver todas as DMs', '#comunidades?view=dms');
      if (!session) return;
      try {
        const page = await controller.list(null);
        if (!valid()) return;
        for (const row of page.items)
          communityLink(
            node,
            `@${row.peer.handle}`,
            `#comunidades?view=dms&dm=${row.peer.id}`,
          );
      } catch (error: unknown) {
        if (valid())
          node.append(
            communityElement(
              'p',
              error instanceof Error ? error.message : 'DMs indisponíveis.',
            ),
          );
      }
    },
  };
}
function sameSession(
  a: AccountSession | null,
  b: AccountSession | null,
): boolean {
  return (
    a?.accountId === b?.accountId &&
    a?.deviceId === b?.deviceId &&
    a?.csrf === b?.csrf
  );
}
