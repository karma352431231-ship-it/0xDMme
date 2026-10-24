import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { BrowserContext, Request } from '@playwright/test';

// Match request-budget/index.ts without altering its six-challenges/minute gate.
const challengePaths = new Set([
  '/api/account/challenge',
  '/api/account/handoff-start',
  '/api/account/handoff-challenge',
  '/api/account/recovery-start',
  '/api/account/enrollment-join',
]);
// Two wallet logins use four challenges; real device linking can use one more.
const setupChallenges = 5;
const windowMs = 61_000;
const now = () => Number(process.hrtime.bigint() / 1_000_000n);
export class LoginAdmission {
  private observed = 0;
  private readonly path: string;
  constructor(directory: string) {
    this.path = join(directory, 'login-admission.json');
  }
  async prepare(): Promise<void> {
    const previous = await this.read();
    let recent = previous.filter((at) => now() - at < windowMs);
    if (recent.length + setupChallenges > 6) {
      const releaseAt = recent[recent.length + setupChallenges - 7]! + windowMs;
      // Wait BEFORE the UI action: account requests have their own 8s deadline.
      await delay(Math.max(0, releaseAt - now()));
      recent = recent.filter((at) => now() - at < windowMs);
    }
    await writeFile(
      this.path,
      JSON.stringify([
        ...recent,
        ...Array<number>(setupChallenges).fill(now()),
      ]),
      { mode: 0o600 },
    );
  }
  async completed(): Promise<void> {
    // Conservatively start the next wait after setup's LAST real challenge.
    // Worker replacement still sees the initial reservation if setup fails.
    await writeFile(
      this.path,
      JSON.stringify(Array<number>(setupChallenges).fill(now())),
      {
        mode: 0o600,
      },
    );
  }
  attach(context: BrowserContext): void {
    const observe = (request: Request) => {
      if (challengePaths.has(new URL(request.url()).pathname)) this.observed++;
    };
    context.on('request', observe);
    context.once('close', () => context.off('request', observe));
  }
  assertWithinReservation(): void {
    if (this.observed > setupChallenges)
      throw new Error('Account setup exceeded its reserved login budget.');
  }
  private async read(): Promise<number[]> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      if (
        !Array.isArray(value) ||
        value.length > 6 ||
        value.some(
          (at: unknown) => typeof at !== 'number' || !Number.isFinite(at),
        )
      )
        throw new Error('Invalid private login-admission state.');
      return value as number[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}
