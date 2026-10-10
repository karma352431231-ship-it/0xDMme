import readline from 'node:readline';
import process from 'node:process';
const mode = process.argv[2];
const model = process.argv[3];
if (mode === 'startup-exit') process.exit(2);
process.stderr.write('synthetic diagnostics, discarded by parent\n');
process.stdout.write(
  JSON.stringify({
    ready: true,
    model: mode === 'wrong-model' ? '0'.repeat(64) : model,
  }) + '\n',
);
for await (const line of readline.createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (mode === 'hang') continue;
  if (mode === 'exit') process.exit(2);
  if (mode === 'oversized') {
    process.stdout.write('x'.repeat(4097));
    continue;
  }
  process.stdout.write(
    JSON.stringify({
      id: mode === 'stale' ? request.id - 1 : request.id,
      verdicts: ['allow'],
    }) + '\n',
  );
}
