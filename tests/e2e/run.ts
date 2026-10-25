import { chromium, firefox, webkit } from '@playwright/test';
import { existsSync } from 'node:fs';
import { startEnvironment } from './fixtures/environment.ts';
import {
  startProcess,
  stopProcess,
  processExit,
  signalProcess,
} from './fixtures/process.ts';
import { retainArtifacts, summarize } from './artifacts.ts';
import { dirname } from 'node:path';
import budgets from './chat-budgets.ts';

const args = process.argv.slice(2);
const performanceRun = args.includes('--performance');
const controller = new AbortController();
let child: ReturnType<typeof startProcess> | undefined;
let environment: Awaited<ReturnType<typeof startEnvironment>> | undefined;
let killTimer: ReturnType<typeof setTimeout> | undefined;
const failures: unknown[] = [];
const stop = () => {
  if (controller.signal.aborted) return;
  controller.abort();
  if (!child) return;
  signalProcess(child, 'SIGINT');
  killTimer = setTimeout(() => {
    if (child) signalProcess(child, 'SIGKILL');
  }, 15_000);
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
process.once('SIGHUP', stop);
try {
  checkBrowsers(args);
  if (args.some((arg) => /^--(?:workers|fully-parallel)(?:=|$)/u.test(arg)))
    throw new Error('The owned fixture requires the configured single worker.');
  if (budgets.latency.enforced)
    throw new Error(
      'Latency gates require a reviewed candidate/reference comparator; changing the status flag alone cannot enable them.',
    );
  environment = await startEnvironment(controller.signal);
  controller.signal.throwIfAborted();
  const projects = args.some((arg) => arg.startsWith('--project'))
    ? []
    : ['--project=chromium'];
  const workload = performanceRun
    ? ['--grep=P1|S2', `--repeat-each=${budgets.burst.repetitions}`]
    : [];
  child = startProcess(
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      ...projects,
      ...workload,
      ...args.filter((arg) => arg !== '--performance'),
    ],
    {
      ...process.env,
      CHAT_E2E_ORIGIN: environment.origin,
      CHAT_E2E_REPORT: environment.directory,
      CHAT_E2E_PERFORMANCE: performanceRun ? '1' : '0',
    },
  );
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  const code = await processExit(child);
  process.exitCode = typeof code === 'number' ? code : 1;
} catch (error) {
  failures.push(error);
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGHUP', stop);
  clearTimeout(killTimer);
  if (child) {
    try {
      await stopProcess(child);
    } catch (error) {
      failures.push(error);
    }
  }
  if (environment) {
    try {
      await environment.close();
    } catch (error) {
      failures.push(error);
    }
    try {
      await summarize(environment.directory);
    } catch (error) {
      failures.push(error);
    }
    try {
      await retainArtifacts(
        dirname(environment.directory),
        environment.directory,
      );
    } catch (error) {
      failures.push(error);
    }
    process.stdout.write(`Browser test evidence: ${environment.directory}\n`);
  }
}

if (failures.length)
  throw new AggregateError(
    failures,
    'Browser execution or finalization failed.',
  );

function checkBrowsers(args: readonly string[]): void {
  const selection = args
    .filter((arg) => arg.startsWith('--project='))
    .map((arg) => arg.slice('--project='.length));
  const selected = selection.length ? selection : ['chromium'];
  for (const [name, browser] of Object.entries({ chromium, firefox, webkit }))
    if (selected.includes(name) && !existsSync(browser.executablePath()))
      throw new Error(
        `Missing ${name} test binary. Run npx playwright install ${name} (Linux: add --with-deps if needed).`,
      );
}
