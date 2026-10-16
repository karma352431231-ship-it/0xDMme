import { prepareMessageRuntime } from '../message-runtime/index.ts';

interface DirectoryStartup {
  loadPins: () => Promise<void>;
  loadContacts: () => Promise<void>;
  initialize: () => Promise<void>;
  guard: () => void;
  settled?: () => void;
}
/** Publish the authenticated directory while the public SDK downloads.
 * Message histories stay behind their existing verification gate. */
export async function initializeMessageDirectory(
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
  await operations.initialize();
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
