import { page, until } from './native-product-dom.ts';
import { nativeProductOutput } from './native-product-output.ts';

type Phase =
  | 'login'
  | 'restore'
  | 'profile-prepare'
  | 'profile-restore'
  | 'profile-check'
  | 'logout'
  | 'guest'
  | 'background'
  | 'action';
interface Run {
  run: string;
  phase: Phase;
  address: string;
  input: string;
  action: string;
}
interface DirectWindow extends Window {
  __zeroXNativeRun?: unknown;
  __zeroXSessionDocument?: string;
  __zeroXNativeBackgroundResumed?: boolean;
  syntheticNativeProduct?: {
    start: (name: string, input: string) => void;
    state: { status: string; value: string };
  };
  webkit?: {
    messageHandlers?: {
      zeroXProductTestResult?: {
        postMessage: (value: string) => Promise<unknown>;
      };
    };
  };
}

const host = window as DirectWindow;
type Step =
  | 'entry'
  | 'mounted'
  | 'account-page'
  | 'wallet-picker'
  | 'wallet-brand'
  | 'wallet-network'
  | 'authenticated'
  | 'private-ready'
  | 'complete';
let step: Step = 'entry';
const phases = new Set([
  'login',
  'restore',
  'profile-prepare',
  'profile-restore',
  'profile-check',
  'logout',
  'guest',
  'background',
  'action',
]);

function text(
  raw: Record<string, unknown>,
  key: string,
  maximum: number,
): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.length > maximum)
    throw new Error('Invalid direct native fixture configuration.');
  return value;
}

function runIdentity(run: string, address: string): void {
  if (!/^[a-f0-9-]{36}$/u.test(run) || !/^0x[a-f0-9]{40}$/u.test(address))
    throw new Error('Invalid direct native fixture identity.');
}

function configuration(): Run | undefined {
  const value = host.__zeroXNativeRun;
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object')
    throw new Error('Missing direct native fixture configuration.');
  const raw = value as Record<string, unknown>;
  const run = text(raw, 'run', 36);
  const phase = text(raw, 'phase', 24);
  const address = text(raw, 'address', 42);
  const input = text(raw, 'input', phase === 'action' ? 1024 : 80);
  const action = phase === 'action' ? text(raw, 'action', 64) : '';
  runIdentity(run, address);
  if (
    !phases.has(phase) ||
    (phase === 'action' && !/^[a-z][a-z-]{2,63}$/u.test(action))
  )
    throw new Error('Invalid direct native fixture identity.');
  return { run, phase: phase as Phase, address, input, action };
}

function mounted(): boolean {
  if (
    document
      .querySelector('body > [role=alert]')
      ?.textContent?.includes('The app connection could not start.')
  )
    throw new Error('The installed product entry failed.');
  return !!document.querySelector<HTMLElement>('#app-shell')?.dataset['page'];
}

async function activate(selector: string, signal: AbortSignal): Promise<void> {
  await until(() => {
    const control = document.querySelector<HTMLButtonElement>(selector);
    return (
      !!control &&
      !control.disabled &&
      !control.hidden &&
      control.getClientRects().length > 0
    );
  }, signal);
  document.querySelector<HTMLButtonElement>(selector)?.click();
}

async function originalWallet(run: Run, signal: AbortSignal): Promise<void> {
  await until(
    () =>
      document
        .querySelector<HTMLElement>('[data-account-address]')
        ?.title.toLowerCase() === `wallet evm: ${run.address}`,
    signal,
  );
}

async function login(run: Run, signal: AbortSignal): Promise<void> {
  await until(
    () =>
      document.querySelector('[data-account-status]')?.textContent !==
      'Verificando sessão…',
    signal,
  );
  if (
    document.querySelector<HTMLElement>('#app-shell')?.dataset['account'] ===
    'connected'
  ) {
    await originalWallet(run, signal);
    await activate('[data-logout]', signal);
    await until(
      () =>
        document.querySelector<HTMLElement>('#app-shell')?.dataset[
          'account'
        ] === 'guest',
      signal,
    );
  }
  await activate('[data-wallet-picker-toggle]', signal);
  step = 'wallet-picker';
  await activate('[data-wallet-brand=MetaMask]', signal);
  step = 'wallet-brand';
  await activate('[data-wallet=MetaMask]', signal);
  step = 'wallet-network';
}

