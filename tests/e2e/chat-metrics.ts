import { browserFailures } from './browser-failures.ts';
import type { BrowserFailures } from './browser-failures.ts';
import { expect } from '@playwright/test';
import type { BrowserContext, Page, Request, Response } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import { installObserver } from './chat-observer.ts';
import budgets from './chat-budgets.ts';

interface Observation {
  readonly at: number;
  readonly page: number;
  readonly event: Readonly<Record<string, unknown>>;
}
interface Operation {
  count: number;
  textAttempts: number;
  textRetryAttempts: number;
  documentCanceled: number;
  accepted: number;
  failed: number;
  requestBytes: number;
  responseBytes: number;
  durationMs: number[];
}
export function percentile(
  values: readonly number[],
  fraction: number,
): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
}
export class ChatMetrics {
  private readonly counters = new Map<string, Operation>();
  private readonly recorded: Observation[] = [];
  get operations(): ReadonlyMap<
    string,
    Readonly<Omit<Operation, 'durationMs'>> & {
      readonly durationMs: readonly number[];
    }
  > {
    return this.counters;
  }
  get observations(): readonly Observation[] {
    return this.recorded;
  }
  private room(): boolean {
    if (this.recorded.length < 40_000) return true;
    this.dropped++;
    return false;
  }
  private observe(page: Page, event: Readonly<Record<string, unknown>>): void {
    if (!this.room()) return;
    this.recorded.push({
      at: performance.now(),
      page: this.pageNumber(page),
      event,
    });
  }
  private readonly issues: string[] = [];
  private readonly failures: BrowserFailures[] = [];
  get errors(): readonly string[] {
    return [...this.issues, ...this.failures.flatMap((owner) => owner.errors)];
  }
  readonly clocks: {
    page: number;
    roundTripMs: number;
    uncertaintyMs: number;
  }[] = [];
  private readonly pages = new Map<Page, number>();
  private readonly active = new Map<Request, number>();
  private readonly pending = new Set<Promise<void>>();
  private changedAt = performance.now();
  private dropped = 0;
  private interruptedResponses = 0;
  readonly drains: {
    durationMs: number;
    peakRequests: number;
    timedOut: boolean;
  }[] = [];
  private readonly published = new Set<string>();
  private readonly messageIds = new Map<string, number>();
  private readonly flows: {
    sender: number;
    recipient: number;
    label: string;
  }[] = [];
  readonly detailed = process.env['CHAT_E2E_DETAILED'] === '1';
  historyReview(page: Page): void {
    this.observe(page, { event: 'history-review' });
  }
  flow(sender: Page, recipient: Page, label: string): void {
    this.flows.push({
      sender: this.pageNumber(sender),
      recipient: this.pageNumber(recipient),
      label,
    });
  }
  private messageNumber(id: string): number {
    const value = this.messageIds.get(id) ?? this.messageIds.size + 1;
    this.messageIds.set(id, value);
    return value;
  }
  private readonly disposals: (() => void)[] = [];
  private pageNumber(page: Page): number {
    const value = this.pages.get(page) ?? this.pages.size + 1;
    this.pages.set(page, value);
    return value;
  }
  async attach(context: BrowserContext): Promise<void> {
    this.failures.push(browserFailures(context));
    await context.exposeBinding('chatE2EEvent', ({ page }, value: unknown) => {
      if (typeof value !== 'object' || value === null) return;
      if (!this.room()) return;
      const event = { ...value } as Record<string, unknown>;
      if (typeof event['id'] === 'string')
        event['message'] = this.messageNumber(event['id']);
      delete event['id'];
      if (event['event'] === 'dropped') this.dropped++;
      this.observe(page, event);
    });
    await context.addInitScript(installObserver, this.detailed);
    for (const page of context.pages()) {
      this.pageNumber(page);
      await page.evaluate(installObserver, this.detailed);
      await this.calibrate(page);
    }
    this.disposals.push(this.observeNetwork(context));
  }
  observeNetwork(context: BrowserContext): () => void {
    const pageDisposals: (() => void)[] = [];
    const watch = (page: Page) => pageDisposals.push(this.watchPage(page));
    context.on('page', watch);
    for (const page of context.pages()) watch(page);
    const onRequest = (request: Request) => this.request(request);
    const onResponse = (response: Response) =>
      this.track(
        this.response(response).catch((error: unknown) => {
          if (!response.request().failure()) throw error;
          this.interruptedResponses++;
        }),
      );
    const onFinished = (request: Request) => {
      this.active.delete(request);
      this.changedAt = performance.now();
    };
    context.on('request', onRequest);
    context.on('response', onResponse);
    context.on('requestfinished', onFinished);
    context.on('requestfailed', onFinished);
    return () => {
      context.off('page', watch);
      for (const dispose of pageDisposals.splice(0)) dispose();
      context.off('request', onRequest);
      context.off('response', onResponse);
      context.off('requestfinished', onFinished);
      context.off('requestfailed', onFinished);
    };
  }
  private watchPage(page: Page): () => void {
    this.pageNumber(page);
    let navigation: Request | null = null;
    const departed = () => this.cancelDocument(page);
    const navigating = (request: Request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        navigation = request;
    };
    const failed = (request: Request) => {
      if (request === navigation) navigation = null;
    };
    const committed = (frame: ReturnType<Page['mainFrame']>) => {
      if (frame !== page.mainFrame() || !navigation) return;
      // Old-document API events can arrive after the navigation request. Only
      // the actual commit ends that document; a failed navigation does not.
      navigation = null;
      departed();
    };
    page.on('close', departed);
    page.on('request', navigating);
    page.on('requestfailed', failed);
    page.on('framenavigated', committed);
    return () => {
      navigation = null;
      page.off('close', departed);
      page.off('request', navigating);
      page.off('requestfailed', failed);
      page.off('framenavigated', committed);
    };
  }
  private cancelDocument(page: Page): void {
    for (const request of this.active.keys()) {
      if (request.frame().page() !== page) continue;
      const operation = this.operation(request);
      if (operation) this.counter(operation).documentCanceled++;
      this.active.delete(request);
    }
    this.changedAt = performance.now();
  }
  recordOutbox(page: Page, counts: { direct: number; group: number }): void {
    this.observe(page, { event: 'durable-outbox', ...counts });
  }
  assertComplete(): void {
    this.assertValid();
    expect(this.interruptedResponses).toBe(0);
    expect(
      [...this.operations.values()].reduce(
        (sum, operation) => sum + operation.documentCanceled,
        0,
      ),
      'Document cancellation makes performance work accounting incomplete',
    ).toBe(0);
  }
  async calibrate(page: Page): Promise<void> {
    const roundTrips: number[] = [];
    for (let i = 0; i < 7; i++) {
      const start = performance.now();
      await page.evaluate(() => performance.now());
      roundTrips.push(performance.now() - start);
    }
    const best = Math.min(...roundTrips);
    this.clocks.push({
      page: this.pageNumber(page),
      roundTripMs: best,
      uncertaintyMs: best / 2,
    });
  }
  private operation(request: Request): string | null {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/account/')) return null;
    const operation = path.slice('/api/account/'.length);
    return /^[a-z/-]+$/u.test(operation) ? operation : null;
  }
  private counter(operation: string): Operation {
    let result = this.counters.get(operation);
    if (!result) {
      result = {
        count: 0,
        textAttempts: 0,
        textRetryAttempts: 0,
        documentCanceled: 0,
        accepted: 0,
        failed: 0,
        requestBytes: 0,
        responseBytes: 0,
        durationMs: [],
      };
      this.counters.set(operation, result);
    }
    return result;
  }
  private request(request: Request): void {
    const operation = this.operation(request);
    if (!operation) return;
    const counter = this.counter(operation);
    counter.count++;
    this.countPublication(request, operation);
    counter.requestBytes += request.postDataBuffer()?.byteLength ?? 0;
    if (!/(^|\/)(live|presence|heartbeat|daily-heartbeat)$/u.test(operation))
      this.active.set(request, performance.now());
    this.changedAt = performance.now();
  }
  private countPublication(request: Request, operation: string): void {
    if (!operation.endsWith('publish')) return;
    const packet = textPacket(request);
    if (!packet) return;
    const counter = this.counter(operation);
    counter.textAttempts++;
    if (this.published.has(packet.id)) counter.textRetryAttempts++;
    if (this.published.size >= 5000) this.dropped++;
    else this.published.add(packet.id);
  }
  private async response(response: Response): Promise<void> {
    const request = response.request(),
      operation = this.operation(request);
    if (!operation) return;
    const counter = this.counter(operation),
      started = this.active.get(request);
    if (started !== undefined) {
      if (counter.durationMs.length === 5000) this.dropped++;
      else counter.durationMs.push(performance.now() - started);
    }
    if (response.status() >= 400) counter.failed++;
    await this.publication(response, operation);
    if (!operation.endsWith('live')) {
      const sizes = await request.sizes();
      counter.responseBytes += sizes.responseBodySize;
      this.active.delete(request);
      this.changedAt = performance.now();
    }
  }
  private async publication(
    response: Response,
    operation: string,
  ): Promise<void> {
    if (operation.endsWith('publish') && response.ok()) {
      const body: unknown = await response.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        'status' in body &&
        body.status === 'accepted'
      ) {
        const packet = textPacket(response.request());
        if (packet) {
          this.counter(operation).accepted++;
          this.observe(response.request().frame().page(), {
            event: 'server-accepted',
            message: this.messageNumber(packet.id),
          });
        }
      }
    }
  }
  private track(promise: Promise<void>): void {
    this.pending.add(promise);
    void promise
      .catch(() => this.issues.push('Incomplete network measurement'))
      .finally(() => this.pending.delete(promise));
  }
  async drain(timeoutMs = budgets.functionalDeadlineMs): Promise<void> {
    const started = performance.now();
    let peakRequests = this.active.size;
    const deadline = started + timeoutMs;
    while (performance.now() < deadline) {
      peakRequests = Math.max(peakRequests, this.active.size);
      if (
        !this.active.size &&
        !this.pending.size &&
        performance.now() - this.changedAt >= budgets.quiescenceMs
      ) {
        this.drains.push({
          durationMs: performance.now() - started,
          peakRequests,
          timedOut: false,
        });
        return;
      }
      await delay(50);
    }
    this.drains.push({
      durationMs: performance.now() - started,
      peakRequests,
      timedOut: true,
    });
    throw new Error(
      `Work did not drain: ${[...this.active.keys()].map((request) => this.operation(request)).join(', ')}, ${this.pending.size} pending response observations.`,
    );
  }
  accepted(operation: string): number {
    return this.counters.get(operation)?.accepted ?? 0;
  }
  textAttempts(operation: string): number {
    return this.counters.get(operation)?.textAttempts ?? 0;
  }
  assertValid(): void {
    expect(this.dropped, 'Dropped observations invalidate metrics').toBe(0);
    expect(this.errors).toEqual([]);
  }
  assertSamples(expected: number): void {
    for (const flow of this.flows) {
      const latency = flowLatency(this.observations, flow);
      expect(latency.missing, 'Missing recipient observations').toBe(0);
      expect(
        latency.count,
        'No matched submit/recipient samples',
      ).toBeGreaterThan(0);
    }
    for (const flow of this.flows)
      expect(flowLatency(this.observations, flow).count).toBe(expected);
    expect(
      this.interruptedResponses,
      'Incomplete response timing invalidates performance samples',
    ).toBe(0);
  }
  private get networkComplete(): boolean {
    return (
      this.active.size === 0 &&
      this.pending.size === 0 &&
      this.drains.every((drain) => !drain.timedOut)
    );
  }
  report() {
    return {
      work: {
        activeRequests: this.active.size,
        pendingResponses: this.pending.size,
      },
      clock:
        'single runner performance.now; browser binding/DOM observation overhead included; DOM visibility is not physical paint',
      clocks: this.clocks,
      drains: this.drains,
      dropped: this.dropped,
      interruptedResponses: this.interruptedResponses,
      errors: this.errors,
      operations: Object.fromEntries(this.operations),
      detailed: this.detailed,
      complete:
        this.networkComplete &&
        this.dropped === 0 &&
        this.errors.length === 0 &&
        this.interruptedResponses === 0 &&
        [...this.operations.values()].every(
          (operation) => operation.documentCanceled === 0,
        ),
      flows: this.flows,
      observations: this.observations,
      latency: this.flows.map((flow) => flowLatency(this.observations, flow)),
    };
  }
  close(): void {
    for (const dispose of this.disposals) dispose();
  }
}

