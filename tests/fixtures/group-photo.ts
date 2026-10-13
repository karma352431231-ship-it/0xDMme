import { encode } from '../../src/shared/account/index.ts';
import { groupPhoto } from '../../src/shared/group-messages/index.ts';
/** Minimal JPEG header for validation contracts; actual browser tests use a decoded PNG. */
export function fixtureGroupPhoto(edge = 192) {
  const bytes = Uint8Array.from([
    255,
    216,
    255,
    192,
    0,
    11,
    8,
    edge >>> 8,
    edge & 255,
    edge >>> 8,
    edge & 255,
    1,
    1,
    17,
    0,
    255,
    218,
    0,
    8,
    1,
    1,
    0,
    0,
    63,
    0,
    0,
    255,
    217,
  ]);
  return groupPhoto({ type: 'image/jpeg', base64: encode(bytes) })!;
}
