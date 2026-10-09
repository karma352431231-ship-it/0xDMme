/** Device-only theme choice (docs/UI_PAINEIS_E_TEMAS.md); it never reaches the server or the vault. */
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
