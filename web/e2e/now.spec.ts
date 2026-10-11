// web/e2e/now.spec.ts
import { expect, gotoApp, test } from './fixtures';
import { KINDS, ageRun, agentRun, noHorizontalOverflow, note, nowPage, openKind, ready, seed, serverState, task } from './nowSeed';

test.use({ viewport: { width: 1440, height: 960 } });

const VIEWPORTS = [['desktop', { width: 1440, height: 960 }], ['mobile', { width: 390, height: 844 }]] as const;
const recommendation = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Next action' });

for (const kind of KINDS) {
  test(`${kind} uses real server state`, async ({ page, context, noema }) => {
    await openKind(page, context, noema, kind);
    const state = await serverState(noema);
    if (kind === 'new') {
      expect(state.tasks).toHaveLength(0);
      await expect(page.getByRole('heading', { name: 'Nothing tracked yet' })).toBeVisible();
    } else if (kind === 'complete') {
      expect(state.tasks.every(t => t.status === 'done')).toBe(true);
      await expect(recommendation(page)).toContainText('All tracked work is complete');
    } else {
      // The page names tasks that exist on the server (collapsed sections included), never fixtures.
      const rendered = (await nowPage(page).textContent()) ?? '';
      expect(state.tasks.some(t => rendered.includes(t.title))).toBe(true);
    }
  });

  for (const [label, size] of VIEWPORTS) {
    test(`${kind} / ${label} has no horizontal overflow`, async ({ page, context, noema }) => {
      await openKind(page, context, noema, kind);
      await page.setViewportSize(size);
      await page.locator('h1').scrollIntoViewIfNeeded();
      expect(await noHorizontalOverflow(page)).toBe(true);
    });
  }
}

test('navigation keeps its four destinations connected and offline', async ({ page, context, noema }) => {
  const links = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link');
  await openKind(page, context, noema, 'available');
  await expect(links).toHaveText(['Overview', 'Capture', 'Notes', 'Tasks']);
  await context.setOffline(true);
  await ready(page, 'disconnected');
  await expect(links).toHaveText(['Overview', 'Capture', 'Notes', 'Tasks']);
});

test('Disconnected cache has no currently actionable alternatives', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'disconnected');
  await expect(page.locator('details.alternatives')).toHaveCount(0);
  await expect(page.locator('[data-focus-kind=manual]')).toContainText('Last known · Selected by you');
  await expect(page.getByRole('combobox', { name: 'Available time' })).toHaveCount(0);
});

test('Disconnected cache does not claim available/completed/connected integrations', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'disconnected');
  await expect(page.locator('#integration-status')).toContainText('server disconnected');
  await expect(page.locator('#connection-label')).toHaveText('Offline · local drafts');
  await expect(recommendation(page)).toContainText('Current status unavailable');
  await expect(page.getByText('Available now', { exact: true })).toHaveCount(0);
  await expect(page.getByText('All tracked work is complete')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible();
});

test('Agent and dependency waiting reasons are distinct and real', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'waiting');
  await page.locator('details.waiting-work summary').click();
  await expect(page.locator('details.waiting-work')).toContainText('Waiting on: Trace ownership');
  await expect(page.locator('details.waiting-work')).toContainText('Waiting on an agent report');
});

test('Empty workspace has no agent setup or all-complete claim', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'new');
  await expect(page.getByRole('button', { name: 'Set up agent reporting' })).toHaveCount(0);
  await expect(page.getByText('All tracked work')).toHaveCount(0);
  await note(noema, 'Learning note: I am unsure about ownership. Not a commitment.');
  await page.reload();
  await ready(page, 'notes-only');
  expect((await serverState(noema)).tasks).toHaveLength(0);
});

test('Primary suggestion is singular and alternatives start collapsed', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  await expect(recommendation(page).locator('h2')).toHaveCount(1);
  await expect(recommendation(page).locator('details.alternatives')).toHaveCount(1);
  await expect(recommendation(page).locator('details.alternatives')).not.toHaveAttribute('open', '');
});

test('No duration, deadline or progress is fabricated', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  await expect(recommendation(page).locator('.inline-actions .small')).toHaveCount(0);
  await expect(page.getByText(/your estimate|Deadline|% done|progress/i)).toHaveCount(0);
  await expect(page.locator('[data-focus-kind=manual]')).toContainText('Selected by you');
  await page.locator('details.agent-status summary').click();
  await expect(page.locator('#integration-status')).toContainText('connection status unknown');
});

test('Inferred focus is separately labeled', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  const chosen = (await serverState(noema)).tasks.find(t => t.title === 'Study allocator cleanup')!;
  await noema.api('PATCH', '/api/settings', { observation_enabled: true });
  await noema.api('POST', '/api/context/rules', { app: 'noema-fixture', task_id: chosen.id });
  await noema.api('POST', '/api/context', { app: 'noema-fixture', title: 'Fixture window metadata' });
  await page.reload();
  await expect(page.locator('[data-focus-kind=inferred]')).toContainText('Inferred from window metadata');
});

