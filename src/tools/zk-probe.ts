import assert from 'node:assert/strict';
import { generateSyntheticProof } from '../client/zk-probe/index.ts';
import { artifactPaths, readArtifact } from '../server/zk-artifacts/index.ts';
import { ProbeZkVerifier } from '../server/zk-probe/index.ts';

try {
  await readArtifact('semaphore-4.wasm');
  await readArtifact('semaphore-4.zkey');
  const result = await generateSyntheticProof(artifactPaths());
  assert.equal(result.valid, true);
  assert.equal(result.tamperedAccepted, false);
  assert.equal(result.removedMemberAccepted, false);
  const verifier = new ProbeZkVerifier(result.root);
  const afterRemoval = new ProbeZkVerifier(result.removedRoot);
  await assert.rejects(afterRemoval.accept(result.proof), /Contexto/);
  await assert.rejects(
    verifier.accept({ ...result.proof, scope: '4202' }),
    /Contexto/,
  );
  await assert.rejects(
    verifier.accept({ ...result.proof, privateKey: 'campo proibido' }),
    /Campo não permitido/,
  );
  const competing = await Promise.allSettled([
    verifier.accept(result.proof),
    verifier.accept(result.proof),
  ]);
  assert.equal(
    competing.filter((entry) => entry.status === 'fulfilled').length,
    1,
  );
  await assert.rejects(verifier.accept(result.proof), /repetida/);
  const summary = {
    valid: true,
    tamperRejected: true,
    removedMemberRejected: true,
    wrongContextRejected: true,
    concurrentReplayRejected: true,
    proveMs: result.proveMs,
    verifyMs: result.verifyMs,
    proofBytes: Buffer.byteLength(JSON.stringify(result.proof)),
  };
  // snarkjs mantém workers próprios; processo exclusivo tem ciclo de vida limitado.
  process.stdout.write(JSON.stringify(summary), () => process.exit(0));
} catch {
  process.stderr.write(
    'Ensaio ZK falhou. Nenhuma autorização foi integrada ao produto.\n',
    () => process.exit(1),
  );
}
