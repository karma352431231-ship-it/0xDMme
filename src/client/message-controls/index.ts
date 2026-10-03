/** Same-origin invalidation contains no account, contact or message data. */
export function notifyMessageControls(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('0xdmme-message-controls'));
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('0xdmme-message-controls');
  channel.postMessage('changed');
  channel.close();
}
