export type MatrixOperation =
  'matrix-upload' | 'matrix-query' | 'matrix-claim' | 'matrix-send';
export type MessageTransport = (
  operation: MatrixOperation,
  payload: Record<string, unknown>,
) => Promise<unknown>;
