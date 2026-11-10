import { InstalledSessionChannel } from '../../src/client/installed-runtime/channel.ts';
import {
  installProtectedDisplay,
  renderViewOnce,
} from '../../src/client/view-once-ui/index.ts';
import { base64 } from '../../src/shared/account/index.ts';

const state = document.documentElement.dataset;
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGNwzn4FRAwQCgAqEgZh/qKZDQAAAABJRU5ErkJggg==';

async function run(): Promise<void> {
  const channel = new InstalledSessionChannel();
  await channel.ready();
  installProtectedDisplay({
    begin: (input) => channel.viewBegin(input),
    append: (input) => channel.viewAppend(input),
    async show(input) {
      await channel.viewShow(input);
      if (!(await channel.viewActive({ id: input.id })))
        throw new Error('Native viewer did not remain active.');
      state['shown'] = input.text;
    },
    active: (input) => channel.viewActive(input),
    async close(input) {
      await channel.viewClose(input);
      state['closed'] = 'true';
    },
  });
  const reference = { id: crypto.randomUUID(), mime: 'image/png', bytes: 1 };
  let rejected = false;
  try {
    const invalid = { ...reference, name: 'synthetic.png' };
    await channel.viewBegin(invalid);
  } catch {
    rejected = true;
  } finally {
    await channel.viewClose({ id: reference.id });
  }
  if (!rejected) throw new Error('Native schema accepted an extra field.');
  for (const image of [false, true]) {
    const host = document.createElement('div');
    host.id = image ? 'protected-image' : 'protected-text';
    document.body.append(host);
    const file = { name: 'synthetic.png', mime: 'image/png', data: png };
    renderViewOnce({
      host,
      id: crypto.randomUUID(),
      own: false,
      metadata: {
        hash: 'a'.repeat(64),
        policy: 'mobile',
        ...(image
          ? {
              file: {
                name: file.name,
                mime: file.mime,
                bytes: base64(png, 100).length,
              },
            }
          : {}),
      },
      signal: new AbortController().signal,
      current: () => true,
      open: () =>
        Promise.resolve({
          text: image ? 'Synthetic image' : 'Synthetic text',
          ...(image ? { file } : {}),
        }),
    });
    host.querySelector('button')!.addEventListener('click', () => {
      delete state['closed'];
      delete state['shown'];
    });
  }
  state['viewOnceFixture'] = 'ready';
}
void run().catch(() => {
  state['viewOnceFixture'] = 'failed';
});
