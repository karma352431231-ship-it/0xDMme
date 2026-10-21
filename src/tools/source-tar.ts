import { readBoundedFile } from './bounded-file.ts';
import { resolve } from 'node:path';

const block = 512;
const maximum = 24 * 1024 * 1024;

function field(header: Buffer, offset: number, value: string): void {
  header.write(value, offset, 'ascii');
}

function tarName(path: string): { name: string; prefix: string } {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
  const slash = path.lastIndexOf('/');
  const name = path.slice(slash + 1),
    prefix = path.slice(0, slash);
  if (
    slash < 0 ||
    Buffer.byteLength(name) > 100 ||
    Buffer.byteLength(prefix) > 155
  )
    throw new Error('Source path exceeds portable archive limits.');
  return { name, prefix };
}

function headerFor(path: string, size: number): Buffer {
  const header = Buffer.alloc(block);
  const { name, prefix } = tarName(path);
  header.write(name, 0, 'utf8');
  header.write(prefix, 345, 'utf8');
  field(header, 100, '0000644\0');
  field(header, 108, '0000000\0');
  field(header, 116, '0000000\0');
  field(header, 124, size.toString(8).padStart(11, '0') + '\0');
  field(header, 136, '00000000000\0');
  field(header, 148, '        ');
  field(header, 156, '0');
  field(header, 257, 'ustar\0');
  field(header, 263, '00');
  field(header, 329, '0000000\0');
  field(header, 337, '0000000\0');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  field(header, 148, checksum.toString(8).padStart(6, '0') + '\0 ');
  return header;
}

/** Canonical USTAR files: fixed owners, permissions, timestamps and ordering. */
export async function sourceTar(
  root: string,
  paths: Iterable<string>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 2 * block;
  for (const path of [...new Set(paths)].sort()) {
    if (
      !/^[A-Za-z0-9_@.-]+(?:\/[A-Za-z0-9_@.-]+)*$/u.test(path) ||
      path.split('/').some((part) => part === '..' || part === '.')
    )
      throw new Error('Invalid source archive path.');
    const content = await readBoundedFile(
      resolve(root, path),
      maximum - size - block,
    );
    const padding = (block - (content.byteLength % block)) % block;
    size += block + content.byteLength + padding;
    if (size > maximum)
      throw new Error('Source archive exceeds its byte budget.');
    chunks.push(
      headerFor(path, content.byteLength),
      content,
      Buffer.alloc(padding),
    );
  }
  return Buffer.concat([...chunks, Buffer.alloc(2 * block)]);
}
