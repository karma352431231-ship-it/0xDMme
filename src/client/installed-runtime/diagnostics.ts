import {
  beginStartupCapture,
  startLoad,
  startBootTrace,
} from '../chat-sync-diagnostics/index.ts';
import {
  chatSyncEvent,
  readChatSyncTrace,
} from '../../shared/chat-sync-diagnostics/index.ts';
import type { InstalledSessionChannel } from './channel.ts';
import type { LoadKind } from '../../shared/chat-sync-diagnostics/load.ts';
import type { BootMilestone } from '../../shared/chat-sync-diagnostics/boot.ts';

/** Diagnostic launch owner. No capture is armed by an ordinary app build. */
export function startInstalledDiagnostics(
  channel: InstalledSessionChannel,
  entryMs: number,
) {
  if (!beginStartupCapture()) return;
  const traceBoot = startBootTrace();
  const trace = startLoad('app-startup', null, 0);
  trace?.point('entry', { loadStageMs: Math.round(entryMs) });
  trace?.point('bridge-ready', {
    loadStageMs: Math.round(performance.now() - entryMs),
  });
  documentAvailability(trace);
  const abort = new AbortController();
  const reported = new Set<BootMilestone>();
  const report = (milestone: BootMilestone) => {
    if (reported.has(milestone)) return;
    reported.add(milestone);
    void channel
      .startupTiming(milestone)
      .then((timing) => {
        if (!timing || abort.signal.aborted) return;
        traceBoot({
          bootMilestone: milestone,
          bootAvailable: true,
          bootActivityMs: timing.activityMs,
          bootWebViewMs: timing.webViewMs,
          bootDocumentMs: timing.documentMs,
          bootNavigationMs: timing.documentStartedMs,
        });
      })
      .catch(() => {
        if (!abort.signal.aborted)
          traceBoot({ bootMilestone: milestone, bootAvailable: false });
      });
  };
  const timer = setTimeout(() => abort.abort(), 600_000);
  abort.signal.addEventListener('abort', () => clearTimeout(timer), {
    once: true,
  });
  window.addEventListener('pagehide', () => abort.abort(), {
    once: true,
    signal: abort.signal,
  });
  window.addEventListener(
    chatSyncEvent,
    (event) => {
      if (!(event instanceof CustomEvent)) return;
      const value = readChatSyncTrace(event.detail);
      if (
        value?.event !== 'load' ||
        value.loadStage !== 'complete' ||
        value.loadOutcome !== 'complete' ||
        value.loadPresentation === 'unavailable'
      )
        return;
      const milestone =
        value.loadKind && presentationMilestones[value.loadKind];
      if (milestone) report(milestone);
    },
    { signal: abort.signal },
  );
  report('snapshot');
  return trace;
}

const presentationMilestones: Partial<Record<LoadKind, BootMilestone>> = {
  'app-startup': 'shell-frame',
  contacts: 'contacts-frame',
  'contacts-screen': 'contacts-screen-frame',
  'conversation-list': 'conversations-frame',
};

/** Browser resource clocks separate document/script availability from entry
 * and bridge waits. WebViews that omit these entries leave the stages absent. */
function documentAvailability(trace: ReturnType<typeof startLoad>): void {
  if (!trace || typeof performance.getEntriesByType !== 'function') return;
  const navigation = performance.getEntriesByType('navigation')[0];
  if (
    typeof PerformanceNavigationTiming !== 'undefined' &&
    navigation instanceof PerformanceNavigationTiming
  )
    trace.point('document-response', {
      loadStageMs: Math.round(navigation.responseEnd - navigation.startTime),
    });
  const app = [...document.scripts].find((script) =>
    /\/app-[a-f0-9]+\.js$/u.test(script.src),
  );
  if (!app) return;
  const resource = performance.getEntriesByName(app.src)[0];
  if (
    typeof PerformanceResourceTiming !== 'undefined' &&
    resource instanceof PerformanceResourceTiming
  )
    trace.point('script-response', {
      loadStageMs: Math.round(resource.responseEnd - resource.startTime),
      loadBytes: resource.encodedBodySize,
    });
}
