import { t } from '../../shared/i18n/index.ts';
import { showToast } from '../toast/index.ts';

/** A run of public text, marked when it is a token contract address. */
export interface ContractPart {
  text: string;
  contract: boolean;
}

// EVM addresses (0x + 40 hex) and Solana base58 addresses (32–44 characters),
// never in the middle of a longer word.
const candidates =
  /(?<![0-9A-Za-z])(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})(?![0-9A-Za-z])/gu;

/** Base58 runs need both letter cases, which plain long words rarely have. */
function contractAddress(value: string): boolean {
  if (value.startsWith('0x')) return true;
  return /[A-Z]/u.test(value) && /[a-z]/u.test(value);
}

/**
 * Splits text into plain runs and contract addresses (owner request,
 * 20/11/2026: contracts in public text get a copy button beside them).
 */
export function contractParts(text: string): ContractPart[] {
  const parts: ContractPart[] = [];
  let end = 0;
  for (const match of text.matchAll(candidates)) {
    if (!contractAddress(match[0])) continue;
    if (match.index > end)
      parts.push({ text: text.slice(end, match.index), contract: false });
    parts.push({ text: match[0], contract: true });
    end = match.index + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end), contract: false });
  return parts;
}

/** Plain text with each contract address followed by its copy button. */
export function appendContractText(host: HTMLElement, text: string): void {
  for (const part of contractParts(text))
    host.append(
      part.contract
        ? contractAddressElement(part.text)
        : document.createTextNode(part.text),
    );
}

function contractAddressElement(address: string): HTMLElement {
  const node = document.createElement('span'),
    value = document.createElement('span'),
    copy = document.createElement('button');
  node.className = 'contract-address';
  value.className = 'contract-address-text';
  value.textContent = address;
  copy.type = 'button';
  copy.className = 'contract-copy';
  copy.setAttribute('aria-label', t('Copy contract'));
  copy.title = t('Copy contract');
  copy.append(copyIcon());
  copy.addEventListener('click', (event) => {
    // Cards open their post on click; the copy stays a copy.
    event.preventDefault();
    event.stopPropagation();
    void navigator.clipboard.writeText(address).then(
      () => showToast(t('Contract copied.'), { success: true }),
      () => showToast(t('Could not copy the contract.')),
    );
  });
  node.append(value, copy);
  return node;
}

function copyIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const [x, y] of [
    ['9', '9'],
    ['4', '4'],
  ] as const) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', '11');
    rect.setAttribute('height', '11');
    rect.setAttribute('rx', '2');
    svg.append(rect);
  }
  return svg;
}
