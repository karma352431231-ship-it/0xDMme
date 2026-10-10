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
    tag: null,
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
    content = { title: '', text: 'Resposta', tag: null },
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
          return Promise.resolve({ title: '', text: 'Rascunho', tag: null });
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
  readonly tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  get lastElementChild(): CardNode | undefined {
    return this.children.at(-1);
  }
  append(...nodes: CardNode[]): void {
    this.children.push(...nodes);
  }
  prepend(...nodes: CardNode[]): void {
    this.children.unshift(...nodes);
  }
  setAttribute(): void {}
}
await test('atividade do perfil apresenta título, conteúdo e depois tag, conservando a comunidade', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
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
  const value = {
    ...post(),
    tag: {
      id: crypto.randomUUID(),
      label: 'Discussão',
      active: true,
      revision: 0,
    },
  };
  const card = renderActivityEntry(
    { post: value, community: { id: value.community, name: 'Comunidade' } },
    new AbortController().signal,
  ) as unknown as CardNode;
  const title = card.children.findIndex((node) => node.tag === 'h2'),
    body = card.children.findIndex(
      (node) => node.className === 'community-text',
    ),
    tag = card.children.findIndex((node) =>
      node.className.includes('post-tag'),
    );
  assert.ok(title >= 0 && body > title && tag > body);
  assert.equal(
    card.children[tag]?.href,
    `#comunidades?id=${value.community}&tag=${value.tag.id}`,
  );
});
