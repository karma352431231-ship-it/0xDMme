import { fetchApi, readApiJson } from '../api-response/index.ts';
import { uuid } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';

/**
 * State shared by the parts of the account screen (picker, approval, login,
 * private profile and view). Each part keeps its own details; only these
 * fields cross between them.
 */
export interface AccountCore {
  session: AccountSession | null;
  /** Message of the account card and of the sidebar. */
  status: string;
  profileStatus: string;
  /** One wallet or profile operation at a time. */
  busy: boolean;
  /** Bumped whenever a pending wallet result must be discarded. */
  epoch: number;
  disposed: boolean;
  /** Keeps the picker open with a session, to confirm the account's wallet. */
  forcePicker: boolean;
  mounted: HTMLElement | null;
  mountMode: 'settings' | 'login';
}

export function createCore(): AccountCore {
  return {
    session: null,
    status: 'Conecte sua wallet para entrar.',
    profileStatus: '',
    busy: false,
    epoch: 0,
    disposed: false,
    forcePicker: false,
    mounted: null,
    mountMode: 'settings',
  };
}

export function node<T extends HTMLElement>(
  core: AccountCore,
  selector: string,
): T | null {
  return core.mounted?.querySelector<T>(selector) ?? null;
}

export async function api(
  path: string,
  options: { input?: unknown; csrf?: string } = {},
): Promise<unknown> {
  const response = await fetchApi(`account/${path}`, `/api/account/${path}`, {
    method: options.input === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers:
      options.input === undefined
        ? {}
        : {
            'Content-Type': 'application/json',
            ...(options.csrf ? { 'X-Hash-Talk-CSRF': options.csrf } : {}),
          },
    ...(options.input === undefined
      ? {}
      : { body: JSON.stringify(options.input) }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await readApiJson(response, `account/${path}`);
  return data;
}

export function deviceId(): string {
  const stored = localStorage.getItem('hash-talk:login-device');
  if (stored) return uuid(stored);
  const id = crypto.randomUUID();
  localStorage.setItem('hash-talk:login-device', id);
  return id;
}
