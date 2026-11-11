import { base64, encode } from '../../shared/account/index.ts';
import {
  readViewOnceContent,
  viewOnceCipherBytes,
} from '../../shared/view-once/index.ts';
import type {
  ViewOnceContent,
  ViewOnceHeader,
} from '../../shared/view-once/index.ts';
import { originalImageType } from '../attachment-images/index.ts';
import {
  viewOnceSelectionMime,
  viewOnceVideoType,
} from '../view-once-media/index.ts';
export interface ValidatedViewOnce {
  content: ViewOnceContent;
  policy: ViewOnceHeader['policy'];
  legacyPolicy: ViewOnceHeader['policy'];
  fileBytes: number;
  validationMs: number;
  policyMs: number;
}
/** Pure transforms for the short-lived local worker. No keys, authority,
 * persistence, SDK machines, network or retained content live here. */
export function validateViewOnce(
  input: unknown,
  base64Timing?: (ms: number) => void,
): ValidatedViewOnce {
  const result = validateViewOnceMedia(input, base64Timing);
  try {
    return result.prepared;
  } finally {
    result.bytes?.fill(0);
  }
}
/** The successful caller owns and must wipe the validated media buffer. */
export function validateViewOnceMedia(
  input: unknown,
  base64Timing?: (ms: number) => void,
): {
  prepared: ValidatedViewOnce;
  bytes: Uint8Array<ArrayBuffer> | null;
} {
  const started = performance.now();
  const { content, bytes } = readViewOnceContent(input, base64Timing);
  const validationMs = Math.round(performance.now() - started);
  const policyStart = performance.now();
  try {
    const policies = contentPolicies(content, bytes);
    return {
      bytes,
      prepared: {
        content,
        fileBytes: bytes?.length ?? 0,
        ...policies,
        validationMs,
        policyMs: Math.round(performance.now() - policyStart),
      },
    };
  } catch (error: unknown) {
    bytes?.fill(0);
    throw error;
  }
}
function contentPolicies(
  content: ViewOnceContent,
  bytes: Uint8Array | null,
): Pick<ValidatedViewOnce, 'policy' | 'legacyPolicy'> {
  if (!content.file || !bytes)
    return { policy: 'mobile', legacyPolicy: 'mobile' };
  const image =
    content.file.mime.startsWith('image/') || !!originalImageType(bytes);
  return {
    policy:
      image || viewOnceVideoType(bytes) === content.file.mime
        ? 'mobile'
        : 'file',
    legacyPolicy: image ? 'mobile' : 'file',
  };
}
export function selectionContents(input: {
  text: string;
  file: { name: string; type: string; bytes: Uint8Array } | null;
  maximum: number;
}): ValidatedViewOnce[] {
  const file = input.file;
  if (file && file.bytes.length > input.maximum)
    throw new Error('File exceeds this conversation’s limit.');
  const content = validateViewOnce({
    text: input.text,
    ...(file
      ? {
          file: {
            name: file.name,
            mime: viewOnceSelectionMime(file.bytes, file.name, file.type),
            data: encode(file.bytes),
          },
        }
      : {}),
  });
  if (content.policy === 'file' && input.text.trim())
    return [
      validateViewOnce({ text: input.text }),
      { ...content, content: { ...content.content, text: '' } },
    ];
  return [content];
}
export function serializeViewOnce(
  input: ValidatedViewOnce,
): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(input.content));
  if (bytes.length + 16 <= viewOnceCipherBytes) return bytes;
  bytes.fill(0);
  throw new Error('View-once content exceeds the limit.');
}
export function draftChunks(input: ValidatedViewOnce): string[] {
  const bytes = serializeViewOnce(input);
  try {
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 64 * 1024)
      chunks.push(encode(bytes.subarray(offset, offset + 64 * 1024)));
    return chunks;
  } finally {
    bytes.fill(0);
  }
}
export function openDraft(chunks: readonly string[]): ValidatedViewOnce {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parts: string[] = [];
  let length = 0;
  try {
    for (const chunk of chunks) {
      const bytes = base64(chunk, 64 * 1024);
      length += bytes.length;
      if (length + 16 > viewOnceCipherBytes) {
        bytes.fill(0);
        throw new Error('View-once draft exceeds the limit.');
      }
      parts.push(decodeDraftPart(decoder, bytes));
    }
    parts.push(decoder.decode());
    return validateViewOnce(JSON.parse(parts.join('')) as unknown);
  } finally {
    parts.fill('');
  }
}
function decodeDraftPart(decoder: TextDecoder, bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes, { stream: true });
  } finally {
    bytes.fill(0);
  }
}
