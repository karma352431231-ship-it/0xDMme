import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moderationPreviewDocument } from '../src/tools/moderation-preview-document.ts';
import {
  currentLanguage,
  setActiveLanguage,
} from '../src/shared/i18n/index.ts';

await test('private preview localizes authored text without scripts, changing media URLs or echoing language headers', () => {
  const path = '/' + 'a'.repeat(64);
  for (const [header, language] of [
    ['zh-CN,en;q=0.8', 'zh-CN'],
    ['pt-BR,en;q=0.8,zh;q=0.5', 'en'],
    ['<script>PRIVATE</script>', 'en'],
  ] as const) {
    const html = moderationPreviewDocument({
      type: 'image/png',
      path,
      acceptLanguage: header,
    });
    assert.ok(html.includes(`<html lang="${language}">`));
    assert.ok(html.includes(`src="${path}/file"`));
    assert.doesNotMatch(html, /<script|PRIVATE|pt-BR/iu);
    assert.match(
      html,
      language === 'en'
        ? /Explicit sexual acts remain prohibited/u
        : /露骨性行为仍被禁止/u,
    );
  }
  setActiveLanguage('zh-CN');
  const video = moderationPreviewDocument({
    type: 'video/mp4',
    path,
    acceptLanguage: 'en',
  });
  assert.ok(video.includes(`<video controls src="${path}/file">`));
  assert.equal(currentLanguage(), 'zh-CN');
  setActiveLanguage('en');
});
