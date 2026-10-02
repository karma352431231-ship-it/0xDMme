import encodeQR from 'qr';
import decodeQR from 'qr/decode.js';
import { canonical, linkCode } from '../../shared/devices/index.ts';
import type { LinkCode } from '../../shared/devices/index.ts';

export type QrKind = 'link' | 'receipt';
const prefix = { link: '0xdmme-link:1:', receipt: '0xdmme-confirm:1:' };
const frameMisses = new Set([
  'data',
  'dimension',
  'finder',
  'format',
  'alignment',
  'rs',
  'timing',
  'version',
]);

export function qrLink(code: LinkCode): string {
  return prefix.link + canonical(linkCode(code));
}
export function qrReceipt(receipt: string): string {
  if (!/^[a-f0-9]{32}$/u.test(receipt))
    throw new Error('Confirmação inválida para QR Code.');
  return prefix.receipt + receipt;
}
export function readQrPayload(payload: string, kind: QrKind): string {
  if (payload.length > 4096 || !payload.startsWith(prefix[kind]))
    throw new Error('Este QR Code não corresponde à etapa de vinculação.');
  const value = payload.slice(prefix[kind].length);
  if (kind === 'link') return canonical(linkCode(JSON.parse(value) as unknown));
  if (!/^[a-f0-9]{32}$/u.test(value))
    throw new Error('QR de confirmação inválido.');
  return value;
}
export function qrMatrix(payload: string): boolean[][] {
  if (payload.length > 4096) throw new Error('QR Code excedido.');
  return encodeQR(payload, 'raw', { ecc: 'medium', border: 4 });
}
export function renderQr(container: HTMLElement, payload: string): void {
  if (container.dataset['qrPayload'] === payload) return;
  const matrix = qrMatrix(payload);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${matrix.length} ${matrix.length}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR Code de vinculação de aparelho');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const cells: string[] = [];
  matrix.forEach((row, y) =>
    row.forEach((black, x) => {
      if (black) cells.push(`M${x} ${y}h1v1h-1z`);
    }),
  );
  path.setAttribute('d', cells.join(''));
  path.setAttribute('fill', '#000');
  svg.append(path);
  container.replaceChildren(svg);
  container.dataset['qrPayload'] = payload;
}
export function decodeQrFrame(frame: ImageData): string | null {
  if (frame.width > 960 || frame.height > 960 || !frame.width || !frame.height)
    throw new Error('Imagem excede o orçamento do leitor.');
  try {
    return decodeQR(frame, { effort: 2, timeLimit: 16 });
  } catch (error: unknown) {
    // These documented frame misses are checked against the pinned package.
    // Input/resource/programming failures must terminate the camera operation.
    if (error instanceof Error && frameMisses.has(error.message)) return null;
    throw error;
  }
}
