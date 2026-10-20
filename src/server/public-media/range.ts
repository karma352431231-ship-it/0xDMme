import { AccountError } from '../../shared/account/index.ts';

export interface MediaRange {
  start: number;
  end: number;
}

/** RFC 9110 section 14: one byte range; unsupported units/multipart fall back to GET. */
export function mediaRange(
  header: string | undefined,
  length: number,
): MediaRange | null {
  if (!header || !/^bytes=/iu.test(header) || header.includes(',')) return null;
  const match = /^bytes=(\d*)-(\d*)$/iu.exec(header);
  if (!match || (!match[1] && !match[2])) return unsatisfied();
  if (!match[1]) return suffixRange(match[2]!, length);
  return explicitRange(match[1], match[2]!, length);
}

function suffixRange(value: string, length: number): MediaRange {
  const suffix = BigInt(value),
    size = BigInt(length);
  if (suffix === 0n) return unsatisfied();
  return {
    start: Number(suffix >= size ? 0n : size - suffix),
    end: length - 1,
  };
}

function explicitRange(
  first: string,
  last: string,
  length: number,
): MediaRange {
  const start = BigInt(first),
    size = BigInt(length);
  const end = last ? BigInt(last) : size - 1n;
  if (start >= size || end < start) return unsatisfied();
  return { start: Number(start), end: Number(end >= size ? size - 1n : end) };
}

function unsatisfied(): never {
  throw new AccountError(416, 'Public media unavailable.');
}
