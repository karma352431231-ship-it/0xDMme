import { prepareArtifacts } from '../server/zk-artifacts/index.ts';

try {
  await prepareArtifacts();
  process.stdout.write(
    'Semaphore 4.13.0 artifacts verified; probe can run without a CDN.\n',
  );
} catch (error: unknown) {
  process.stderr.write('Could not prepare the pinned ZK artifacts.\n');
  process.exitCode = 1;
  // Do not print internal causes or URLs during private probes.
  if (!(error instanceof Error)) throw error;
}
