// SPDX-License-Identifier: GPL-3.0-only
export const evaluationLabels = [
  'safe',
  'hentai',
  'porn',
  'sexy',
  'drawing',
] as const;
export const evaluationModelHash =
  '3c59deeabdc2d29295bf8e3ac7abc5aa6c90fa1d76f4c9df198b903e815d170e';
export type EvaluationLabel = (typeof evaluationLabels)[number];
export interface EvaluationResult {
  model: string;
  modelHash: string;
  elapsedMs: number;
  scores: Record<EvaluationLabel, number>;
}
export const evaluationReferences = ['safe', 'unsafe', 'uncertain'] as const;
export type EvaluationReference = (typeof evaluationReferences)[number];
export interface EvaluationCase extends EvaluationResult {
  id: string;
  imageHash: string;
  previewHash: string;
  mime: string;
  bytes: number;
  previewBytes: number;
  createdAt: number;
  reference: EvaluationReference;
}
export interface EvaluationRound {
  roundId: string;
  expiresAt: number;
  usedBytes: number;
  maxBytes: number;
  maxCases: number;
  cases: EvaluationCase[];
}
/** Experimental scores describe the candidate, never grant public publication. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object')
    throw new Error('Resultado inválido.');
  return value as Record<string, unknown>;
}
function identity(
  data: Record<string, unknown>,
): Omit<EvaluationResult, 'scores'> {
  if (
    data['model'] !== 'viddexa/nsfw-detection-2-nano' ||
    data['modelHash'] !== evaluationModelHash ||
    typeof data['elapsedMs'] !== 'number' ||
    !Number.isFinite(data['elapsedMs']) ||
    data['elapsedMs'] < 0
  )
    throw new Error('Resultado inválido.');
  return {
    model: data['model'],
    modelHash: evaluationModelHash,
    elapsedMs: data['elapsedMs'],
  };
}
function readScores(value: unknown): Record<EvaluationLabel, number> {
  const raw = record(value);
  const entries = Object.entries(raw);
  if (entries.length !== evaluationLabels.length)
    throw new Error('Cobertura inválida.');
  const scores = {} as Record<EvaluationLabel, number>;
  for (const label of evaluationLabels) {
    const score = raw[label];
    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1
    )
      throw new Error('Pontuações inválidas.');
    scores[label] = score;
  }
  if (
    Math.abs(Object.values(scores).reduce((sum, score) => sum + score, 0) - 1) >
    0.00001
  )
    throw new Error('Distribuição inválida.');
  return scores;
}
export function evaluationResult(value: unknown): EvaluationResult {
  const data = record(value);
  return { ...identity(data), scores: readScores(data['scores']) };
}
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function identifier(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value))
    throw new Error('Identificação inválida.');
  return value;
}
function integer(value: unknown, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  )
    throw new Error('Orçamento inválido.');
  return value;
}
export function evaluationReference(value: unknown): EvaluationReference {
  if (value !== 'safe' && value !== 'unsafe' && value !== 'uncertain')
    throw new Error('Escolha sua avaliação para esta imagem.');
  return value;
}
export function evaluationCase(value: unknown): EvaluationCase {
  const data = record(value),
    mime = data['mime'];
  if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp')
    throw new Error('Formato inválido.');
  return {
    ...evaluationResult(data),
    id: identifier(data['id'], uuid),
    imageHash: identifier(data['imageHash'], /^[a-f0-9]{64}$/),
    previewHash: identifier(data['previewHash'], /^[a-f0-9]{64}$/),
    mime,
    bytes: integer(data['bytes'], 8 * 1024 * 1024),
    previewBytes: integer(data['previewBytes'], 512 * 1024),
    createdAt: integer(data['createdAt'], Number.MAX_SAFE_INTEGER),
    reference: evaluationReference(data['reference']),
  };
}
function roundCases(value: unknown, maximum: number): EvaluationCase[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error('Galeria excedida.');
  const cases = value.map(evaluationCase);
  if (new Set(cases.map((entry) => entry.id)).size !== cases.length)
    throw new Error('Casos duplicados.');
  return cases;
}
export function evaluationRound(value: unknown): EvaluationRound {
  const data = record(value);
  const maxCases = integer(data['maxCases'], 256),
    maxBytes = integer(data['maxBytes'], 512 * 1024 * 1024);
  const cases = roundCases(data['cases'], maxCases);
  const usedBytes = cases.reduce(
    (sum, entry) => sum + entry.bytes + entry.previewBytes,
    0,
  );
  if (data['usedBytes'] !== usedBytes || usedBytes > maxBytes)
    throw new Error('Contabilidade inválida.');
  return {
    roundId: identifier(data['roundId'], uuid),
    expiresAt: integer(data['expiresAt'], Number.MAX_SAFE_INTEGER),
    usedBytes,
    maxBytes,
    maxCases,
    cases,
  };
}
