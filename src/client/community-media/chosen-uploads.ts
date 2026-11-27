// SPDX-License-Identifier: GPL-3.0-only
import { communityMediaState } from '../../shared/community-media/index.ts';
import type {
  CommunityMediaSource,
  CommunityMediaState,
} from '../../shared/community-media/index.ts';
import { preparedSource, request, upload as sendMedia } from './upload.ts';
import type { CommunityMediaAccess, PreparedSource } from './upload.ts';

/** What the draft shows for one chosen file. */
export interface ChosenUploadEvents {
  /** A sent fraction, null while the server prepares the file, 1 once ready. */
  progress: (file: File, value: number | null) => void;
  /** The upload stopped; Publish tries it once more. */
  failed: (file: File, error: unknown) => void;
}

interface Upload {
  readonly file: File;
  readonly stop: AbortController;
  /** Chosen once, so a retry resumes the same server upload. */
  source: CommunityMediaSource | null;
  run: Promise<string>;
  failed: boolean;
  /** Given to a publish, which may own it: closing never cancels it. */
  handed: boolean;
}

/**
 * The uploads of one post or reply draft (owner, 27/11/2026: pictures should
 * be almost instant). Each chosen file starts uploading as soon as it is
 * picked, one at a time in choice order, so Publish waits only for what is
 * left. A file removed from the draft, or a draft closed without publishing
 * it, is cancelled on the server; the server keeps the media already linked
 * to a post, and anything a cancel misses expires after 24 hours.
 */
export class ChosenUploads {
  private readonly uploads = new Map<File, Upload>();
  private queue: Promise<unknown> = Promise.resolve();
  private pending: Promise<CommunityMediaState[]> | null = null;
  private readonly access: CommunityMediaAccess;
  private readonly events: ChosenUploadEvents;

  constructor(access: CommunityMediaAccess, events: ChosenUploadEvents) {
    this.access = access;
    this.events = events;
    access.signal.addEventListener('abort', () => this.close(), {
      once: true,
    });
  }

  /** The draft's files now: new ones start, removed ones stop and cancel. */
  update(files: readonly File[]): void {
    if (this.access.signal.aborted) return;
    for (const [file, upload] of this.uploads)
      if (!files.includes(file)) this.discard(upload);
    for (const file of files) if (!this.uploads.has(file)) this.start(file);
  }

  /** The media ids for a publish, in choice order; a failed upload tries
   * once more. */
  ids(files: readonly File[]): Promise<string[]> {
    this.update(files);
    const chosen = files.map((file) => this.uploads.get(file));
    return Promise.all(
      chosen.map((upload) => {
        if (!upload) return Promise.reject(new Error('Send interrupted.'));
        upload.handed = true;
        if (upload.failed) this.attempt(upload);
        return upload.run;
      }),
    );
  }

  private start(file: File): void {
    const upload: Upload = {
      file,
      stop: new AbortController(),
      source: null,
      run: Promise.resolve(''),
      failed: false,
      handed: false,
    };
    this.uploads.set(file, upload);
    this.attempt(upload);
  }

  private attempt(upload: Upload): void {
    upload.failed = false;
    const run = this.queue.then(() => this.send(upload));
    this.queue = run.catch(() => undefined);
    upload.run = run;
    run.then(
      () => this.events.progress(upload.file, 1),
      (error: unknown) => {
        if (this.uploads.get(upload.file) !== upload || upload.run !== run)
          return;
        upload.failed = true;
        this.events.failed(upload.file, error);
      },
    );
  }

  private async send(upload: Upload): Promise<string> {
    upload.stop.signal.throwIfAborted();
    const access = this.scoped(upload),
      prepared = await preparedSource(upload.file);
    upload.source ??= await this.source(prepared);
    return await sendMedia(access, upload.source, prepared.blob, (fraction) =>
      this.events.progress(upload.file, fraction),
    );
  }

  /** An earlier unfinished upload of the same bytes is resumed instead of
   * sending another copy. */
  private async source(
    prepared: PreparedSource,
  ): Promise<CommunityMediaSource> {
    this.pending ??= request(this.access, 'media-pending', {}).then((value) => {
      if (!Array.isArray(value) || value.length > 32)
        throw new Error('Invalid uploads state.');
      return value.map(communityMediaState);
    });
    const pending = this.pending;
    pending.catch(() => {
      if (this.pending === pending) this.pending = null;
    });
    const used = new Set(
      [...this.uploads.values()].map((upload) => upload.source?.id),
    );
    const old = (await pending).find(
      (state) =>
        state.source.hash === prepared.hash &&
        state.source.bytes === prepared.blob.size &&
        state.source.kind === prepared.kind &&
        !used.has(state.source.id),
    );
    return (
      old?.source ?? {
        id: crypto.randomUUID(),
        kind: prepared.kind,
        hash: prepared.hash,
        bytes: prepared.blob.size,
      }
    );
  }

  private scoped(upload: Upload): CommunityMediaAccess {
    return {
      ...this.access,
      signal: AbortSignal.any([this.access.signal, upload.stop.signal]),
      valid: () => this.access.valid() && !upload.stop.signal.aborted,
    };
  }

  private discard(upload: Upload): void {
    this.uploads.delete(upload.file);
    upload.stop.abort();
    if (!upload.handed) this.cancel(upload);
  }

  private close(): void {
    for (const upload of this.uploads.values()) {
      upload.stop.abort();
      if (!upload.handed) this.cancel(upload);
    }
    this.uploads.clear();
  }

  /** After the attempt settles, since the server refuses to cancel a file
   * while a request writes it. */
  private cancel(upload: Upload): void {
    void upload.run
      .catch(() => undefined)
      .then(async () => {
        const media = upload.source?.id;
        if (!media) return;
        await this.access.request('media-cancel', {
          id: this.access.community,
          media,
        });
      })
      .catch(() => {
        // Best effort: the server expires unattached uploads after 24 hours.
      });
  }
}
