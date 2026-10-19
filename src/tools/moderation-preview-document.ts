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
      : `<img src="${input.path}/file" alt="${t('Image candidate')}">`;
  return `<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${t('0xDMme — restricted review')}</title><h1>${t('Exceptional review')}</h1><p>${t('Inspect the complete media. Artistic nudity in paintings is allowed, including digital/AI paintings that are genuinely paintings. Explicit sexual acts remain prohibited. Photos and drawings outside this exception do not allow exposed genitals or female breasts. Decide using the restricted command after reviewing the appeal.')}</p>${media}<p>${t('The preview closes within five minutes.')}</p></html>`;
}
