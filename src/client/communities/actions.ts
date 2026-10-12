export interface CommunityActions {
  mutate: (operation: string, data: Record<string, unknown>) => Promise<void>;
  query: (work: () => Promise<void>) => Promise<void>;
  request: (
    operation: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
}
