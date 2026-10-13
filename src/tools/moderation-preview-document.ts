import { preferredLanguage, t as localizedText } from '../shared/i18n/index.ts';

/** Local preview keeps its script-free CSP; only authored text follows the browser. */
export function moderationPreviewDocument(input: {
  type: string;
  path: string;
  acceptLanguage: string | undefined;
}): string {
  const language = preferredLanguage(
    (input.acceptLanguage ?? '')
      .slice(0, 1024)
      .split(',')
      .map((value) => value.split(';')[0]!.trim()),
  );
  const t = (source: string) => localizedText(source, [], language);
  const media =
    input.type === 'video/mp4'
      ? `<video controls src="${input.path}/file"></video>`
      : `<img src="${input.path}/file" alt="${t('Candidato de imagem')}">`;
  return `<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${t('0xDMme — revisão restrita')}</title><h1>${t('Revisão excepcional')}</h1><p>${t('Verifique a mídia completa. Nudez artística em pinturas é permitida, inclusive em pinturas digitais/IA que sejam de fato pinturas. Atos sexuais explícitos continuam proibidos. Fotos e desenhos fora dessa exceção não permitem genitais/seios femininos expostos. Decida pelo comando restrito, após conferir a contestação.')}</p>${media}<p>${t('A prévia encerra em até cinco minutos.')}</p></html>`;
}
