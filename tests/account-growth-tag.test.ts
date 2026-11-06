import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountGrowthTag } from '../src/client/communities/account-growth-tag.ts';

const now = Date.parse('2026-11-06T12:00:00Z');
const hours = (n: number) => new Date(now - n * 3_600_000).toISOString();
const row = (patch: Record<string, unknown> = {}) => ({
  score: 200,
  previousScore: 100,
  shares: 0,
  growth: { newFollowers: 0, createdAt: hours(100) },
  ...patch,
});

await test('growth tags follow their priority and the 48-hour new window', () => {
  for (const [patch, tag] of [
    // New wins for 48 hours, even without growth.
    [
      {
        score: 0,
        previousScore: 0,
        growth: { newFollowers: 0, createdAt: hours(47) },
      },
      'new',
    ],
    [{ growth: { newFollowers: 0, createdAt: hours(49) } }, 'trending'],
    [{ score: 500, previousScore: 100 }, 'skyrocketing'],
    [{ shares: 5 }, 'viral'],
    [{ growth: { newFollowers: 5, createdAt: hours(100) } }, 'followers'],
    [{ shares: 5, score: 500, previousScore: 100 }, 'skyrocketing'],
    // Losing or standing still shows no tag; no record means an old profile.
    [{ score: 50 }, null],
    [{ score: 100 }, null],
    [{ score: 0, previousScore: 0 }, null],
    [{ growth: undefined }, 'trending'],
    [{ growth: { newFollowers: 0, createdAt: null } }, 'trending'],
  ] as const)
    assert.equal(accountGrowthTag(row(patch), now), tag, JSON.stringify(patch));
});
