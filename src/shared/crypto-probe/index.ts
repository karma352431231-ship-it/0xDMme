export const roles = ['alice', 'bob'] as const;
export type Role = (typeof roles)[number];
export type Operation =
  | 'upload'
  | 'query'
  | 'claim'
  | 'to-device'
  | 'publish'
  | 'poll'
  | 'vault-save'
  | 'vault-load';
export type JsonObject = Record<string, unknown>;
export type ProbeTransport = (
  operation: Operation,
  body: string,
) => Promise<string>;
export const room = '!probe:probe.invalid';
export const maxBodyBytes = 65_536;
export const maxResponseBytes = 1_200_000;

export function identity(role: Role) {
  return { user: `@${role}:probe.invalid`, device: role.toUpperCase() };
}

export function peer(role: Role): Role {
  return role === 'alice' ? 'bob' : 'alice';
}

export function record(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Objeto inválido.');
  }
  return value as JsonObject;
}

export function parseObject(value: string): JsonObject {
  return record(JSON.parse(value) as unknown);
}

export function text(value: unknown, maximum = 16_384): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum
  ) {
    throw new Error('Texto inválido.');
  }
  return value;
}

export function onlyKeys(value: JsonObject, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error('Campo não permitido.');
  }
}

export function isRole(value: unknown): value is Role {
  return value === 'alice' || value === 'bob';
}

export function isOperation(value: unknown): value is Operation {
  return (
    typeof value === 'string' &&
    [
      'upload',
      'query',
      'claim',
      'to-device',
      'publish',
      'poll',
      'vault-save',
      'vault-load',
    ].includes(value)
  );
}
