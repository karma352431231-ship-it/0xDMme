import type { AccountSession } from '../../shared/account/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { socialRelation } from '../../shared/social-dm/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import { prepareSocialImage } from '../social-media/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import { VoicePlayback } from '../voice-playback/index.ts';
import { VoiceRecording } from '../voice-recording/index.ts';
import { LiveMessages } from '../message-live/index.ts';
import { socialAttachment } from '../../shared/social-media/index.ts';
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
  const playback = new VoicePlayback(),
    mediaUi = new AttachmentUi(playback, () => {});
  const recording = new VoiceRecording({
    changed: (state) => {
      if (output) output.textContent = state.notice;
    },
    completed: (selection) => {
      const selected = peer;
      if (!selected) return;
      void run(async () => {
        try {
          await controller.stageMedia(selected, selection, 'voice', draft);
        } finally {
          selection.bytes.fill(0);
        }
        if (output)
          output.textContent =
            'Áudio preparado. Envie ou cancele a mídia pendente.';
      });
    },
  });
  const live = new LiveMessages({
    access,
    event: (event) => {
      if (!container || busy || recording.active) return;
      if (['ready', 'changed', 'authorization', 'invalidated'].includes(event))
        void run(async () => {
          await playback.check((target) =>
            controller.state(target).then((state) => state?.canSend ?? false),
          );
          if (peer) await conversation();
          else {
            cursor = null;
            await list();
          }
        });
    },
    changed: () => {},
  });
  let fallback: ReturnType<typeof setInterval> | null = null;
  function startFallback(): void {
    fallback = setInterval(() => {
      if (
        !container ||
        busy ||
        recording.active ||
        live.connected ||
        document.visibilityState !== 'visible'
      )
        return;
      void run(async () => {
        if (peer) await conversation();
        else {
          cursor = null;
          await list();
        }
      });
    }, 30000);
  }
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
  let localOnly = false;
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
    if (localOnly || !navigator.onLine) {
      await copiesList();
      return;
    }
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
        `@${row.peer.handle} · ${relationLabel(row)}`,
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
    await copiesList(node);
    cursor = page.next;
    if (page.next) communityButton(node, 'Próxima página', () => run(list));
    communityButton(node, 'Recarregar lista', () =>
      run(async () => {
        cursor = null;
        await list();
      }),
    );
  }
  async function copiesList(
    target?: HTMLElement,
    after: string | null = null,
  ): Promise<void> {
    const old = generation,
      page = await controller.copies(after);
    if (old !== generation || !container) return;
    const node = target ?? card('Mensagens pelo @ no aparelho');
    if (page.items.length)
      node.append(communityElement('h3', 'Histórico neste aparelho'));
    for (const row of page.items)
      communityLink(
        node,
        `@${row.peer.handle} · Cópia local`,
        `#comunidades?view=dms&dm=${row.peer.id}&history=local`,
      );
    if (!target && !page.items.length)
      node.append(
        communityElement('p', 'Sem histórico de DMs nesta página do aparelho.'),
      );
    if (page.next)
      communityButton(node, 'Mais históricos locais', () =>
        run(() => copiesList(undefined, page.next)),
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
    if (localOnly || !navigator.onLine) {
      await offlineConversation(peer);
      return;
    }
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
        'Somente @ e avatar públicos. Texto, áudio, foto e GIF com E2EE; mensagens ficam ilegíveis no servidor.',
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
      await messages(node, selected, old, false);
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
  async function offlineConversation(selected: string): Promise<void> {
    const old = generation,
      page = await controller.cached(selected, before);
    if (old !== generation || !container) return;
    const profile = page.items[0]?.peer;
    const node = card(
      profile ? `DM com @${profile.handle}` : 'Histórico de DM no aparelho',
    );
    node.append(
      communityElement(
        'p',
        'Cópia local. Conecte para sincronizar, solicitar ou enviar mensagens.',
      ),
    );
    await messages(node, selected, old, false);
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
    await messages(
      node,
      selected,
      old,
      value.state === 'approved' && value.canSend,
    );
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
    writable: boolean,
  ): Promise<void> {
    const page = writable
      ? await controller.read(selected, before)
      : await controller.cached(selected, before);
    const pending = writable ? await controller.pending(selected) : null;
    if (pending) {
      draft = pending.text;
      messageId = pending.id;
    }
    if (old !== generation) return;
    renderHistory({ node, selected, page, localMedia: !writable });
    if (!writable) return;
    if (await controller.mediaDraft(selected))
      node.append(
        communityElement(
          'p',
          'Há mídia pendente neste aparelho. Retome o envio ou cancele.',
        ),
      );
    const text = communityField(node, 'Mensagem de texto', {
      value: draft,
      multiline: true,
      maximum: 1000000,
    });
    text.addEventListener('input', () => {
      draft = text.value;
    });
    const image = communityElement('input');
    image.type = 'file';
    image.accept = 'image/png,image/jpeg,image/webp,image/gif';
    image.setAttribute('aria-label', 'Foto ou GIF para esta DM');
    node.append(image);
    image.addEventListener('change', () => {
      const file = image.files?.[0];
      image.value = '';
      if (!file) return;
      void run(async () => {
        const prepared = await prepareSocialImage(file);
        try {
          await controller.stageMedia(
            selected,
            prepared.selection,
            prepared.media,
            draft,
          );
          if (output)
            output.textContent =
              'Mídia preparada. Envie ou cancele a mídia pendente.';
        } finally {
          prepared.selection.bytes.fill(0);
          prepared.selection.thumbnail?.fill(0);
        }
      });
    });
    communityButton(node, 'Gravar áudio', () => recording.start());
    communityButton(node, 'Concluir gravação', () => recording.stop());
    communityButton(node, 'Enviar mídia preparada', () =>
      run(async () => {
        await controller.sendMedia(selected);
        before = null;
        await conversation();
      }),
    );
    communityButton(node, 'Cancelar mídia pendente', () =>
      run(async () => {
        await controller.cancelMedia(selected);
        if (output) output.textContent = 'Mídia pendente cancelada.';
      }),
    );
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
  function renderHistory(input: {
    node: HTMLElement;
    selected: string;
    page: Awaited<ReturnType<SocialDms['cached']>>;
    localMedia: boolean;
  }): void {
    const { node, selected, page } = input;
    mediaUi.clearMedia();
    const history = communityElement('section', '', 'social-dm-history');
    node.append(history);
    for (const item of [...page.items].reverse()) {
      const row = communityElement('article', '', 'card');
      row.append(
        communityElement(
          'strong',
          item.sender === page.self ? 'Você' : 'Mensagem recebida',
        ),
        ...(item.kind === 'text' ? [postText(item.text)] : []),
      );
      history.append(row);
      if (item.kind === 'attachment' && item.media)
        mediaUi.render({
          article: row,
          view: { ...item, peer: selected, archived: input.localMedia },
          saveNotice:
            'A cópia salva fica fora do cofre e da limpeza pessoal. Abra arquivos somente se confiar na origem.',
          content: socialAttachment(
            JSON.parse(item.text) as unknown,
            item.media,
          ),
          load: (view, thumbnail) =>
            controller.media(item, thumbnail, false, input.localMedia),
          run,
        });
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
  }
  function leave(): void {
    live.stop();
    if (fallback) clearInterval(fallback);
    fallback = null;
    recording.cancel();
    mediaUi.clearMedia();
    playback.close();
    generation++;
    controller.cancel();
    container = null;
    output = null;
    draft = '';
    messageId = crypto.randomUUID();
  }
  return {
    mount(node: HTMLElement, id: string | null, local = false): void {
      leave();
      container = node;
      peer = id;
      localOnly = local;
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
        const profile =
          navigator.onLine && !localOnly ? await controller.initialize() : null;
        if (old !== generation) return;
        ownProfile = profile;
        if (navigator.onLine && !localOnly) live.start();
        if (navigator.onLine && !localOnly) startFallback();
        await (peer ? conversation() : list());
      });
    },
    leave,
    setSession(value: AccountSession | null): void {
      if (sameSession(value, session)) return;
      live.stop();
      if (fallback) clearInterval(fallback);
      fallback = null;
      recording.cancel();
      mediaUi.clearMedia();
      playback.close();
      session = value;
      ownProfile = null;
      generation++;
      controller.setSession(value);
      container?.replaceChildren();
    },
    canActivate: () => !busy && !recording.active,
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

function relationLabel(row: SocialRelation): string {
  if (row.blocked) return 'Bloqueada';
  return {
    approved: 'Conversa',
    pending: 'Solicitação',
    rejected: 'Recusada',
    none: 'Sem consentimento',
  }[row.state];
}
