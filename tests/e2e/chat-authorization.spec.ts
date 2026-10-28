import {
  enrollmentUrl,
  readEnrollment,
} from '../../src/shared/device-enrollment/index.ts';
import { test, expect } from './fixtures/accounts.ts';
import { randomBytes } from 'node:crypto';

test('real device linking and revocation enforce server authorization', async ({
  accounts,
  browser,
  baseURL,
  loginAdmission,
}) => {
  if (!baseURL) throw new Error('Owned fixture origin missing.');
  const { a1 } = accounts;
  await a1.goto('/#settings?section=devices');
  await a1
    .getByRole('button', { name: 'Link another device', exact: true })
    .click();
  const code = a1.getByRole('textbox', {
    name: 'Device linking code',
    exact: true,
  });
  await expect(code).not.toHaveValue('');
  const invitation = await code.inputValue();
  const other = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  try {
    loginAdmission.attach(other);
    await other.addInitScript(
      (seed) => {
        if (location.protocol === 'http:')
          localStorage.setItem('fixture:wallet', seed);
      },
      `0x${randomBytes(32).toString('hex')}`,
    );
    const linked = await other.newPage();
    await linked.goto(
      enrollmentUrl(readEnrollment(invitation, baseURL), baseURL),
    );
    await linked.locator('[data-enrollment-confirm]').click();
    await expect(
      linked.getByRole('heading', {
        name: 'Successfully connected',
        exact: true,
      }),
    ).toBeVisible();
    await linked.getByRole('button', { name: 'Done', exact: true }).click();
    const [authorizedResponse] = await Promise.all([
      linked.waitForResponse(
        (response) =>
          response.url().endsWith('/contacts/snapshot') && response.ok(),
      ),
      linked.goto('/contacts'),
    ]);
    const proof = authorizedResponse.request();
    await loginAdmission.completed();
    await expect(a1.locator('[data-device-list] li')).toHaveCount(2);
    a1.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await a1.getByRole('button', { name: 'Revoke', exact: true }).click();
    await expect(a1.locator('[data-device-list] li')).toHaveCount(1);
    const response = await other.request.post(proof.url(), {
      headers: proof.headers(),
      data: proof.postData() ?? '',
    });
    expect([401, 403]).toContain(response.status());
  } finally {
    await other.close();
  }
});
