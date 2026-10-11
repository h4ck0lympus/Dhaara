// web/e2e/offline.spec.ts
import { expect, test } from './fixtures';
import { openKind, ready } from './nowSeed';

test.use({ viewport: { width: 1440, height: 960 } });

test('Reconnect returns to real available work', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'disconnected');
  await expect(page.locator('#integration-status')).toContainText('server disconnected');
  await context.setOffline(false);
  await ready(page, 'available');
  await expect(page.locator('#connection-label')).toHaveText('Server connected');
});
