export const zkDepth = 4;
export const zkMessage = '7';
export const zkScope = '4201';
export const zkArtifacts = [
  {
    name: 'semaphore-4.wasm',
    bytes: 1_804_630,
    sha256: 'ec0ed0ae7eb0264070b36a247cf4aad8157c5550f0731d3462019526e5e9ae4f',
  },
  {
    name: 'semaphore-4.zkey',
    bytes: 1_852_550,
    sha256: '90c94bad7ad97eeb9314750e443d84da783e38a21f55538d72b10d258064f6e6',
  },
] as const;
export type ArtifactName = (typeof zkArtifacts)[number]['name'];
export const artifactBase = 'https://snark-artifacts.pse.dev/semaphore/4.13.0/';
