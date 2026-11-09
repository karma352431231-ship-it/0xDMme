import { startInstalledEntry } from '../installed-runtime/index.ts';

await startInstalledEntry(() => import('./page.ts'));
