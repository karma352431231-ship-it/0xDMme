import type { Plugin } from 'esbuild';

/** Browser ESM shares one public catalog asset; classic service workers keep it inline. */
export function localizationPlugin(url?: string, emojiUrl?: string): Plugin {
  return {
    name: 'public-localization-catalog',
    setup(builder) {
      builder.onResolve({ filter: /^\.\/catalog\.ts$/ }, (input) =>
        url && input.importer.endsWith('/src/shared/i18n/index.ts')
          ? { path: url, external: true }
          : undefined,
      );
      builder.onResolve({ filter: /^\.\/data\.ts$/ }, (input) =>
        emojiUrl && input.importer.endsWith('/src/client/emoji/index.ts')
          ? { path: emojiUrl, external: true }
          : undefined,
      );
    },
  };
}
