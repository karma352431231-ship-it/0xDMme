import { accountSession } from '../../src/shared/account/index.ts';
/** Explicit test-only control. It uses the real logout API and leaves existing
 * keys/data intact, then creates a fresh synthetic login-device identifier. */
export function syntheticRecoveryControls(): void {
  const controls = document.createElement('aside');
  controls.className = 'card';
  const message = document.createElement('p');
  message.textContent =
    'Fixture de recuperação: wallet fictícia, sem fundos ou dados reais.';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Novo cadastro sintético para testar recuperação';
  reset.addEventListener('click', () => {
    reset.disabled = true;
    const run = async () => {
      const response = await fetch('/api/account/session', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Sessão indisponível.');
      const session = accountSession(await response.json());
      const logout = await fetch('/api/account/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hash-Talk-CSRF': session.csrf,
        },
        body: '{}',
      });
      if (!logout.ok) throw new Error('Logout recusado.');
      localStorage.setItem('hash-talk:login-device', crypto.randomUUID());
      location.reload();
    };
    void run().catch(() => {
      message.textContent = 'Fixture não concluiu o novo cadastro.';
      reset.disabled = false;
    });
  });
  controls.append(message, reset);
  document.querySelector('main')?.prepend(controls);
}
