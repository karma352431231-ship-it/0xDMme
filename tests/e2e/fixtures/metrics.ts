import { writeFile } from 'node:fs/promises';
import { test as chatsTest } from './chats.ts';
import { ChatMetrics } from '../chat-metrics.ts';
export const test = chatsTest.extend<{ metrics: ChatMetrics }>({
  metrics: async ({ accounts, chats }, use, info) => {
    void chats;
    const metrics = new ChatMetrics();
    try {
      await metrics.attach(accounts.a);
      await metrics.attach(accounts.b);
      await use(metrics);
      if (info.status === info.expectedStatus) {
        await metrics.drain();
        metrics.assertValid();
        if (process.env['CHAT_E2E_PERFORMANCE'] === '1')
          metrics.assertComplete();
      }
    } finally {
      try {
        await writeFile(
          info.outputPath('metrics.json'),
          JSON.stringify(metrics.report()),
        );
        await info.attach('chat-metrics', {
          body: JSON.stringify(metrics.report()),
          contentType: 'application/json',
        });
      } finally {
        metrics.close();
      }
    }
  },
});
export { expect } from '@playwright/test';
