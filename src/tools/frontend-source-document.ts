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
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/icon.svg"><link rel="stylesheet" href="${input.style}"><script type="module" src="${input.script}"></script><title>${t('Fontes Matrix · 0xDMme')}</title><main><a href="/">0xDMme</a><h1><span>${t('Fontes e licenças Matrix')}</span> <code>${input.version}</code></h1><p>${t('Baixe as partes na ordem abaixo e concatene-as em um único arquivo:')} <code>preferred-source.tar.xz</code>.</p><p><strong>SHA-256:</strong> <code>${input.hash}</code></p><p>${t('Antes de reconstruir o frontend, coloque o arquivo neste diretório:')} <code>vendor/matrix-crypto-${input.version}/</code>.</p><p>${t('O arquivo inclui a tag oficial, Cargo.lock, as 323 fontes de registry fixadas e seus avisos. As instruções completas estão no README do pacote principal de fontes.')}</p><ol>${input.links}</ol></main></html>`;
}
