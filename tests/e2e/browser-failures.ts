import type { BrowserContext, Page, Request } from '@playwright/test';

interface EngineError {
  browser: string;
  origin: string;
  provisional: boolean;
  message: string;
}
const owners = new WeakMap<BrowserContext, BrowserFailures>();

/** WebKit r2370 reports a caught, undispatched fetch cancellation as pageerror.
 * Keep this exact provisional-navigation diagnostic separate from exceptions.
 * Provenance: https://github.com/microsoft/playwright/issues/43120
 */
function navigationTransport(input: EngineError): boolean {
  if (input.browser !== 'webkit' || !input.provisional) return false;
  const match =
    /^Fetch API cannot load (\S+) due to access control checks\.$/u.exec(
      input.message,
    );
  if (!match) return false;
  try {
    const url = new URL(match[1]!);
    return (
      url.origin === input.origin &&
      url.pathname === '/api/account/devices/read' &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

/** One context owns native failures, engine diagnostics and listener disposal.
 * Only fixed counters escape; error text, URLs and page contents are not kept. */
export class BrowserFailures {
  private nativeErrors = 0;
  private nativeRejections = 0;
  private engineErrors = 0;
  private navigationDiagnostics = 0;
  private overflow = false;
  private events = 0;
  private active = true;
  private readonly disposals: (() => void)[] = [];
  private room(): boolean {
    if (++this.events <= 10_000) return true;
    this.overflow = true;
    return false;
  }
  native(kind: 'error' | 'unhandledrejection'): void {
    if (!this.active || !this.room()) return;
    if (kind === 'error') this.nativeErrors++;
    else this.nativeRejections++;
  }
  engine(input: EngineError): void {
    if (!this.active || !this.room()) return;
    if (navigationTransport(input)) this.navigationDiagnostics++;
    else this.engineErrors++;
  }
  get errors(): readonly string[] {
    return [
      ...(this.nativeErrors ? ['Unhandled browser error'] : []),
      ...(this.nativeRejections ? ['Unhandled browser rejection'] : []),
      ...(this.engineErrors ? ['Unexpected browser engine error'] : []),
      ...(this.overflow ? ['Browser failure observation budget exceeded'] : []),
    ];
  }
  report() {
    return {
      nativeErrors: this.nativeErrors,
      nativeRejections: this.nativeRejections,
      unexpectedEngineErrors: this.engineErrors,
      provisionalNavigationTransportDiagnostics: this.navigationDiagnostics,
      overflow: this.overflow,
    };
  }
  async install(context: BrowserContext): Promise<void> {
    if (owners.has(context))
      throw new Error('Browser context already observed.');
    owners.set(context, this);
    this.disposals.push(() => owners.delete(context));
    await context.exposeBinding(
      'chatE2ENativeFailure',
      (_source, kind: unknown) => {
        if (kind === 'error' || kind === 'unhandledrejection')
          this.native(kind);
      },
    );
    await context.addInitScript(() => {
      const host = window as unknown as {
        chatE2ENativeFailure: (kind: string) => Promise<void>;
      };
      for (const kind of ['error', 'unhandledrejection'])
        window.addEventListener(kind, () => {
          void host.chatE2ENativeFailure(kind).catch(() => {
            /* The old document's binding can close during disposal. */
          });
        });
    });
    const watch = (page: Page) => this.watch(page, context);
    context.on('page', watch);
    this.disposals.push(() => context.off('page', watch));
    for (const page of context.pages()) watch(page);
  }
  private watch(page: Page, context: BrowserContext): void {
    let provisional: Request | null = null;
    const start = (request: Request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        provisional = request;
    };
    const failed = (request: Request) => {
      if (request === provisional) provisional = null;
    };
    const commit = (frame: ReturnType<Page['mainFrame']>) => {
      if (frame === page.mainFrame()) provisional = null;
    };
    const engine = (error: Error) =>
      this.engine({
        browser: context.browser()?.browserType().name() ?? '',
        origin: new URL(page.url()).origin,
        provisional: provisional !== null,
        // Playwright splits WebKit's URL colon into Error.name/message.
        // Its stack heading preserves the exact original engine diagnostic.
        message: error.stack?.split('\n')[0] ?? error.message,
      });
    const close = () => {
      provisional = null;
    };
    page.on('request', start);
    page.on('requestfailed', failed);
    page.on('framenavigated', commit);
    page.on('pageerror', engine);
    page.on('close', close);
    this.disposals.push(() => {
      close();
      page.off('request', start);
      page.off('requestfailed', failed);
      page.off('framenavigated', commit);
      page.off('pageerror', engine);
      page.off('close', close);
    });
  }
  stop(): void {
    this.active = false;
    for (const dispose of this.disposals.splice(0)) dispose();
  }
}
export function browserFailures(context: BrowserContext): BrowserFailures {
  const owner = owners.get(context);
  if (!owner) throw new Error('Owned browser failure observer missing.');
  return owner;
}
