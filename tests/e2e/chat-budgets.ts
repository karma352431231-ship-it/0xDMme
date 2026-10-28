import { readFileSync } from 'node:fs';
interface Budgets {
  version: number;
  burst: { messagesPerSender: number; intervalMs: number; repetitions: number };
  historyMessages: number;
  navigationSwitches: number;
  functionalDeadlineMs: number;
  quiescenceMs: number;
  requestGates: { rationale: string; newPublishesPerText: number };
  latency: {
    enforced: boolean;
    absoluteTargetP95Ms: number;
    targetRationale: string;
    relativeIncrease: number;
    minimumIncreaseMs: number;
    status: string;
  };
  artifacts: {
    retentionDays: number;
    maxRunBytes: number;
    maxRetainedBytes: number;
  };
}
// Versioned reviewed test input, never downloaded or learned from a failing run.
const budgets = JSON.parse(
  readFileSync(new URL('./chat-budgets.json', import.meta.url), 'utf8'),
) as Budgets;
export default budgets;