async function action(
  name: string,
  input: string,
  signal: AbortSignal,
): Promise<string> {
  const port = host.syntheticNativeProduct;
  if (!port)
    throw new Error('The explicit fixture action driver is unavailable.');
  port.start(name, input);
  await until(() => port.state.status !== 'running', signal);
  if (port.state.status !== 'passed')
    throw new Error('The public product action failed.');
  return port.state.value;
}

function installedBoundary(): void {
  if (
    location.origin !== 'capacitor://localhost' ||
    !isSecureContext ||
    innerWidth > 500 ||
    document.cookie !== ''
  )
    throw new Error('The installed phone boundary did not hold.');
}

async function guest(signal: AbortSignal): Promise<string> {
  await until(
    () =>
      document.querySelector<HTMLElement>('#app-shell')?.dataset['account'] ===
      'guest',
    signal,
  );
  if (document.cookie !== '')
    throw new Error('WebView cookie isolation failed after logout.');
  step = 'complete';
  return '';
}

async function scenario(run: Run, signal: AbortSignal): Promise<string> {
  await until(mounted, signal);
  step = 'mounted';
  installedBoundary();
  await page('perfil', '[data-account-status]', signal);
  step = 'account-page';
  if (run.phase === 'guest') return guest(signal);
  if (run.phase === 'login') await login(run, signal);
  await until(
    () =>
      document.querySelector<HTMLElement>('#app-shell')?.dataset['account'] ===
      'connected',
    signal,
  );
  step = 'authenticated';
  await until(
    () =>
      document.querySelector<HTMLElement>('[data-private-profile]')?.hidden ===
      false,
    signal,
  );
  await originalWallet(run, signal);
  step = 'private-ready';
  if (run.phase === 'background') {
    await until(() => host.__zeroXNativeBackgroundResumed === true, signal);
    await originalWallet(run, signal);
  }
  if (run.phase === 'logout') {
    await activate('[data-logout]', signal);
    return guest(signal);
  }
  if (run.phase === 'profile-prepare') {
    await action('profile-save', run.input, signal);
    await action('theme-save', '', signal);
  }
  if (run.phase === 'profile-restore') {
    await action('profile-check', run.input, signal);
    await action('theme-check', '', signal);
  }
  if (run.phase === 'profile-check')
    await action('profile-check', run.input, signal);
  const output = await featureAction(run, signal);
  if (document.cookie !== '')
    throw new Error('WebView cookie isolation failed.');
  step = 'complete';
  return output;
}

async function featureAction(run: Run, signal: AbortSignal): Promise<string> {
  if (run.phase !== 'action') return '';
  const value = await action(run.action, run.input, signal);
  const output = nativeProductOutput(run.action, value);
  await page('perfil', '[data-account-status]', signal);
  await until(
    () =>
      document.querySelector<HTMLElement>('[data-private-profile]')?.hidden ===
      false,
    signal,
  );
  await originalWallet(run, signal);
  return output;
}

async function report(
  run: Run,
  passed: boolean,
  output: string,
): Promise<void> {
  const reporter = host.webkit?.messageHandlers?.zeroXProductTestResult;
  if (!reporter) throw new Error('Native test observation is unavailable.');
  const reply = await reporter.postMessage(
    JSON.stringify({
      run: run.run,
      phase: run.phase,
      nonce: host.__zeroXSessionDocument ?? '',
      passed,
      reason: passed ? '' : 'ui-phase-failed',
      ...(run.phase === 'action' ? { output } : {}),
    }),
  );
  if (reply !== true) throw new Error('Native test observation was rejected.');
}

/** Phase/action deadlines stay in this fixture; reports contain no UI text,
 * cookie values, keys or decrypted data. Native code independently checks UI.
 */
async function execute(run: Run): Promise<void> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 240_000);
  window.addEventListener('pagehide', cancel, { once: true });
  let passed: boolean;
  let output = '';
  try {
    output = await scenario(run, controller.signal);
    passed = true;
  } catch {
    passed = false;
  } finally {
    clearTimeout(timer);
    window.removeEventListener('pagehide', cancel);
  }
  try {
    await report(run, passed, passed ? output : '');
  } catch {
    console.error('Native test observation was not acknowledged.');
  }
}

const run = configuration();
if (run) {
  Object.defineProperty(host, '__zeroXNativeStep', { get: () => step });
  await execute(run);
}
