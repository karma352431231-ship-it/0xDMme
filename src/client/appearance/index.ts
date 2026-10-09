/**
 * Appearance (docs/UI_PAINEIS_E_TEMAS.md): the device-only theme choice, which
 * never reaches the server or the vault, and how names and avatars are shown.
 */
export const themePreferenceKey = '0xdmme:theme';

export const themes = [
  { id: 'navy', label: 'Azul', hint: 'Cor da marca', chrome: '#0a0f22' },
  { id: 'black', label: 'Preto', hint: 'Preto puro', chrome: '#000000' },
  { id: 'white', label: 'Branco', hint: 'Fundo claro', chrome: '#f4f6fb' },
] as const;
export type Theme = (typeof themes)[number]['id'];
export const defaultTheme: Theme = 'navy';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage: PreferenceStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

function isTheme(value: string | null): value is Theme {
  return themes.some((theme) => theme.id === value);
}

/** Missing, unknown or unreadable values fall back to the brand theme without failing startup. */
export function storedTheme(storage: PreferenceStorage = browserStorage): {
  theme: Theme;
  problem: string;
} {
  try {
    const value = storage.getItem(themePreferenceKey);
    if (value === null || isTheme(value)) {
      return { theme: value ?? defaultTheme, problem: '' };
    }
    return {
      theme: defaultTheme,
      problem: 'Tema salvo inválido. Usando Azul; escolha outro abaixo.',
    };
  } catch {
    return {
      theme: defaultTheme,
      problem:
        'Este navegador não permite ler o tema salvo. Usando Azul nesta abertura.',
    };
  }
}

export function applyTheme(theme: Theme, root: Document = document): void {
  root.documentElement.dataset['theme'] = theme;
  const chrome = themes.find((item) => item.id === theme)?.chrome;
  root
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', chrome ?? themes[0].chrome);
}

/** Applies the saved choice; call before the first page render to limit the flash of the default theme. */
export function startAppearance(storage: PreferenceStorage = browserStorage): {
  mount: (container: HTMLElement) => void;
} {
  let { theme: current, problem } = storedTheme(storage);
  applyTheme(current);
  return {
    mount(container) {
      // Static authored markup; labels come only from the constant list above.
      container.innerHTML = `<fieldset class="appearance-options"><legend>Tema</legend>${themes
        .map(
          (theme) =>
            `<label class="appearance-option" data-theme-preview="${theme.id}"><input type="radio" name="appearance-theme" value="${theme.id}"${theme.id === current ? ' checked' : ''} /><span class="appearance-swatch" aria-hidden="true"></span><span><strong>${theme.label}</strong><small>${theme.hint}</small></span></label>`,
        )
        .join(
          '',
        )}</fieldset><p class="appearance-feedback" role="status"></p><p class="settings-test-note">A escolha fica salva só neste aparelho.</p>`;
      const feedback = container.querySelector<HTMLElement>(
        '.appearance-feedback',
      );
      if (feedback) feedback.textContent = problem;
      container.addEventListener('change', (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || !isTheme(input.value))
          return;
        current = input.value;
        applyTheme(current);
        try {
          storage.setItem(themePreferenceKey, current);
          problem = '';
        } catch {
          problem =
            'Não foi possível salvar neste aparelho. O tema vale até fechar o app.';
        }
        if (feedback) feedback.textContent = problem;
      });
    },
  };
}

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
