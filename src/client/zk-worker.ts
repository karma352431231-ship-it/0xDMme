import { generateSyntheticProof } from './zk-probe/index.ts';

let started = false;
self.addEventListener('message', () => {
  if (started) return;
  started = true;
  void generateSyntheticProof({
    wasm: '/zk/semaphore-4.wasm',
    zkey: '/zk/semaphore-4.zkey',
  })
    .then((result) => {
      self.postMessage({
        valid: result.valid,
        tamperRejected: !result.tamperedAccepted,
        removedMemberRejected: !result.removedMemberAccepted,
        proveMs: result.proveMs,
        verifyMs: result.verifyMs,
        proofBytes: new TextEncoder().encode(JSON.stringify(result.proof))
          .length,
      });
    })
    .catch(() => self.postMessage({ error: true }));
});
