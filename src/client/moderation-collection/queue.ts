// SPDX-License-Identifier: GPL-3.0-only
const maxBytes = 8 * 1024 * 1024;
export class ImageQueue {
  private files: File[] = [];
  get current(): File | undefined {
    return this.files[0];
  }
  get length(): number {
    return this.files.length;
  }
  add(files: File[]): void {
    if (this.files.length + files.length > 256)
      throw new Error('Escolha no máximo 256 imagens por rodada.');
    for (const file of files) {
      if (
        file.size < 1 ||
        file.size > maxBytes ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      )
        throw new Error('Use PNG, JPEG ou WebP de até 8 MiB por imagem.');
    }
    const bytes = [...this.files, ...files].reduce(
      (total, file) => total + file.size,
      0,
    );
    if (bytes > 512 * 1024 * 1024)
      throw new Error('A fila deve ocupar até 512 MiB.');
    this.files.push(...files);
  }
  next(): void {
    this.files.shift();
  }
}
