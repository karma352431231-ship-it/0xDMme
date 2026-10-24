import { chatSummary } from './chat-report.ts';
import { readdir, stat, rm, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import budgets from './chat-budgets.ts';

async function bytes(path: string): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink())
      throw new Error('Refusing a symbolic link in browser evidence.');
    const file = join(path, entry.name);
    total += entry.isDirectory() ? await bytes(file) : (await stat(file)).size;
  }
  return total;
}
export async function retainArtifacts(
  root: string,
  current: string,
): Promise<void> {
  const runs = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^run-[a-zA-Z0-9]+$/u.test(entry.name))
      continue;
    const path = join(root, entry.name);
    if (!(await ownedRun(path))) continue;
    const metadata = await stat(path);
    runs.push({ path, time: metadata.mtimeMs, size: await bytes(path) });
  }
  runs.sort((a, b) => b.time - a.time);
  let retained = 0;
  for (const run of runs) {
    const expired =
      Date.now() - run.time > budgets.artifacts.retentionDays * 86_400_000;
    if (
      resolve(run.path) !== resolve(current) &&
      (expired || retained + run.size > budgets.artifacts.maxRetainedBytes)
    )
      await rm(run.path, { recursive: true });
    else retained += run.size;
  }
  const currentBytes = await bytes(current);
  if (currentBytes > budgets.artifacts.maxRunBytes) {
    await rm(join(current, 'failures'), { recursive: true, force: true });
    // JSON reporter attachments can inline heavy DOM/screenshot evidence too.
    await rm(join(current, 'results.json'), { force: true });
    throw new Error(
      'Browser evidence exceeded 100 MiB; heavy artifacts removed. The run is invalid.',
    );
  }
}
export async function summarize(directory: string): Promise<void> {
  const path = join(directory, 'results.json');
  let result: Awaited<ReturnType<typeof chatSummary>>;
  try {
    result = await chatSummary(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  // The complete Playwright result stays private. Shared summaries contain no traces, DOM or network credentials.

  await writeFile(
    join(directory, 'summary.json'),
    JSON.stringify(
      {
        ...result,
        environment: JSON.parse(
          await readFile(join(directory, 'environment.json'), 'utf8'),
        ) as unknown,
      },
      null,
      2,
    ),
  );
}

async function ownedRun(path: string): Promise<boolean> {
  try {
    const marker = JSON.parse(
      await readFile(join(path, 'owner.json'), 'utf8'),
    ) as { harness?: unknown };
    return marker.harness === '0xdmme-chat-e2e-v1';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
