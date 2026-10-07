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
