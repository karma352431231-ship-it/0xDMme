import { verifyProof } from '@semaphore-protocol/proof';
import type { SemaphoreProof } from '@semaphore-protocol/proof';
import { onlyKeys, record, text } from '../../shared/crypto-probe/index.ts';
import { zkDepth, zkMessage, zkScope } from '../../shared/zk-probe/index.ts';

function scalar(value: unknown): string {
  const result = text(value, 78);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(result)) throw new Error('Invalid scalar.');
  return result;
}

function parseProof(value: unknown): SemaphoreProof {
  const proof = record(value);
  onlyKeys(proof, [
    'merkleTreeDepth',
    'merkleTreeRoot',
    'nullifier',
    'message',
    'scope',
    'points',
  ]);
  if (
    proof.merkleTreeDepth !== zkDepth ||
    !Array.isArray(proof.points) ||
    proof.points.length !== 8
  )
    throw new Error("Proof format is outside the probe's scope.");
  const points = proof.points.map((point: unknown) => scalar(point));
  // The SDK fixes eight coordinates. Size was validated above, before conversion.
  return {
    merkleTreeDepth: zkDepth,
    merkleTreeRoot: scalar(proof.merkleTreeRoot),
    nullifier: scalar(proof.nullifier),
    message: scalar(proof.message),
    scope: scalar(proof.scope),
    points: points as SemaphoreProof['points'],
  };
}

/** Synthetic policy with a trusted root supplied by the operator, never the requester. */
export class ProbeZkVerifier {
  #root: string;
  #spent = new Set<string>();
  #active = 0;

  constructor(trustedRoot: string) {
    this.#root = scalar(trustedRoot);
  }

  async accept(value: unknown): Promise<void> {
    if (this.#active >= 2) throw new Error('Verifier busy.');
    const proof = parseProof(value);
    if (
      proof.merkleTreeRoot !== this.#root ||
      proof.scope !== zkScope ||
      proof.message !== zkMessage
    )
      throw new Error('Invalid authorization context.');
    this.#active += 1;
    try {
      if (!(await verifyProof(proof))) throw new Error('Invalid proof.');
      // Rechecking after await makes admission atomic within this process.
      if (this.#spent.has(proof.nullifier) || this.#spent.size >= 32)
        throw new Error('Repeated proof or probe limit reached.');
      this.#spent.add(proof.nullifier);
    } finally {
      this.#active -= 1;
    }
  }
}
