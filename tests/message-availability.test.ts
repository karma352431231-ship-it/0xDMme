import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMessageAvailability } from '../src/client/messages/interaction-availability.ts';

function control(ancestors: string[]) {
  return {
    disabled: false,
    closest: (selector: string) =>
      selector.split(',').some((part) => ancestors.includes(part.trim()))
        ? {}
        : null,
    matches: () => false,
  };
}

await test('a running operation never dims or disables photos and videos (13/11/2026)', () => {
  const photo = control(['.chat-attachment-preview']),
    video = control(['.chat-attachment-video']),
    menu = control([]);
  const host = {
    querySelectorAll: () => [photo, video, menu],
  } as unknown as HTMLElement;
  applyMessageAvailability([host], true);
  assert.equal(photo.disabled, false);
  assert.equal(video.disabled, false);
  assert.equal(menu.disabled, true, 'other mutations keep their busy lock');
  applyMessageAvailability([host], false);
  assert.equal(menu.disabled, false);
});
