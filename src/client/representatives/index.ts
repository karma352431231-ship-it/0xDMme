import { t, currentLanguage } from '../../shared/i18n/index.ts';
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
        button(t('Concluir registro da organização'), async () => {
          await controller.registerOwned(org);
          notice(t('Organização registrada.'));
        }),
        title,
        paragraph(
          t('Emissor: {0} · {1}', [
            org.organization.issuer.ecosystem,
            org.organization.issuer.address,
          ]),
        ),
      );
      detail.append(
        button(t('Emitir autorização'), () => issuance(org)),
        button(t('Vincular/verificar domínio (opcional)'), () =>
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
          t('{0} — {1}', [
            card.credential.organization.name,
            card.credential.scope,
          ]),
        ),
        paragraph(
          t('Até {0}', [
            new Date(card.credential.expiresAt).toLocaleString(
              currentLanguage(),
            ),
          ]),
        ),
      );
      row.append(
        button(t('Conferir estado'), async () => {
          const checked = await controller.check(card);
          notice(checked.status);
        }),
      );
      if (card.credential.organization.issuer.accountId === session?.accountId)
        row.append(
          button(t('Concluir emissão'), async () => {
            await controller.registerOwned({
              organization: card.credential.organization,
              registration: card.credential.registration,
            });
            await controller.registerCredential(card);
            notice(
              t(
                'Emissão registrada. Envie o cartão na conversa do representante.',
              ),
            );
          }),
          button(t('Revogar autorização'), async () => {
            if (
              !window.confirm(
                t(
                  'Revogar esta autorização? Ela não poderá voltar a ser vigente.',
                ),
              )
            )
              return;
            await controller.revoke(card);
            notice(t('Autorização revogada.'));
          }),
        );
      list.append(row);
    }
    if (controller.hasMore)
      list.append(
        button(t('Mais organizações e autorizações'), async () => {
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
        t(
          'Autorizar representante de {0}. A assinatura não concede cargos de grupo nem movimenta fundos.',
          [org.organization.name],
        ),
      ),
    );
    const select = document.createElement('select'),
      scope = document.createElement('input'),
      expiry = document.createElement('input');
    scope.maxLength = 240;
    scope.placeholder = t('Escopo: por exemplo, suporte ao cliente');
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
        option.textContent = t('{0} · {1}', [p.name || p.address, p.ecosystem]);
        select.append(option);
      }
    }
    appendPeers(peers);
    let after = raw.next;
    const more = button(t('Mais contatos'), async () => {
      if (!after) return;
      const next = await contacts.list('approved', true);
      appendPeers(next.items);
      after = next.next;
      more.hidden = after === null;
    });
    more.hidden = after === null;
    const scopeLabel = document.createElement('label');
    scopeLabel.textContent = t('Função e escopo');
    scopeLabel.append(scope);
    const expiryLabel = document.createElement('label');
    expiryLabel.textContent = t('Válida até');
    expiryLabel.append(expiry);
    const subjectLabel = document.createElement('label');
    subjectLabel.textContent = t('Contato representante');
    subjectLabel.append(select);
    form.append(
      subjectLabel,
      more,
      scopeLabel,
      expiryLabel,
      button(t('Assinar autorização'), async () => {
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
          t(
            'Autorização criada. Abra a conversa do representante para enviá-la.',
          ),
        );
      }),
      button(t('Cancelar'), () => {
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
    input.placeholder = t('Seu domínio, por exemplo carros.com');
    input.maxLength = 253;
    const output = document.createElement('p');
    output.className = 'detail representative-dns-code';
    const domainLabel = document.createElement('label');
    domainLabel.textContent = t('Domínio (opcional)');
    domainLabel.append(input);
    const state = await controller.domainState(org.organization.id);
    if (current !== generation) return;
    if (state !== null) {
      const row = object(state),
        claim = object(row['claim']);
      input.value = String(claim['domain']);
      output.textContent = t('TXT: _0xdmme.{0}\nValor: {1}', [
        input.value,
        String(row['record']),
      ]);
    }
    section.append(
      paragraph(
        t(
          'Opcional. Publique o TXT no painel DNS do domínio. O vínculo poderá ser compartilhado; não comprova titularidade legal ou reputação.',
        ),
      ),
      domainLabel,
      button(t('Gerar e assinar código'), async () => {
        const raw = object(
          await controller.domainChallenge(org.organization.id, input.value),
        );
        output.textContent = t(
          'Tipo: TXT\nNome: {0}\nValor: {1}\nPublique e verifique antes de {2}.',
          [
            String(raw['name']),
            String(raw['value']),
            new Date(Number(raw['expiresAt'])).toLocaleTimeString(
              currentLanguage(),
            ),
          ],
        );
      }),
      output,
      button(t('Verificar DNS'), async () => {
        const checked = object(
          await controller.verifyDomain(org.organization.id),
        );
        notice(
          checked['verified'] === true
            ? t('Controle do domínio verificado.')
            : t(
                'Código não encontrado. Confira o registro e aguarde a propagação do DNS.',
              ),
        );
      }),
      button(t('Desvincular domínio'), async () => {
        await controller.unlinkDomain(org.organization.id);
        section.remove();
        notice(t('Domínio desvinculado.'));
      }),
    );
    parent.append(section);
  }
  function mountSettings(container: HTMLElement): void {
    host = container;
    container.innerHTML = t('html.3dee5155ad6c');
    const card = container.querySelector<HTMLElement>('.card');
    if (!card) throw new Error('Painel de representantes indisponível.');
    container
      .querySelector('[data-representative-load]')
      ?.addEventListener('click', () => {
        void run(refresh);
      });
    const name = field(card, t('Nome da organização'));
    name.maxLength = 80;
    card.append(
      button(t('Criar e assinar organização'), async () => {
        await controller.create(name.value);
        name.value = '';
        renderOwned();
        notice(t('Organização registrada.'));
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
      t(
        'Apresente uma autorização aceita ou envie um convite de representação.',
      ),
    );
    noticeNode.dataset['representativeNotice'] = '';
    container.append(noticeNode);
    container.append(
      button(t('Minhas autorizações'), async () => {
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
          t(
            'Nenhuma autorização disponível nesta página. Crie e emita em Perfil → Organizações e representantes.',
          ),
        ),
      );
    if (controller.hasMore)
      list.append(
        button(t('Mais autorizações'), async () => {
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
        t('{0}: {1} — {2}', [
          offer
            ? t('Enviar autorização para aceite')
            : t('Apresentar autorização'),
          c.organization.name,
          c.scope,
        ]),
        async () => {
          if (offer) {
            await controller.registerOwned({
              organization: c.organization,
              registration: c.registration,
            });
            await controller.registerCredential(card);
          }
          const state = await controller.check(card);
          if ([t('Revogada'), t('Expirada')].includes(state.status))
            throw new Error(state.status);
          await send(encodeRepresentativeCard(card));
          notice(t('Cartão enviado pelo chat criptografado.'));
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
      parent.append(paragraph(t('Cartão de autorização inválido.')));
      return true;
    }
    if (!card) return false;
    const c = card.credential,
      article = document.createElement('article');
    article.className = 'card';
    const state = paragraph(t('Ainda não verificada.'));
    state.setAttribute('role', 'status');
    article.append(
      paragraph(t('{0} — {1}', [c.organization.name, c.scope])),
      paragraph(
        t('Emissor: {0} · {1}', [
          c.organization.issuer.ecosystem,
          c.organization.issuer.address,
        ]),
      ),
      paragraph(
        t('Representante: {0} · {1}', [c.subject.ecosystem, c.subject.address]),
      ),
      paragraph(
        t('Até {0}', [new Date(c.expiresAt).toLocaleString(currentLanguage())]),
      ),
      paragraph(t('Verifique novamente antes de usar esta autorização.')),
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
          t(
            'Este cartão foi encaminhado. Ele não comprova que o remetente é o representante.',
          ),
        ),
      );
    article.append(
      button(t('Verificar autorização'), async () => {
        try {
          const checked = await controller.check(card);
          state.textContent =
            t('Consulta em {0}: {1}', [
              new Date().toLocaleString(currentLanguage()),
              checked.status,
            ]) +
            (checked.domain
              ? t(' · {0}: {1}', [
                  checked.domain,
                  checked.domainCurrent
                    ? t('Controle do domínio verificado')
                    : t('verificação de domínio desatualizada ou inconclusiva'),
                ])
              : t(
                  ' · Sem domínio vinculado. Emissor identificado pela wallet.',
                ));
        } catch (error: unknown) {
          state.textContent = t('Autorização atual não confirmada: {0}', [
            representativeFailure(error),
          ]);
        }
      }),
    );
    if (c.subject.accountId === session?.accountId && card.acceptance === null)
      article.append(
        button(t('Aceitar representação e assinar'), async () => {
          try {
            await controller.accept(card);
            state.textContent = t(
              'Aceite salvo. Você pode apresentar esta autorização nas conversas.',
            );
          } catch (error: unknown) {
            state.textContent = t('Aceite não concluído: {0}', [
              representativeFailure(error),
            ]);
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
