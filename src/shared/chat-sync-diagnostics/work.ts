export interface WorkDiagnosticFields {
  operation?: string;
  outcome?:
    | 'complete'
    | 'interrupted'
    | 'timeout'
    | 'authorization'
    | 'conflict'
    | 'cancelled'
    | 'failed';
  origin?:
    | 'navigation'
    | 'replacement'
    | 'continuation'
    | 'scheduler'
    | 'session'
    | 'authorization'
    | 'removal';
  queueMs?: number;
  runMs?: number;
}
export function copyWorkDiagnostic(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  const operation = input['operation'];
  if (
    typeof operation === 'string' &&
    operation.length <= 80 &&
    /^[a-z]+(?:[/-][a-z]+)*$/u.test(operation)
  )
    result['operation'] = operation;
  copyTimes(input, result);
  if (
    [
      'complete',
      'interrupted',
      'timeout',
      'authorization',
      'conflict',
      'cancelled',
      'failed',
    ].includes(String(input['outcome']))
  )
    result['outcome'] = input['outcome'];
  if (
    [
      'navigation',
      'replacement',
      'continuation',
      'scheduler',
      'session',
      'authorization',
      'removal',
    ].includes(String(input['origin']))
  )
    result['origin'] = input['origin'];
}

function copyTimes(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  for (const key of ['queueMs', 'runMs']) {
    const value = input[key];
    if (
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= 3_600_000
    )
      result[key] = value;
  }
}
