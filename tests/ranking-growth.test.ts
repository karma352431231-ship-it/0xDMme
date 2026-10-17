import assert from 'node:assert/strict';
import test from 'node:test';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';
import { activeGrowth } from '../src/client/communities/ranking-side.ts';

await test('active growth is a raw percent against the previous 24 hours, never capped', () => {
  setActiveLanguage('en');
  assert.equal(activeGrowth(38, 29), '▲ 31% active');
  assert.equal(activeGrowth(8, 1), '▲ 700% active');
  assert.equal(activeGrowth(10_001, 1), '▲ 1,000,000% active');
  assert.equal(activeGrowth(40, 52), '▼ 23% active');
  assert.equal(activeGrowth(5, 5), '▲ 0% active');
});

await test('without a previous window it shows the new active members', () => {
  setActiveLanguage('en');
  assert.equal(activeGrowth(12, 0), '▲ +12 active');
  assert.equal(activeGrowth(0, 0), '0 active');
  setActiveLanguage('zh-CN');
  assert.equal(activeGrowth(12, 0), '▲ +12 位活跃');
  setActiveLanguage('en');
});
