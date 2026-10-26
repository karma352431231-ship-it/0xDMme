/** Count an intentional share action and only a successful clipboard write. */
export async function performPublicShare(
  input: { kind: 'share' | 'copy'; url: string },
  actions: {
    share: (url: string) => Promise<void>;
    copy: (url: string) => Promise<void>;
  },
  observe: (kind: 'share' | 'copy') => void,
): Promise<'shared' | 'copied'> {
  observe('share');
  if (input.kind === 'share') {
    await actions.share(input.url);
    return 'shared';
  }
  await actions.copy(input.url);
  observe('copy');
  return 'copied';
}
