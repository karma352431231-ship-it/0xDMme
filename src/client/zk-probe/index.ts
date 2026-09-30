import { Group } from '@semaphore-protocol/group';
import { Identity } from '@semaphore-protocol/identity';
import { generateProof, verifyProof } from '@semaphore-protocol/proof';
import { zkDepth, zkMessage, zkScope } from '../../shared/zk-probe/index.ts';

export async function generateSyntheticProof(artifacts: {
  wasm: string;
  zkey: string;
}) {
  const members = Array.from({ length: 8 }, () => new Identity());
  const member = members[0];
  if (!member) throw new Error('Grupo sintético incompleto.');
  const group = new Group(members.map((identity) => identity.commitment));
  const started = performance.now();
  const proof = await generateProof(
    member,
    group,
    zkMessage,
    zkScope,
    zkDepth,
    artifacts,
  );
  const proveMs = performance.now() - started;
  const verifying = performance.now();
  const valid = await verifyProof(proof);
  const verifyMs = performance.now() - verifying;
  const tamperedAccepted = await verifyProof({ ...proof, message: '8' });
  const removedGroup = new Group(
    members.slice(1).map((identity) => identity.commitment),
  );
  const removedMemberAccepted = await verifyProof({
    ...proof,
    merkleTreeRoot: removedGroup.root.toString(),
  });
  return {
    proof,
    root: group.root.toString(),
    proveMs,
    verifyMs,
    valid,
    tamperedAccepted,
    removedMemberAccepted,
    removedRoot: removedGroup.root.toString(),
  };
}