test('Observer metadata never overrides a pinned focus', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  const tasks = (await serverState(noema)).tasks;
  const chosen = tasks.find(t => t.title === 'Study allocator cleanup')!;
  const pinned = tasks.find(t => t.title === 'Read the ownership chapter')!;
  await noema.api('PATCH', '/api/settings', { observation_enabled: true });
  await noema.api('POST', '/api/context/rules', { app: 'noema-fixture', task_id: chosen.id });
  await noema.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await noema.api('POST', '/api/context', { app: 'noema-fixture', title: 'Fixture window metadata' });
  await page.reload();
  await expect(page.locator('[data-focus-kind=pinned]')).toContainText('Pinned by you');
  expect((await serverState(noema)).focus).toMatchObject({ task_id: pinned.id, pinned: true });
});

test('Start pins the recommendation only when nothing is pinned', async ({ page, noema }) => {
  const only = await task(noema, 'Read the ownership chapter');
  await gotoApp(page, noema);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect.poll(async () => (await serverState(noema)).focus).toMatchObject({ task_id: only.id, pinned: true });
  await expect(page.locator('[data-focus-kind=pinned]')).toContainText('Pinned by you');
});

test('Completed agent result is still a review task, not completed work', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'attention');
  const state = await serverState(noema);
  expect(state.runs.some(r => r.status === 'review')).toBe(true);
  expect(state.tasks.every(t => t.status !== 'done')).toBe(true);
  await expect(page.getByRole('button', { name: /^Complete Review the cleanup result/ })).toHaveCount(0);
});

test('Zero running agents does not erase a reported question', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'attention');
  await page.locator('details.agent-status summary').click();
  await expect(page.locator('#integration-status')).toContainText('0 running · 1 awaiting input');
});

test('All-complete state has no agent onboarding prompt', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'complete');
  await expect(recommendation(page)).toContainText('All tracked work is complete');
  await expect(page.getByRole('button', { name: 'Set up agent reporting' })).toHaveCount(0);
});

test('Stale integration status is visibly unknown, not running or complete', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'unknown');
  await expect(page.locator('#integration-status')).toContainText('Agent status unknown');
  await expect(recommendation(page).locator('.primary')).toHaveText('Check agent status');
  await expect(page.locator('details.agent-status')).not.toContainText('Reported running');
  await expect(page.getByText('All tracked work is complete')).toHaveCount(0);
});

test('Overview shows focus provenance, one recommendation with its reason, Needs you and a running summary', async ({ page, noema }) => {
  const pinned = await task(noema, 'Study allocator cleanup');
  await noema.api('POST', '/api/focus', { task_id: pinned.id, pinned: true });
  await agentRun(noema, await task(noema, 'Answer the boundary-condition question'), 'needs_input');
  await agentRun(noema, await task(noema, 'Review the cleanup result'), 'completed');
  await agentRun(noema, await task(noema, 'Long agent job'));
  await gotoApp(page, noema);
  await expect(page.locator('.focus-line')).toContainText('Study allocator cleanup');
  await expect(page.locator('[data-focus-kind=pinned]')).toContainText('Pinned by you');
  await expect(recommendation(page).locator('h2')).toHaveText(['Answer the boundary-condition question']);
  await expect(recommendation(page).locator('h2 + p')).toHaveText('An agent needs your input.');
  const needsYou = page.getByRole('region', { name: 'Needs you' });
  await expect(needsYou).toContainText('Review the cleanup result');
  await expect(needsYou).toContainText('A result is ready for your review.');
  await expect(page.locator('details.agent-status')).not.toHaveAttribute('open', '');
  await expect(page.locator('details.agent-status summary')).toHaveText('Agent reports 2');
});

test('Real API-backed overview renders', async ({ page, noema }) => {
  await task(noema, 'Read the ownership chapter', { next_action: 'Start at the borrowing section.' });
  await gotoApp(page, noema);
  await expect(recommendation(page).locator('h2')).toHaveText('Read the ownership chapter');
  await expect(recommendation(page)).toContainText('Start at the borrowing section.');
});

test('Empty, waiting, review and offline/unknown fixture states rendered', async ({ page, context, noema }) => {
  await gotoApp(page, noema);
  await ready(page, 'new');
  expect(await noHorizontalOverflow(page)).toBe(true);
  await seed(noema, 'waiting');
  await page.reload();
  await ready(page, 'waiting');
  expect(await noHorizontalOverflow(page)).toBe(true);
  const waiting = (await serverState(noema)).runs[0];
  await noema.api('POST', `/api/runs/${waiting.id}/events`, { event_id: crypto.randomUUID(), seq: 2, kind: 'completed', message: 'Fixture result.' });
  await page.reload();
  await ready(page, 'attention');
  await expect(page.getByText('A result is ready for your review.').first()).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await context.setOffline(true);
  await ready(page, 'disconnected');
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('the time filter never invents an estimate', async ({ page, noema }) => {
  await task(noema, 'No estimate saved');
  await task(noema, 'Long known task', { estimate_minutes: 30 });
  await gotoApp(page, noema);
  await page.getByRole('combobox', { name: 'Available time' }).selectOption('15');
  await ready(page, 'filtered');
  await expect(page.getByRole('heading', { name: 'No work matches this time filter' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Available time' }).selectOption('');
  await ready(page, 'available');
});

test('a stale run is never presented as running in the Overview', async ({ page, noema }) => {
  const t = await task(noema, 'Check the missing agent report', { status: 'waiting' });
  ageRun(noema, (await agentRun(noema, t)).id);
  await gotoApp(page, noema);
  await expect(page.locator('details.agent-status')).toContainText('Fixture command wrapper · Status unknown');
});
