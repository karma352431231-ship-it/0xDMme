import { readFile } from 'node:fs/promises';
import { percentile } from './chat-metrics.ts';
import budgets from './chat-budgets.ts';
import { diagnosticSummary } from './chat-diagnostics.ts';
interface Attachment {
  name: string;
  body?: string;
  path?: string;
}
interface Result {
  status: string;
  duration: number;
  attachments: Attachment[];
}
interface Suite {
  title: string;
  suites?: Suite[];
  specs?: {
    title: string;
    tests: { projectName: string; results: Result[] }[];
  }[];
}
interface Flow {
  automaticSamples: number[];
  reviewedSamples: number[];
  label: string;
  samples: number[];
  count: number;
  missing: number;
}
interface Metrics {
  observations: { page: number; event: Record<string, unknown> }[];
  latency: Flow[];
  dropped: number;
  interruptedResponses: number;
  errors: string[];
  operations: Record<
    string,
    {
      count: number;
      accepted: number;
      failed: number;
      requestBytes: number;
      responseBytes: number;
    }
  >;
  clocks: unknown;
  drains: unknown;
  detailed: boolean;
  complete: boolean;
}
interface CaseReport {
  title: string;
  browser: unknown;
  status: string;
  duration: number;
  metrics: Metrics | null;
  measurements: {
    admission: unknown;
    navigationMs: number[] | null;
    boot: unknown;
  };
}
async function attachment<T>(result: Result, name: string): Promise<T | null> {
  const item = result.attachments.find((value) => value.name === name);
  if (!item) return null;
  const body = item.body
    ? Buffer.from(item.body, 'base64').toString('utf8')
    : await readFile(item.path!, 'utf8');
  return JSON.parse(body) as T;
}
async function cases(
  suites: readonly Suite[],
  prefix = '',
): Promise<CaseReport[]> {
  const found: CaseReport[] = [];
  for (const suite of suites) {
    found.push(
      ...(await cases(suite.suites ?? [], prefix + suite.title + ' / ')),
    );
    for (const spec of suite.specs ?? [])
      found.push(...(await specReports(spec, prefix)));
  }
  return found;
}
async function specReports(
  spec: NonNullable<Suite['specs']>[number],
  prefix: string,
): Promise<CaseReport[]> {
  const found: CaseReport[] = [];
  for (const test of spec.tests)
    for (const result of test.results)
      found.push({
        title: prefix + spec.title,
        browser: await attachment<unknown>(result, 'browser-version'),
        status: result.status,
        duration: result.duration,
        metrics: await attachment<Metrics>(result, 'chat-metrics'),
        measurements: {
          admission: await admissionSummary(result),
          navigationMs: await attachment<number[]>(result, 'navigation-ms'),
          boot: await attachment<unknown>(result, 'boot-ms'),
        },
      });
  return found;
}
function pool(reports: readonly CaseReport[]) {
  const groups = new Map<
    string,
    {
      browser: unknown;
      workload: string;
      samples: number[];
      automaticSamples: number[];
      reviewedSamples: number[];
      missing: number;
      failures: number;
    }
  >();
  for (const report of reports) {
    for (const flow of report.metrics?.latency ?? []) {
      const workload = `${report.title} / ${flow.label}`;
      const key = JSON.stringify([report.browser, workload]);
      const group = groups.get(key) ?? {
        browser: report.browser,
        workload,
        samples: [],
        automaticSamples: [],
        reviewedSamples: [],
        missing: 0,
        failures: 0,
      };
      group.samples.push(...flow.samples);
      group.automaticSamples.push(...flow.automaticSamples);
      group.reviewedSamples.push(...flow.reviewedSamples);
      group.missing += flow.missing;
      if (report.status !== 'passed') group.failures++;
      groups.set(key, group);
    }
  }
  return [...groups.values()].map((value) => ({
    ...value,
    count: value.samples.length,
    presentationScope:
      'Overall timings include explicit history review; automatic timings describe only the automatically presented subset.',
    automatic: {
      count: value.automaticSamples.length,
      p50Ms: percentile(value.automaticSamples, 0.5),
      p95Ms: percentile(value.automaticSamples, 0.95),
    },
    historyReview: {
      count: value.reviewedSamples.length,
      p50Ms: percentile(value.reviewedSamples, 0.5),
      p95Ms: percentile(value.reviewedSamples, 0.95),
    },
    p50Ms: percentile(value.samples, 0.5),
    p95Ms: percentile(value.samples, 0.95),
  }));
}
export async function chatSummary(raw: string) {
  const result = JSON.parse(raw) as { suites: Suite[]; stats: unknown };
  const reports = await cases(result.suites);
  return {
    stats: result.stats,
    workloads: budgets,
    cases: reports.map((report) => ({
      ...report,
      metrics: report.metrics
        ? {
            dropped: report.metrics.dropped,
            interruptedResponses: report.metrics.interruptedResponses,
            errors: report.metrics.errors,
            clocks: report.metrics.clocks,
            drains: report.metrics.drains,
            detailed: report.metrics.detailed,
            complete: report.metrics.complete,
            diagnostics: diagnosticSummary(report.metrics.observations ?? []),
            operations: report.metrics.operations,
            latency: report.metrics.latency.map((flow) => ({
              ...flow,
              p50Ms: percentile(flow.samples, 0.5),
              p95Ms: percentile(flow.samples, 0.95),
            })),
          }
        : null,
    })),
    pooled: pool(reports),
  };
}

async function admissionSummary(result: Result) {
  const admission = await attachment<
    Record<string, { scheduledAt: number; admittedAt: number }[]>
  >(result, 'admission-times');
  if (!admission) return null;
  return Object.fromEntries(
    Object.entries(admission).map(([sender, events]) => [
      sender,
      {
        count: events.length,
        admissionLatenessMs: events.map(
          (event) => event.admittedAt - event.scheduledAt,
        ),
        actualIntervalsMs: events
          .slice(1)
          .map((event, i) => event.admittedAt - events[i]!.admittedAt),
      },
    ]),
  );
}
