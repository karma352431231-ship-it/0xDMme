import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  submitPostReply,
  togglePostVote,
} from '../src/client/communities/post-interactions.ts';
import { renderActivityEntry } from '../src/client/communities/activity-entry.ts';
import type {
  CommunityPost,
  PostState,
} from '../src/shared/community-posts/index.ts';

function post(): CommunityPost {
  return {
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    author: null,
    title: 'Título público',
    text: 'Conteúdo público',
    tags: [],
    createdAt: new Date().toISOString(),
    editedAt: null,
    revision: 1,
    status: 'visible',
    score: 3,
    replies: 2,
    parent: null,
    root: null,
  };
}
function state(value: CommunityPost): PostState {
  return {
    post: value,
    own: false,
    manager: false,
    canEdit: false,
    canDelete: false,
    content: null,
    removal: null,
    vote: { position: 1, revision: 4 },
  };
}
await test('voto no card usa posição/revisão privadas atuais e devolve o placar confirmado', async () => {
  const value = post(),
    current = state(value),
    changed = state({ ...value, score: 2 });
  const calls: { operation: string; payload: Record<string, unknown> }[] = [];
  const result = await togglePostVote(value, 1, {
    valid: () => true,
    controller: {
      request: (operation, payload) => {
        calls.push({ operation, payload });
        return Promise.resolve(operation === 'post-state' ? current : changed);
      },
    },
  });
  assert.equal(result?.post.score, 2);
  assert.deepEqual(calls[1], {
    operation: 'post-vote',
    payload: {
      id: value.community,
      post: value.id,
      position: 0,
      voteRevision: 4,
    },
  });
});
await test('responder a uma resposta preserva comunidade/pai direto e ID nas tentativas', async () => {
  const parent = {
      ...post(),
      parent: crypto.randomUUID(),
      root: crypto.randomUUID(),
    },
    id = crypto.randomUUID(),
    content = { title: '', text: 'Resposta', tags: [] },
    accepted = state({
      ...post(),
      id,
      community: parent.community,
      parent: parent.id,
      root: parent.root,
      title: '',
    });
  const payloads: Record<string, unknown>[] = [];
  const access = {
    valid: () => true,
    controller: {
      request: (operation: string, payload: Record<string, unknown>) => {
        assert.equal(operation, 'reply-create');
        payloads.push(payload);
        if (payloads.length === 1)
          return Promise.reject(new Error('Resposta HTTP perdida.'));
        return Promise.resolve(accepted);
      },
    },
  };
  const draft = { id, content: () => Promise.resolve(content) };
  await assert.rejects(submitPostReply(parent, draft, access), /perdida/u);
  assert.equal((await submitPostReply(parent, draft, access))?.post.id, id);
  assert.deepEqual(payloads, [
    { id: parent.community, post: id, parent: parent.id, content },
    { id: parent.community, post: id, parent: parent.id, content },
  ]);
});
await test('troca de perfil/sessão durante leitura ou preparo não publica nem atualiza card antigo', async () => {
  let valid = true,
    writes = 0;
  const parent = post(),
    access = {
      valid: () => valid,
      controller: {
        request: () => {
          writes++;
          valid = false;
          return Promise.resolve(state(parent));
        },
      },
    };
  assert.equal(await togglePostVote(parent, -1, access), null);
  assert.equal(writes, 1);
  valid = true;
  assert.equal(
    await submitPostReply(
      parent,
      {
        id: crypto.randomUUID(),
        content: () => {
          valid = false;
          return Promise.resolve({ title: '', text: 'Rascunho', tags: [] });
        },
      },
      access,
    ),
    null,
  );
  assert.equal(writes, 1);
});

