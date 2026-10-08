/** Same-origin invalidation contains no account, contact or message data. */
let channel: BroadcastChannel | null = null;

/** Reuse the sender's channel so it cannot receive its own asynchronous echo. */
export function observeMessageControls(changed: () => void): () => void {
  window.addEventListener('0xdmme-message-controls', changed);
  const current =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel('0xdmme-message-controls');
  channel = current;
  current?.addEventListener('message', changed);
  return () => {
    window.removeEventListener('0xdmme-message-controls', changed);
    current?.removeEventListener('message', changed);
    current?.close();
    if (channel === current) channel = null;
  };
}
export function notifyMessageControls(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('0xdmme-message-controls'));
  if (typeof BroadcastChannel === 'undefined') return;
  const sender = channel ?? new BroadcastChannel('0xdmme-message-controls');
  sender.postMessage('changed');
  if (sender !== channel) sender.close();
}
