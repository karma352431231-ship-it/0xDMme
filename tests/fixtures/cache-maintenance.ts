export {};

const action = document.querySelector<HTMLButtonElement>(
  '#clear-fixture-cache',
);
const report = document.querySelector<HTMLElement>('#fixture-cache-result');
if (!action || !report) throw new Error('Incomplete synthetic cache tool.');
const button = action;
const status = report;

async function clearInstallation(): Promise<void> {
  const root = new URL('/', location.href).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const names = (await caches.keys()).filter((name) =>
    name.startsWith('hash-talk-shell-'),
  );
  if (registrations.length > 8 || names.length > 32)
    throw new Error('Unexpected fixture cache inventory.');
  for (const registration of registrations)
    if (registration.scope === root) await registration.unregister();
  for (const name of names) await caches.delete(name);
}

button.addEventListener('click', () => {
  button.disabled = true;
  status.textContent = 'Clearing only the fixture installation cache…';
  void clearInstallation().then(
    () => {
      status.textContent =
        'Fixture installation cache cleared. Account storage was not accessed.';
    },
    () => {
      status.textContent =
        'Fixture cache cleanup failed. No completed cleanup is claimed.';
    },
  );
});
