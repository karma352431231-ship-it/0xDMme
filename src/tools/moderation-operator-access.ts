import { constants } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { keys, object } from '../shared/account/index.ts';
import type { Stats } from 'node:fs';

export interface OperatorConfiguration {
  databaseUrl: string;
  objectDirectory: string;
}
async function privateDirectory(directory: string): Promise<number> {
  const parent = await lstat(directory),
    uid = process.getuid?.();
  if (
    uid === undefined ||
    !parent.isDirectory() ||
    parent.uid !== uid ||
    (parent.mode & 0o077) !== 0 ||
    (await realpath(directory)) !== directory
  )
    throw new Error(
      'Diretório privado do operador requer proprietário atual e modo 0700.',
    );
  return uid;
}
function privateConfiguration(stat: Stats, uid: number): void {
  if (
    !stat.isFile() ||
    stat.uid !== uid ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.size > 4096
  )
    throw new Error(
      'Configuração do operador requer arquivo próprio, regular, modo 0600 e até 4 KiB.',
    );
}
function configuration(value: unknown): OperatorConfiguration {
  const input = object(value);
  keys(input, ['databaseUrl', 'objectDirectory']);
  if (
    typeof input['databaseUrl'] !== 'string' ||
    !['postgres:', 'postgresql:'].includes(
      new URL(input['databaseUrl']).protocol,
    )
  )
    throw new Error('Banco do operador inválido.');
  if (
    typeof input['objectDirectory'] !== 'string' ||
    !isAbsolute(input['objectDirectory'])
  )
    throw new Error('Diretório de objetos do operador inválido.');
  return {
    databaseUrl: input['databaseUrl'],
    objectDirectory: input['objectDirectory'],
  };
}
/** OS ownership is the operator authority. The app's web user cannot provision it. */
export async function readOperatorConfiguration(
  root: string,
): Promise<OperatorConfiguration> {
  const directory = resolve(root, '.local');
  const uid = await privateDirectory(directory);
  const file = await open(
    resolve(directory, 'moderation-operator.json'),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    privateConfiguration(await file.stat(), uid);
    return configuration(JSON.parse(await file.readFile('utf8')) as unknown);
  } finally {
    await file.close();
  }
}
