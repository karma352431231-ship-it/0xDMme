/** One policy for public web headers and packaged native HTML. */
export const appExternalContent = {
  media: ' https://static.klipy.com',
  connect: ' https://api.klipy.com https://static.klipy.com/ii/',
  frames: ' https://www.youtube-nocookie.com',
};
/**
 * `connect-src blob:` lets the page read back its own object URLs, for
 * example a picture already shown in the viewer when "Make sticker" prepares
 * it (26/11/2026: without it every such read failed). A blob: URL only ever
 * names data this same page created, so no new destination is reachable.
 */
export function contentPolicy(
  scriptSources: string,
  external: {
    media: string;
    connect: string;
    frames: string;
    images?: string;
  } = { media: '', connect: '', frames: '' },
  delivery: 'header' | 'meta' = 'header',
): string {
  return `default-src 'none'; script-src ${scriptSources}; style-src 'self'; img-src 'self' blob:${external.images ?? external.media}; media-src blob:${external.media}; font-src 'self'; connect-src 'self' blob:${external.connect}; frame-src${external.frames || " 'none'"}; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none';${delivery === 'header' ? " frame-ancestors 'none'" : ''}`;
}
