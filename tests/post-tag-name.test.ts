import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postTagName } from '../src/client/communities/presentation.ts';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';

await test('default tags follow the viewer language, including labels seeded in Portuguese', (t) => {
  t.after(() => setActiveLanguage('en'));
  const cases: [string, string, string][] = [
    ['Discussion', 'Discussion', '讨论'],
    ['Discussão', 'Discussion', '讨论'],
    [' opinião ', 'Opinion', '观点'],
    ['Memes', 'Memes', '梗图'],
    ['question', 'Question', '提问'],
    ['Event', 'Event', '活动'],
    ['Alpha calls', 'Alpha calls', 'Alpha calls'],
  ];
  for (const [label, english, chinese] of cases) {
    setActiveLanguage('en');
    assert.equal(postTagName(label), english, label);
    setActiveLanguage('zh-CN');
    assert.equal(postTagName(label), chinese, label);
  }
});