class CardNode {
  readonly children: CardNode[] = [];
  readonly dataset: Record<string, string> = {};
  readonly classList = {
    add: (...names: string[]) => {
      this.className += ' ' + names.join(' ');
    },
  };
  className = '';
  textContent = '';
  href = '';
  parent: CardNode | null = null;
  readonly tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  get lastElementChild(): CardNode | undefined {
    return this.children.at(-1);
  }
  append(...nodes: CardNode[]): void {
    for (const node of nodes) node.parent = this;
    this.children.push(...nodes);
  }
  prepend(...nodes: CardNode[]): void {
    for (const node of nodes) node.parent = this;
    this.children.unshift(...nodes);
  }
  after(node: CardNode): void {
    const siblings = this.parent!.children;
    node.parent = this.parent;
    siblings.splice(siblings.indexOf(this) + 1, 0, node);
  }
  setAttribute(): void {}
  addEventListener(): void {}
  /** Class selectors only, depth first, as the code under test uses them. */
  querySelector(selector: string): CardNode | null {
    const name = selector.replace(/^\./u, '');
    for (const child of this.children) {
      if (child.className.split(' ').includes(name)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  texts(): string[] {
    return [
      this.textContent,
      ...this.children.flatMap((child) => child.texts()),
    ].filter(Boolean);
  }
}
function fakeDocument(t: { after: (done: () => void) => void }): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const anchor = Object.getOwnPropertyDescriptor(
    globalThis,
    'HTMLAnchorElement',
  );
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
    if (anchor) Object.defineProperty(globalThis, 'HTMLAnchorElement', anchor);
    else Reflect.deleteProperty(globalThis, 'HTMLAnchorElement');
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) => new CardNode(tag),
      createElementNS: (_namespace: string, tag: string) => new CardNode(tag),
      createTextNode: (text: string) =>
        Object.assign(new CardNode('#text'), { textContent: text }),
    },
  });
  // Post headers check for links; the fake nodes are never anchors.
  Object.defineProperty(globalThis, 'HTMLAnchorElement', {
    configurable: true,
    value: class {},
  });
}
await test('resposta no perfil é marcada como resposta e mostra inteira a postagem respondida', (t) => {
  fakeDocument(t);
  const root = {
    ...post(),
    title: 'Post original',
    text: 'Texto completo do post original',
  };
  const answered = {
    ...post(),
    community: root.community,
    title: '',
    text: 'Resposta intermediária respondida',
    parent: root.id,
    root: root.id,
  };
  const reply = {
    ...post(),
    community: root.community,
    title: '',
    text: 'Minha resposta',
    parent: answered.id,
    root: root.id,
  };
  const card = renderActivityEntry(
    {
      post: reply,
      community: { id: root.community, name: 'Comunidade' },
      context: { root, parent: answered },
    },
    new AbortController().signal,
  ) as unknown as CardNode;
  // No generic “Resposta” title: the chip and the answered post say it.
  assert.equal(
    card.children.some((node) => node.tag === 'h2'),
    false,
  );
  assert.ok(card.className.includes('community-post-is-reply'));
  assert.ok(card.querySelector('.post-kind-reply'));
  const context = card.querySelector('.replied-post')!;
  assert.ok(context.texts().includes('Resposta intermediária respondida'));
  const links = [
    context.querySelector('.replied-post-open'),
    context.querySelector('.replied-post-root'),
  ];
  assert.deepEqual(
    links.map((node) => node?.href),
    [
      `#comunidades?id=${root.community}&post=${answered.id}`,
      `#comunidades?id=${root.community}&post=${root.id}`,
    ],
  );
  // The answered post comes before the reply's own text.
  const order = card.children.map((node) => node.className);
  assert.ok(order.indexOf('replied-post') < order.indexOf('community-text'));
});
await test('atividade do perfil apresenta título, conteúdo e depois tag, conservando a comunidade', (t) => {
  fakeDocument(t);
  const value = {
    ...post(),
    tags: [
      {
        id: crypto.randomUUID(),
        label: 'Discussão',
        active: true,
        revision: 0,
      },
      {
        id: crypto.randomUUID(),
        label: 'Opinião',
        active: true,
        revision: 0,
      },
    ],
  };
  const card = renderActivityEntry(
    { post: value, community: { id: value.community, name: 'Comunidade' } },
    new AbortController().signal,
  ) as unknown as CardNode;
  const title = card.children.findIndex((node) => node.tag === 'h2'),
    body = card.children.findIndex(
      (node) => node.className === 'community-text',
    ),
    tag = card.children.findIndex((node) => node.className === 'post-tags');
  assert.ok(title >= 0 && body > title && tag > body);
  assert.deepEqual(
    card.children[tag]?.children.map((node) => node.href),
    value.tags.map(
      (item) => `#comunidades?id=${value.community}&tag=${item.id}`,
    ),
  );
});