function packetField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}
function textPacket(request: Request): { id: string } | null {
  const packet = packetField(
    packetField(request.postDataJSON() as unknown, 'payload'),
    'packet',
  );
  const id = packetField(packet, 'id');
  return packetField(packet, 'kind') === 'text' && typeof id === 'string'
    ? { id }
    : null;
}
function flowLatency(
  events: readonly Observation[],
  flow: { sender: number; recipient: number; label: string },
) {
  const samples: number[] = [],
    automaticSamples: number[] = [],
    reviewedSamples: number[] = [];
  const reviewAt =
    events.find(
      (event) =>
        event.page === flow.recipient &&
        event.event['event'] === 'history-review',
    )?.at ?? Infinity;
  let missing = 0;
  const submitted = events.filter(
    (x) => x.page === flow.sender && x.event['event'] === 'submit',
  );
  for (const start of submitted) {
    const arrival = events.find(
      (x) =>
        x.page === flow.recipient &&
        x.event['event'] === 'visible' &&
        x.event['token'] === start.event['token'],
    );
    if (arrival) {
      const elapsed = arrival.at - start.at;
      samples.push(elapsed);
      (arrival.at < reviewAt ? automaticSamples : reviewedSamples).push(
        elapsed,
      );
    } else missing++;
  }
  return {
    label: flow.label,
    samples,
    automaticSamples,
    reviewedSamples,
    presentationScope:
      'overall samples include explicit bounded history review; automaticSamples exclude it',
    count: samples.length,
    missing,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
  };
}
