export interface TraceEvent {
  ms: number;
  kind: string;
  [field: string]: string | number | boolean | readonly string[];
}
export type RecordEvent = (
  kind: string,
  data?: Omit<TraceEvent, 'ms' | 'kind'>,
) => void;
