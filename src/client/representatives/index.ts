import { object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import {
  decodeRepresentativeCard,
  encodeRepresentativeCard,
  representativeIdentity,
} from '../../shared/representatives/index.ts';
import type {
  RepresentativeCard,
  RepresentativeIdentity,
} from '../../shared/representatives/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { Contacts } from '../contacts/index.ts';
import { Representatives, representativeFailure } from './controller.ts';
import type { OwnedOrganization, RepresentativeSigner } from './controller.ts';
export function startRepresentatives(
  access: VaultAccess,
  sync: VaultSync,
  sign: RepresentativeSigner,
) {
  const controller = new Representatives(access, sync, sign),
    contacts = new Contacts(access);
  let session: AccountSession | null = null,
    host: HTMLElement | null = null,
    busy = false,
    generation = 0;
  function notice(text: string): void {
    const node = host?.querySelector('[data-representative-notice]');
    if (node) node.textContent = text;
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    const current = generation;
    host?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.disabled = true;
    });
    try {
      await work();
    } catch (error: unknown) {
      if (current === generation) notice(representativeFailure(error));
    } finally {
      busy = false;
      if (current === generation)
        host?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
          b.disabled = false;
        });
    }
  }
  function button(label: string, work: () => Promise<void>): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      void run(work);
    });
    return b;
  }
  function paragraph(text: string): HTMLParagraphElement {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  }
  function field(parent: HTMLElement, label: string): HTMLInputElement {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    wrapper.append(input);
    parent.append(wrapper);
    return input;
  }
  async function refresh(): Promise<void> {
    const current = generation;
    await controller.load();
    if (current !== generation) return;
    renderOwned();
  }
  function renderOwned(): void {
    const list = host?.querySelector('[data-representative-list]');
    if (!list) return;
    list.replaceChildren();
    for (const org of controller.organizations) {
      const detail = document.createElement('details'),
        title = document.createElement('summary');
      title.textContent = org.organization.name;
      detail.append(
        button('Concluir registro da organização', async () => {
          await controller.registerOwned(org);
          notice('Organização registrada.');
        }),
        title,
        paragraph(
          `Emissor: ${org.organization.issuer.ecosystem} · ${org.organization.issuer.address}`,
        ),
      );
      detail.append(
        button('Emitir autorização', () => issuance(org)),
        button('Vincular/verificar domínio (opcional)', () =>
          domainPanel(org, detail),
        ),
      );
      list.append(detail);
    }
    for (const card of controller.cards) {
      const row = document.createElement('article');
      row.className = 'card';
      row.append(
        paragraph(
          `${card.credential.organization.name} — ${card.credential.scope}`,
        ),
        paragraph(
          `Até ${new Date(card.credential.expiresAt).toLocaleString('pt-BR')}`,
        ),
      );
      row.append(
        button('Conferir estado', async () => {
          const checked = await controller.check(card);
          notice(checked.status);
        }),
      );
      if (card.credential.organization.issuer.accountId === session?.accountId)
        row.append(
          button('Concluir emissão', async () => {
            await controller.registerOwned({
              organization: card.credential.organization,
              registration: card.credential.registration,
            });
            await controller.registerCredential(card);
            notice(
              'Emissão registrada. Envie o cartão na conversa do representante.',
            );
          }),
          button('Revogar autorização', async () => {
            if (
              !window.confirm(
                'Revogar esta autorização? Ela não poderá voltar a ser vigente.',
              )
            )
              return;
            await controller.revoke(card);
            notice('Autorização revogada.');
          }),
        );
      list.append(row);
    }
    if (controller.hasMore)
      list.append(
        button('Mais organizações e autorizações', async () => {
          await controller.load(true);
          renderOwned();
        }),
      );
  }
  async function issuance(org: OwnedOrganization): Promise<void> {
    const current = generation;
    if (!host) return;
    const raw = await contacts.list('approved'),
      peers = raw.items;
    if (current !== generation) return;
    const form = document.createElement('section');
    form.className = 'card';
    form.append(
      paragraph(
        `Autorizar representante de ${org.organization.name}. A assinatura não concede cargos de grupo nem movimenta fundos.`,
      ),
    );
    const select = document.createElement('select'),
      scope = document.createElement('input'),
      expiry = document.createElement('input');
    scope.maxLength = 240;
    scope.placeholder = 'Escopo: por exemplo, suporte ao cliente';
    expiry.type = 'date';
    expiry.value = new Date(Date.now() + 90 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const available: Peer[] = [];
    function appendPeers(items: Peer[]): void {
      for (const value of items) {
        const p = value;
        available.push(p);
        const option = document.createElement('option');
        option.value = p.accountId;
        option.textContent = `${p.name || p.address} · ${p.ecosystem}`;
        select.append(option);
      }
    }
    appendPeers(peers);
    let after = raw.next;
    const more = button('Mais contatos', async () => {
      if (!after) return;
      const next = await contacts.list('approved', true);
      appendPeers(next.items);
      after = next.next;
      more.hidden = after === null;
    });
    more.hidden = after === null;
    const scopeLabel = document.createElement('label');
    scopeLabel.textContent = 'Função e escopo';
    scopeLabel.append(scope);
    const expiryLabel = document.createElement('label');
    expiryLabel.textContent = 'Válida até';
    expiryLabel.append(expiry);
    const subjectLabel = document.createElement('label');
    subjectLabel.textContent = 'Contato representante';
    subjectLabel.append(select);
    form.append(
      subjectLabel,
      more,
      scopeLabel,
      expiryLabel,
      button('Assinar autorização', async () => {
        const subject = available.find((p) => p.accountId === select.value);
        if (!subject) throw new Error('Escolha um contato aprovado.');
        await controller.issue(
          org,
          subject,
          scope.value,
          Date.parse(`${expiry.value}T23:59:59`),
        );
        form.remove();
        renderOwned();
        notice(
          'Autorização criada. Abra a conversa do representante para enviá-la.',
        );
      }),
      button('Cancelar', () => {
        form.remove();
        return Promise.resolve();
      }),
    );
    host.append(form);
  }
  async function domainPanel(
    org: OwnedOrganization,
    parent: HTMLElement,
  ): Promise<void> {
    const current = generation;
    parent.querySelector('[data-domain-panel]')?.remove();
    const section = document.createElement('section');
    section.dataset['domainPanel'] = '';
    const input = document.createElement('input');
    input.placeholder = 'Seu domínio, por exemplo carros.com';
    input.maxLength = 253;
    const output = document.createElement('p');
    output.className = 'detail representative-dns-code';
    const domainLabel = document.createElement('label');
    domainLabel.textContent = 'Domínio (opcional)';
    domainLabel.append(input);
    const state = await controller.domainState(org.organization.id);
    if (current !== generation) return;
    if (state !== null) {
      const row = object(state),
        claim = object(row['claim']);
      input.value = String(claim['domain']);
      output.textContent = `TXT: _0xdmme.${input.value}\nValor: ${String(row['record'])}`;
    }
    section.append(
      paragraph(
        'Opcional. Publique o TXT no painel DNS do domínio. O vínculo poderá ser compartilhado; não comprova titularidade legal ou reputação.',
      ),
      domainLabel,
      button('Gerar e assinar código', async () => {
        const raw = object(
          await controller.domainChallenge(org.organization.id, input.value),
        );
        output.textContent = `Tipo: TXT\nNome: ${String(raw['name'])}\nValor: ${String(raw['value'])}\nPublique e verifique antes de ${new Date(Number(raw['expiresAt'])).toLocaleTimeString('pt-BR')}.`;
      }),
      output,
      button('Verificar DNS', async () => {
        const checked = object(
          await controller.verifyDomain(org.organization.id),
        );
        notice(
          checked['verified'] === true
            ? 'Controle do domínio verificado.'
            : 'Código não encontrado. Confira o registro e aguarde a propagação do DNS.',
        );
      }),
      button('Desvincular domínio', async () => {
        await controller.unlinkDomain(org.organization.id);
        section.remove();
        notice('Domínio desvinculado.');
      }),
    );
    parent.append(section);
  }
  function mountSettings(container: HTMLElement): void {
    host = container;
    container.innerHTML =
      '<article class="card"><h2>Organizações e representantes</h2><p>Crie uma organização e emita autorizações assinadas. Site é opcional; nomes iguais não comprovam uma marca externa.</p><p data-representative-notice role="status"></p><button type="button" data-representative-load>Abrir organizações e autorizações</button><div data-representative-list></div></article>';
    const card = container.querySelector<HTMLElement>('.card');
    if (!card) throw new Error('Painel de representantes indisponível.');
    container
      .querySelector('[data-representative-load]')
      ?.addEventListener('click', () => {
        void run(refresh);
      });
    const name = field(card, 'Nome da organização');
    name.maxLength = 80;
    card.append(
      button('Criar e assinar organização', async () => {
        await controller.create(name.value);
        name.value = '';
        renderOwned();
        notice('Organização registrada.');
      }),
    );
  }
  function mountChat(
    container: HTMLElement,
    peer: Peer,
    send: (text: string) => Promise<void>,
  ): void {
    host = container;
    container.replaceChildren();
    const noticeNode = paragraph(
      'Apresente uma autorização aceita ou envie um convite de representação.',
    );
    noticeNode.dataset['representativeNotice'] = '';
    container.append(noticeNode);
    container.append(
      button('Minhas autorizações', async () => {
        await controller.load();
        renderShareList(container, peer, send);
      }),
    );
  }
  function renderShareList(
    container: HTMLElement,
    peer: Peer,
    send: (text: string) => Promise<void>,
  ): void {
    container.querySelector('[data-share-list]')?.remove();
    const list = document.createElement('div');
    list.dataset['shareList'] = '';
    for (const card of controller.cards) appendShare(list, card, peer, send);
    if (!list.children.length)
      list.append(
        paragraph(
          'Nenhuma autorização disponível nesta página. Crie e emita em Perfil → Organizações e representantes.',
        ),
      );
    if (controller.hasMore)
      list.append(
        button('Mais autorizações', async () => {
          await controller.load(true);
          renderShareList(container, peer, send);
        }),
      );
    container.append(list);
  }
  function appendShare(
    list: HTMLElement,
    card: RepresentativeCard,
    peer: Peer,
    send: (text: string) => Promise<void>,
  ): void {
    const c = card.credential,
      offer =
        c.organization.issuer.accountId === session?.accountId &&
        c.subject.accountId === peer.accountId,
      presentation =
        c.subject.accountId === session?.accountId && card.acceptance !== null;
    if (!offer && !presentation) return;
    list.append(
      button(
        `${offer ? 'Enviar autorização para aceite' : 'Apresentar autorização'}: ${c.organization.name} — ${c.scope}`,
        async () => {
          if (offer) {
            await controller.registerOwned({
              organization: c.organization,
              registration: c.registration,
            });
            await controller.registerCredential(card);
          }
          const state = await controller.check(card);
          if (['Revogada', 'Expirada'].includes(state.status))
            throw new Error(state.status);
          await send(encodeRepresentativeCard(card));
          notice('Cartão enviado pelo chat criptografado.');
        },
      ),
    );
  }
  function renderCard(
    parent: HTMLElement,
    text: string,
    sender: RepresentativeIdentity | null,
  ): boolean {
    let card: RepresentativeCard | null;
    try {
      card = decodeRepresentativeCard(text);
    } catch {
      parent.append(paragraph('Cartão de autorização inválido.'));
      return true;
    }
    if (!card) return false;
    const c = card.credential,
      article = document.createElement('article');
    article.className = 'card';
    const state = paragraph('Ainda não verificada.');
    state.setAttribute('role', 'status');
    article.append(
      paragraph(`${c.organization.name} — ${c.scope}`),
      paragraph(
        `Emissor: ${c.organization.issuer.ecosystem} · ${c.organization.issuer.address}`,
      ),
      paragraph(`Representante: ${c.subject.ecosystem} · ${c.subject.address}`),
      paragraph(`Até ${new Date(c.expiresAt).toLocaleString('pt-BR')}`),
      paragraph('Verifique novamente antes de usar esta autorização.'),
      state,
    );
    if (
      !sender ||
      ![canonical(c.subject), canonical(c.organization.issuer)].includes(
        canonical(representativeIdentity(sender)),
      )
    )
      article.append(
        paragraph(
          'Este cartão foi encaminhado. Ele não comprova que o remetente é o representante.',
        ),
      );
    article.append(
      button('Verificar autorização', async () => {
        try {
          const checked = await controller.check(card);
          state.textContent =
            `Consulta em ${new Date().toLocaleString('pt-BR')}: ${checked.status}` +
            (checked.domain
              ? ` · ${checked.domain}: ${checked.domainCurrent ? 'Controle do domínio verificado' : 'verificação de domínio desatualizada ou inconclusiva'}`
              : ' · Sem domínio vinculado. Emissor identificado pela wallet.');
        } catch (error: unknown) {
          state.textContent = `Autorização atual não confirmada: ${representativeFailure(error)}`;
        }
      }),
    );
    if (c.subject.accountId === session?.accountId && card.acceptance === null)
      article.append(
        button('Aceitar representação e assinar', async () => {
          try {
            await controller.accept(card);
            state.textContent =
              'Aceite salvo. Você pode apresentar esta autorização nas conversas.';
          } catch (error: unknown) {
            state.textContent = `Aceite não concluído: ${representativeFailure(error)}`;
          }
        }),
      );
    parent.append(article);
    return true;
  }
  return {
    mountSettings,
    mountChat,
    renderCard,
    setSession(value: AccountSession | null): void {
      generation++;
      session = value;
      controller.setSession(value);
      contacts.setSession(value);
      const container = host;
      if (container?.matches('[data-representatives-settings]'))
        mountSettings(container);
      else container?.replaceChildren();
    },
    leave(): void {
      host = null;
    },
    canActivate: () => !busy,
  };
}
