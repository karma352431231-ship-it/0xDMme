/** Only encrypted frames enter the temporary file. The downloaded copy is independent. */
export class BackupOutput {
  private readonly parts: Blob[] = [];
  private readonly file: FileSystemFileHandle | null;
  private readonly directory: FileSystemDirectoryHandle | null;
  private readonly stream: FileSystemWritableFileStream | null;
  private closed = false;
  private disposed = false;
  private constructor(
    directory: FileSystemDirectoryHandle | null,
    file: FileSystemFileHandle | null,
    stream: FileSystemWritableFileStream | null,
  ) {
    this.directory = directory;
    this.file = file;
    this.stream = stream;
  }
  static async create(): Promise<BackupOutput> {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory)
      return new BackupOutput(null, null, null);
    const directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('0xdmme-backup-temporary', { create: true });
    await removeAbandoned(directory);
    const file = await directory.getFileHandle(
      `${Date.now()}-${crypto.randomUUID()}.tmp`,
      { create: true },
    );
    try {
      return new BackupOutput(directory, file, await file.createWritable());
    } catch (error: unknown) {
      await directory.removeEntry(file.name);
      throw error;
    }
  }
  async write(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    if (this.closed) throw new Error('Backup encerrado.');
    if (this.stream) await this.stream.write(bytes);
    else this.parts.push(new Blob([bytes]));
  }
  async finish(): Promise<Blob> {
    if (this.closed) throw new Error('Backup encerrado.');
    if (this.stream && this.file) {
      await this.stream.close();
      this.closed = true;
      return this.file.getFile();
    }
    this.closed = true;
    const file = new Blob(this.parts, { type: 'application/octet-stream' });
    this.parts.length = 0;
    return file;
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const wasClosed = this.closed;
    this.closed = true;
    this.parts.length = 0;
    try {
      if (!wasClosed && this.stream) await this.stream.abort();
    } finally {
      if (this.file && this.directory)
        await this.directory.removeEntry(this.file.name);
    }
  }
}
async function removeAbandoned(
  directory: FileSystemDirectoryHandle,
): Promise<void> {
  // DOM's iterable declarations are not required by the rest of the app.
  const iterable = directory as FileSystemDirectoryHandle & {
    keys: () => AsyncIterableIterator<string>;
  };
  let count = 0;
  for await (const name of iterable.keys()) {
    const created = Number(name.split('-')[0]);
    if (Number.isFinite(created) && Date.now() - created > 86400000)
      await directory.removeEntry(name);
    if (++count >= 128) break;
  }
}
