import { prepareMessageRuntime } from '../message-runtime/index.ts';

interface DirectoryStartup {
  loadPins: () => Promise<void>;
  loadContacts: () => Promise<void>;
  guard: () => void;
  settled?: () => void;
}
/** Load the authenticated directory alongside the public runtime download.
 * SDK/store preparation is scheduled separately. Each history and send keeps
 * its own authority, identity, removal and final confirmation checks. */
export async function loadMessageDirectory(
  operations: DirectoryStartup,
): Promise<void> {
  operations.guard();
  const results = await Promise.allSettled([
    prepareMessageRuntime(),
    loadDirectory(operations),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') {
      const error: unknown = result.reason;
      throw error;
    }
  }
  operations.guard();
}
async function loadDirectory(operations: DirectoryStartup): Promise<void> {
  try {
    await operations.loadPins();
    operations.guard();
    await operations.loadContacts();
    operations.guard();
  } finally {
    operations.guard();
    operations.settled?.();
  }
}
