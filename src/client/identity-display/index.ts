/** Presentation-only helpers for names, wallets and photo-less avatars; computed locally, nothing is fetched. */
const avatarTones = 6;
const evmAddress = /^0x[0-9a-f]{40}$/iu;
const base58Address = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;

export function isWalletAddress(label: string): boolean {
  return evmAddress.test(label) || base58Address.test(label);
}

/** Full addresses stay available in titles, copy actions and search; lists show the short form. */
export function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

/** Wallets without a chosen name display the short address instead of 42 characters. */
export function displayName(label: string): string {
  return isWalletAddress(label) ? shortAddress(label) : label;
}

export function avatarInitials(label: string): string {
  const text = label.trim();
  if (evmAddress.test(text)) return text.slice(2, 4).toUpperCase();
  if (base58Address.test(text)) return text.slice(0, 2).toUpperCase();
  const words = text.split(/\s+/u).filter(Boolean);
  const initials =
    words.length > 1
      ? words
          .slice(0, 2)
          .map((word) => [...word][0] ?? '')
          .join('')
      : [...text].slice(0, 2).join('');
  return initials.toLocaleUpperCase('pt-BR') || '#';
}

/** FNV-1a keeps the same tone for the same address on every device and render. */
export function avatarTone(seed: string): string {
  let hash = 0x811c9dc5;
  for (const char of seed.toLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return String(hash % avatarTones);
}

export function paintAvatar(
  element: HTMLElement,
  input: { label: string; seed: string },
): void {
  element.textContent = avatarInitials(input.label);
  element.dataset['tone'] = avatarTone(input.seed);
}
