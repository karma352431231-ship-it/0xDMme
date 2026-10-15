import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  communityDirectoryProblem,
  clearCommunityProfileInvitation,
} from '../src/client/communities/directory-notice.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';

await test('missing public profile offers a localized direct setup link; unrelated failures keep their diagnostic', (context) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const document = communityDocument();
  const mobile = new CommunityNode();
  document.querySelector = (selector) =>
    selector === '[data-community-profile-notice]' ? mobile : null;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  });
  context.after(() => {
    setActiveLanguage('en');
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const input = {
    operation: 'communities/list',
    status: 403,
    failure: 'http' as const,
    responseType: 'json' as const,
    message: 'Crie seu perfil público em Perfil antes de participar.',
  };
  for (const [language, title, text] of [
    ['en', 'Want to participate?', 'Create your public profile here'],
    ['zh-CN', '想参与讨论？', '在此创建你的公开个人资料'],
  ] as const) {
    setActiveLanguage(language);
    const host = new CommunityNode();
    communityDirectoryProblem(
      host as unknown as HTMLElement,
      new ApiResponseError(input),
    );
    const link = host.querySelector('a') as CommunityNode & { href: string };
    assert.equal(host.querySelector('strong')?.textContent, title);
    assert.equal(link.textContent, text);
    assert.equal(link.href, '#settings?section=profile');
    assert.equal(host.textContent.includes('HTTP'), false);
    assert.equal(mobile.hidden, false);
    assert.equal(mobile.querySelector('a')?.textContent, text);
    clearCommunityProfileInvitation();
    assert.equal(mobile.hidden, true);
    assert.equal(mobile.children.length, 0);
  }
  for (const changes of [
    { message: 'Aparelho revogado.' },
    { status: 500 },
    { operation: 'communities/read' },
  ]) {
    const error = new ApiResponseError({ ...input, ...changes });
    const host = new CommunityNode();
    communityDirectoryProblem(host as unknown as HTMLElement, error);
    assert.equal(host.querySelector('a'), null);
    assert.ok(host.textContent.includes(`HTTP ${error.status}`));
  }
});
