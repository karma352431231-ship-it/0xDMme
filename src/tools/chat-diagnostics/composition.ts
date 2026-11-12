import { declaredKind, FileInspection } from './file-inspection.ts';
import type { InspectedFile } from './file-inspection.ts';
import type { RecordEvent } from './events.ts';
export const mediaKinds = [
  'text',
  'image',
  'video',
  'file',
  'mixed',
  'unknown',
] as const;
export type MediaKind = (typeof mediaKinds)[number];
interface FileObservation {
  kind: MediaKind;
  bytes: number;
  result?: InspectedFile;
  state: 'pending' | 'ready' | 'unavailable';
}
interface Composition {
  composer: number;
  selection: number;
  files: FileObservation[];
}
/** Owns anonymous composer/selection slots and scalar observations. The IO
 * owner releases original bytes; no names, content or digest leave this module. */
export class CompositionMetadata {
  private readonly forms = new WeakMap<Element, Composition>();
  private readonly inspection = new FileInspection();
  private sequence = 0;
  private selection = 0;
  private stopped = false;
  private entry(form: Element): Composition {
    let value = this.forms.get(form);
    if (!value) {
      value = { composer: ++this.sequence, selection: 0, files: [] };
      this.forms.set(form, value);
    }
    return value;
  }
  select(
    input: { form: Element; scope: string; files: FileList },
    record: RecordEvent,
  ): void {
    const { form, scope, files } = input;
    const previous = this.entry(form);
    const entry: Composition = {
      composer: previous.composer,
      selection: ++this.selection,
      files: hasAttachment(form) ? previous.files.slice() : [],
    };
    this.forms.set(form, entry);
    for (let index = 0; index < Math.min(files.length, 16); index++) {
      const file = files.item(index);
      if (!file || entry.files.length === 16) break;
      const observation: FileObservation = {
        kind: declaredKind(file.type),
        bytes: file.size,
        state: 'pending',
      };
      entry.files.push(observation);
      this.inspect({ file, observation, entry, scope }, record);
    }
    record('attachment-selection', { scope, ...this.selected(form) });
  }
  private inspect(
    input: {
      file: File;
      observation: FileObservation;
      entry: Composition;
      scope: string;
    },
    record: RecordEvent,
  ): void {
    const { observation, entry, scope } = input;
    void this.inspection.inspect(input.file).then(
      (result) => {
        observation.result = result;
        observation.kind = result.kind;
        observation.state = 'ready';
        this.inspected(entry, scope, record);
      },
      () => {
        observation.state = 'unavailable';
        this.inspected(entry, scope, record);
      },
    );
  }
  private inspected(
    entry: Composition,
    scope: string,
    record: RecordEvent,
  ): void {
    if (!this.stopped)
      record('attachment-inspected', { scope, ...this.details(entry) });
  }
  clear(form: Element): void {
    const entry = this.entry(form);
    this.forms.set(form, { composer: entry.composer, selection: 0, files: [] });
  }
  read(form: Element) {
    const entry = this.entry(form);
    const base = {
      composer: entry.composer,
      viewOnce: form.getAttribute('data-view-once') === 'true',
    };
    if (!hasAttachment(form))
      return {
        ...base,
        selection: 0,
        ...fileDetails([]),
        mediaKind: 'text',
        fileCount: 0,
        fileBytes: 0,
      };
    const count = form.querySelectorAll('.attachment-tile').length || 1;
    if (entry.files.length === count)
      return { ...base, ...this.details(entry) };
    return {
      ...base,
      selection: 0,
      mediaKind: 'unknown',
      fileCount: count,
      fileBytes: -1,
      inspectionUnavailable: true,
    };
  }
  selected(form: Element) {
    return {
      viewOnce: form.getAttribute('data-view-once') === 'true',
      ...this.details(this.entry(form)),
    };
  }
  private details(entry: Composition) {
    return {
      composer: entry.composer,
      selection: entry.selection,
      ...fileDetails(entry.files),
    };
  }
  stop(): void {
    this.stopped = true;
    this.inspection.stop();
  }
}
function hasAttachment(form: Element): boolean {
  return (
    form.querySelector<HTMLElement>('[data-attachment-clear]')?.hidden === false
  );
}
function fileDetails(files: readonly FileObservation[]) {
  const kinds = new Set(files.map((file) => file.kind));
  return {
    mediaKind:
      files.length === 0
        ? 'unknown'
        : kinds.size === 1
          ? files[0]!.kind
          : 'mixed',
    fileCount: files.length,
    fileBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    fileSlots: files.flatMap((file) =>
      file.result?.slot ? [file.result.slot] : [],
    ),
    inspectedFiles: files.filter((file) => file.state === 'ready').length,
    inspectionPending: files.some((file) => file.state === 'pending'),
    inspectionUnavailable: files.some((file) => file.state === 'unavailable'),
    signatureFiles: files.filter((file) => file.result?.signature).length,
    mimeMismatch: files.some((file) => file.result?.mismatch),
    inspectionMs: files.reduce(
      (sum, file) => sum + (file.result?.inspectionMs ?? 0),
      0,
    ),
  };
}
