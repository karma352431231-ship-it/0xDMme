/** Fixed error reasons in hash-pinned sources; resolve only at the error display boundary. */
const legacyErrors: ReadonlyMap<string, string> = new Map([
  ['Metadados inválidos.', 'Invalid media metadata.'],
  ['Metadados excedidos.', 'Media metadata exceeds the limit.'],
  ['Inspeção incompleta.', 'Media inspection incomplete.'],
  ['Sequência inválida.', 'Invalid media sequence.'],
  [
    'Sequência excedida ou vazia.',
    'Media sequence is empty or exceeds the limit.',
  ],
  ['Decodificação incompleta.', 'Media decoding incomplete.'],
  [
    'Cobertura da análise incompleta.',
    'Media analysis coverage is incomplete.',
  ],
  ['Frame inválido.', 'Invalid media frame.'],
  ['Sequência de mídia excedida.', 'Media sequence exceeds the limit.'],
  ['Dimensão da análise inválida.', 'Invalid media analysis dimensions.'],
  ['Mídia preparada inválida.', 'Invalid prepared media.'],
  ['Cobertura da análise inválida.', 'Invalid media analysis coverage.'],
  [
    'Modelo/política da análise divergente.',
    'Media analysis model or policy mismatch.',
  ],
  ['Mídia preparada divergente.', 'Prepared media mismatch.'],
  ['Análise pública indisponível.', 'Public analysis unavailable.'],
  ['Duração de mídia inválida.', 'Invalid media duration.'],
  ['FPS de mídia inválido.', 'Invalid media frame rate.'],
]);

export function legacyErrorSource(message: string): string | undefined {
  return legacyErrors.get(message);
}
