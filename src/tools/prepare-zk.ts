import { prepareArtifacts } from '../server/zk-artifacts/index.ts';

try {
  await prepareArtifacts();
  process.stdout.write(
    'Artefatos Semaphore 4.13.0 conferidos; ensaio pode funcionar sem CDN.\n',
  );
} catch (error: unknown) {
  process.stderr.write('Não foi possível preparar os artefatos ZK fixados.\n');
  process.exitCode = 1;
  // Não imprimir causas/URLs internas durante os ensaios privados.
  if (!(error instanceof Error)) throw error;
}
