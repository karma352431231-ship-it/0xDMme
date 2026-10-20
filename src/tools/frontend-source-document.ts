import { t as localizedText } from '../shared/i18n/index.ts';

const t = (source: string) => localizedText(source, [], 'en');

/** Public build metadata only; preferred-source bytes and filenames remain unchanged. */
export function matrixSourceDocument(input: {
  version: string;
  hash: string;
  links: string;
  script: string;
  style: string;
}): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/icon.svg"><link rel="stylesheet" href="${input.style}"><script type="module" src="${input.script}"></script><title>${t('Matrix sources · 0xDMme')}</title><main><a href="/">0xDMme</a><h1><span>${t('Matrix source code and licenses')}</span> <code>${input.version}</code></h1><p>${t('Download the parts in the order below and concatenate them into one file:')} <code>preferred-source.tar.xz</code>.</p><p><strong>SHA-256:</strong> <code>${input.hash}</code></p><p>${t('Before rebuilding the frontend, put the file in this directory:')} <code>vendor/matrix-crypto-${input.version}/</code>.</p><p>${t('The archive includes the official tag, Cargo.lock, the 323 pinned registry source packages and their notices. Full instructions are in the main source package README.')}</p><ol>${input.links}</ol></main></html>`;
}
