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
    // Feedback describes the latest operation; an earlier error does not stay.
    notice('');
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
        button(t('Complete organization registration'), async () => {
          await controller.registerOwned(org);
          notice(t('Organization registered.'));
        }),
        title,
        paragraph(
          t('Issuer: {0} · {1}', [
            org.organization.issuer.ecosystem,
            org.organization.issuer.address,
          ]),
        ),
      );
      detail.append(
        button(t('Issue authorization'), () => issuance(org)),
        button(t('Link/verify domain (optional)'), () =>
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
          t('Until {0}', [
            new Date(card.credential.expiresAt).toLocaleString(
              currentLanguage(),
            ),
          ]),
        ),
      );
      row.append(
        button(t('Check state'), async () => {
          const checked = await controller.check(card);
          notice(checked.status);
        }),
      );
      if (card.credential.organization.issuer.accountId === session?.accountId)
        row.append(
          button(t('Complete issuance'), async () => {
            await controller.registerOwned({
              organization: card.credential.organization,
              registration: card.credential.registration,
            });
            await controller.registerCredential(card);
            notice(
              t(
                "Issuance recorded. Send the card in the representative's conversation.",
              ),
            );
          }),
          button(t('Revoke authorization'), async () => {
            if (
              !window.confirm(
                t('Revoke this authorization? It cannot become valid again.'),
              )
            )
              return;
            await controller.revoke(card);
            notice(t('Authorization revoked.'));
          }),
        );
      list.append(row);
    }
    if (!controller.organizations.length && !controller.cards.length)
      list.append(paragraph(t('No organizations or authorizations yet.')));
    if (controller.hasMore)
      list.append(
        button(t('More organizations and authorizations'), async () => {
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
          'Authorize a representative for {0}. The signature does not grant group roles or move funds.',
          [org.organization.name],
        ),
      ),
    );
    const select = document.createElement('select'),
      scope = document.createElement('input'),
      expiry = document.createElement('input');
    scope.maxLength = 240;
    scope.placeholder = t('Scope: for example, customer support');
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
    const more = button(t('More contacts'), async () => {
      if (!after) return;
      const next = await contacts.list('approved', true);
      appendPeers(next.items);
      after = next.next;
      more.hidden = after === null;
    });
    more.hidden = after === null;
    const scopeLabel = document.createElement('label');
    scopeLabel.textContent = t('Role and scope');
    scopeLabel.append(scope);
    const expiryLabel = document.createElement('label');
    expiryLabel.textContent = t('Valid until');
    expiryLabel.append(expiry);
    const subjectLabel = document.createElement('label');
    subjectLabel.textContent = t('Representative contact');
    subjectLabel.append(select);
    form.append(
      subjectLabel,
      more,
      scopeLabel,
      expiryLabel,
      button(t('Sign authorization'), async () => {
        const subject = available.find((p) => p.accountId === select.value);
        if (!subject) throw new Error('Choose an approved contact.');
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
            "Authorization created. Open the representative's conversation to send it.",
          ),
        );
      }),
      button(t('Cancel'), () => {
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
    input.placeholder = t('Your domain, for example cars.com');
    input.maxLength = 253;
    const output = document.createElement('p');
    output.className = 'detail representative-dns-code';
    const domainLabel = document.createElement('label');
    domainLabel.textContent = t('Domain (optional)');
    domainLabel.append(input);
    const state = await controller.domainState(org.organization.id);
    if (current !== generation) return;
    if (state !== null) {
      const row = object(state),
        claim = object(row['claim']);
      input.value = String(claim['domain']);
      output.textContent = t('TXT: _0xdmme.{0}\nValue: {1}', [
        input.value,
        String(row['record']),
      ]);
    }
    section.append(
      paragraph(
        t(
          "Optional. Publish the TXT record in the domain's DNS panel. The link may be shared; it does not prove legal ownership or reputation.",
        ),
      ),
      domainLabel,
      button(t('Generate and sign code'), async () => {
        const raw = object(
          await controller.domainChallenge(org.organization.id, input.value),
        );
        output.textContent = t(
          'Type: TXT\nName: {0}\nValue: {1}\nPublish and verify before {2}.',
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
      button(t('Verify DNS'), async () => {
        const checked = object(
          await controller.verifyDomain(org.organization.id),
        );
        notice(
          checked['verified'] === true
            ? t('Domain control verified.')
            : t(
                'Code not found. Check the record and wait for DNS propagation.',
              ),
        );
      }),
      button(t('Unlink domain'), async () => {
        await controller.unlinkDomain(org.organization.id);
        section.remove();
        notice(t('Domain unlinked.'));
      }),
    );
    parent.append(section);
  }
  function mountSettings(container: HTMLElement): void {
    host = container;
    container.innerHTML = t('html.3dee5155ad6c');
    const card = container.querySelector<HTMLElement>('.card');
    if (!card) throw new Error('Representative panel unavailable.');
    container
      .querySelector('[data-representative-load]')
      ?.addEventListener('click', () => {
        void run(refresh);
      });
    // Creating is a step of its own, below the list (16/10/2026).
    const create = document.createElement('details');
    create.className = 'settings-subsection';
    const summary = document.createElement('summary');
    summary.textContent = t('representatives.new-organization');
    create.append(summary);
    card.append(create);
    const name = field(create, t('Organization name'));
    name.maxLength = 80;
    create.append(
      button(t('Create and sign organization'), async () => {
        await controller.create(name.value);
        name.value = '';
        renderOwned();
        notice(t('Organization registered.'));
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
        'Present an accepted authorization or send a representation invitation.',
      ),
    );
    noticeNode.dataset['representativeNotice'] = '';
    container.append(noticeNode);
    container.append(
      button(t('My authorizations'), async () => {
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
            'No authorizations available on this page. Create and issue them in Profile → Organizations and representatives.',
          ),
        ),
      );
    if (controller.hasMore)
      list.append(
        button(t('More authorizations'), async () => {
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
            ? t('Send authorization for acceptance')
            : t('Present authorization'),
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
          if ([t('Revoked'), t('Expired')].includes(state.status))
            throw new Error(state.status);
          await send(encodeRepresentativeCard(card));
          notice(t('Card sent through encrypted chat.'));
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
      parent.append(paragraph(t('Invalid authorization card.')));
      return true;
    }
    if (!card) return false;
    const c = card.credential,
      article = document.createElement('article');
    article.className = 'card';
    const state = paragraph(t('Not verified yet.'));
    state.setAttribute('role', 'status');
    article.append(
      paragraph(t('{0} — {1}', [c.organization.name, c.scope])),
      paragraph(
        t('Issuer: {0} · {1}', [
          c.organization.issuer.ecosystem,
          c.organization.issuer.address,
        ]),
      ),
      paragraph(
        t('Representative: {0} · {1}', [
          c.subject.ecosystem,
          c.subject.address,
        ]),
      ),
      paragraph(
        t('Until {0}', [
          new Date(c.expiresAt).toLocaleString(currentLanguage()),
        ]),
      ),
      paragraph(t('Verify again before using this authorization.')),
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
            'This card was forwarded. It does not prove that the sender is the representative.',
          ),
        ),
      );
    article.append(
      button(t('Verify authorization'), async () => {
        try {
          const checked = await controller.check(card);
          state.textContent =
            t('Lookup at {0}: {1}', [
              new Date().toLocaleString(currentLanguage()),
              checked.status,
            ]) +
            (checked.domain
              ? t(' · {0}: {1}', [
                  checked.domain,
                  checked.domainCurrent
                    ? t('Domain control verified')
                    : t('domain verification outdated or inconclusive'),
                ])
              : t(' · No linked domain. Issuer identified by wallet.'));
        } catch (error: unknown) {
          state.textContent = t('Current authorization not confirmed: {0}', [
            representativeFailure(error),
          ]);
        }
      }),
    );
    if (c.subject.accountId === session?.accountId && card.acceptance === null)
      article.append(
        button(t('Accept representation and sign'), async () => {
          try {
            await controller.accept(card);
            state.textContent = t(
              'Acceptance saved. You can present this authorization in conversations.',
            );
          } catch (error: unknown) {
            state.textContent = t('Acceptance not completed: {0}', [
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
