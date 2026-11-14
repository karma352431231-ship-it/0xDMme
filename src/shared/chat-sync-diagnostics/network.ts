const operations = new Set([
  'attachment-get',
  'backup-window',
  'backup-ack',
  'view-once-status',
  'view-once-open',
  'attachment-reserve',
  'attachment-part',
  'attachment-finish',
  'view-once-create',
  'view-once-cancel',
  'view-once-part',
  'snapshot',
  'confirm',
  'delivery',
  'page',
  'preview',
  'changes',
  'relations',
  'object',
  'acknowledge',
  'live',
  'publish',
  'delete',
  'directory',
  'history',
  'matrix-inbox',
  'matrix-received',
  'matrix-upload',
  'matrix-query',
  'matrix-claim',
  'matrix-send',
  'recovery-key',
  'recovery-current',
  'recovery-register',
  'recovery-peer',
  'daily-states',
  'daily-configure',
  'daily-heartbeat',
  'daily-read',
  'daily-receipts',
  'daily-push-state',
  'group-attachment-cancel',
  'group-attachment-finish',
  'group-attachment-get',
  'group-attachment-part',
  'group-attachment-reserve',
  'group-cancel',
  'group-cleanup-notice',
  'group-commit',
  'group-current',
  'group-daily-read',
  'group-daily-receipts',
  'group-daily-state',
  'group-directory',
  'group-history',
  'group-incoming',
  'group-link-current',
  'group-link-publish',
  'group-link-revoke',
  'group-list',
  'group-matrix-claim',
  'group-matrix-inbox',
  'group-matrix-query',
  'group-matrix-received',
  'group-matrix-send',
  'group-media-usage',
  'group-member-wallets',
  'group-message-accepted',
  'group-message-available',
  'group-message-changes',
  'group-message-confirm',
  'group-message-delete',
  'group-message-index',
  'group-message-delta',
  'group-message-objects',
  'group-message-publish',
  'group-message-received',
  'group-message-recent',
  'group-message-relations',
  'group-message-snapshot',
  'group-message-usage',
  'group-mode',
  'group-profile',
  'group-vault-clear',
  'group-preview',
  'group-snapshot',
  'group-confirm',
  'group-changes',
  'group-read',
  'group-page',
  'group-daily-states',
]);
const dmOperations = new Set([
  ...[...operations].map((operation) => `dm-${operation}`),
  ...[
    'accepted',
    'list',
    'state',
    'open',
    'secret-get',
    'secret-save',
    'personal-page',
    'personal-snapshot',
    'message-history',
    'message-status',
    'preview-status',
    'received',
  ].map((operation) => `dm-${operation}`),
]);
const calls = new Set([
  'sync',
  'start',
  'accept',
  'turn',
  'offer',
  'answer',
  'end',
  'configure',
]);
const areas = new Map([
  ['account', new Set(['session', 'profile'])],
  ['messages', new Set([...operations, ...dmOperations])],
  ['calls', calls],
  ['devices', new Set(['read', 'status'])],
  ['contacts', new Set(['state', 'list', 'snapshot', 'directory'])],
  ['vault', new Set(['index', 'object', 'heads', 'changes', 'read'])],
]);

/** Fixed categories only. Dynamic paths, query values and origins never escape. */
export function diagnosticRequestCategory(path: string): string {
  const parts = path.split('?')[0]!.split('/');
  if (
    parts.length === 4 &&
    parts[1] === 'api' &&
    parts[2] === 'account' &&
    ['session', 'profile'].includes(parts[3]!)
  )
    return 'account/' + parts[3]!;
  if (parts.length !== 5 || parts[1] !== 'api' || parts[2] !== 'account')
    return 'other-api';
  const area = parts[3]!,
    op = parts[4]!;
  return areas.get(area)?.has(op) ? area + '/' + op : 'other-account-api';
}
export function diagnosticCategory(value: unknown): value is string {
  if (value === 'other-api' || value === 'other-account-api') return true;
  if (typeof value !== 'string') return false;
  const [area, operation, extra] = value.split('/');
  return !extra && !!area && !!operation && !!areas.get(area)?.has(operation);
}
