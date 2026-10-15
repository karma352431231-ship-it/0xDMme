import { t } from '../../shared/i18n/index.ts';

interface WaitingWork {
  interactive: boolean;
  run: () => Promise<void>;
}

/** Submit only one native lock request at a time from this controller, so
 * interactive reads can precede queued maintenance. Four interactive turns
 * give way to one maintenance turn. Native cross-tab exclusivity remains intact.
 * At most 64 waiting operations; the existing 8s acquisition budget includes
 * time in this queue and time waiting for the native lock. */
export class AuthorityWork {
  private readonly waiting: WaitingWork[] = [];
  private running = false;
  private interactiveTurns = 0;

  run<T>(
    work: (waitMs: number) => Promise<T>,
    priority?: 'interactive',
  ): Promise<T> {
    if (this.waiting.length >= 64)
      return Promise.reject(
        new Error('Aguarde a atualização das conversas e tente novamente.'),
      );
    const deadline = performance.now() + 8000;
    return new Promise<T>((resolve, reject) => {
      const entry: WaitingWork = {
        interactive: priority === 'interactive',
        run: async () => {
          clearTimeout(timer);
          const remaining = Math.ceil(deadline - performance.now());
          if (remaining <= 0) {
            reject(
              new DOMException(
                t('Aguarde a atualização das conversas e tente novamente.'),
                'TimeoutError',
              ),
            );
            return;
          }
          try {
            resolve(await work(Math.min(8000, remaining)));
          } catch (error: unknown) {
            reject(
              error instanceof Error
                ? error
                : new Error('Não foi possível concluir a operação.'),
            );
          }
        },
      };
      const timer = setTimeout(() => {
        const index = this.waiting.indexOf(entry);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        reject(
          new DOMException(
            t('Aguarde a atualização das conversas e tente novamente.'),
            'TimeoutError',
          ),
        );
      }, 8000);
      this.waiting.push(entry);
      this.resume();
    });
  }
  private resume(): void {
    if (this.running) return;
    if (!this.waiting.length) {
      this.interactiveTurns = 0;
      return;
    }
    const index = this.next();
    const [entry] = this.waiting.splice(index, 1);
    this.running = true;
    void entry!.run().finally(() => {
      this.running = false;
      this.resume();
    });
  }
  private next(): number {
    const background = this.waiting.findIndex((work) => !work.interactive);
    const interactive = this.waiting.findIndex((work) => work.interactive);
    if (background >= 0 && this.interactiveTurns >= 4) {
      this.interactiveTurns = 0;
      return background;
    }
    if (interactive >= 0) {
      this.interactiveTurns++;
      return interactive;
    }
    this.interactiveTurns = 0;
    return 0;
  }
}
