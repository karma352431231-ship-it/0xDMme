import { authenticate } from './authenticate.ts';
import { encodeManifest } from './manifest.ts';
import { compareManifests, loadManifest, verifyLocal } from './produce.ts';
import { verifyPublic } from './public.ts';

try {
  const [mode, path, expectedCommit, root, ...extra] = process.argv.slice(2);
  if (mode === 'compare') {
    await compareManifests(process.argv.slice(3));
    console.log('Independent release manifests match.');
  } else {
    if (
      !path ||
      !expectedCommit ||
      extra.length ||
      !['public', 'local'].includes(mode ?? '')
    )
      throw new Error(
        'Usage: verify public|local MANIFEST EXPECTED_COMMIT [LOCAL_RELEASE_ROOT]',
      );
    if ((mode === 'local') !== Boolean(root))
      throw new Error('Only local verification takes a release root.');
    const manifest = await loadManifest(path);
    if (manifest.commit !== expectedCommit)
      throw new Error('Unexpected source commit.');
    await authenticate(path, expectedCommit);
    // Refuse replacement of the manifest while the external verifier was running.
    if (encodeManifest(manifest) !== encodeManifest(await loadManifest(path)))
      throw new Error('Manifest changed during authentication.');
    if (mode === 'local' && root) await verifyLocal(manifest, root);
    else await verifyPublic(manifest);
    console.log(
      JSON.stringify({
        verified: true,
        commit: manifest.commit,
        scope: mode,
        claim:
          mode === 'public'
            ? 'observed public bytes'
            : 'source and build files on disk',
      }),
    );
  }
} catch {
  console.error(
    'Release verification failed. No version or E2EE guarantee was established. Check the manifest, attestation and requested files locally.',
  );
  process.exitCode = 1;
}
