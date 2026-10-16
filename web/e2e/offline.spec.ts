import { expect, test } from './fixtures';
import { openKind, ready } from './nowSeed';

test.use({ viewport: { width: 1440, height: 960 } });

test('Reconnect returns to real available work', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'disconnected');
  await expect(page.locator('.offline-banner')).toContainText('Server disconnected.');
  await expect(page.getByRole('region', { name: 'If you have a few minutes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Agents:/ })).toHaveCount(0);
  await context.setOffline(false);
  await ready(page, 'available');
  await expect(page.locator('.app')).toHaveAttribute('data-connection', 'online');
});
