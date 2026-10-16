import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import { note, task } from './nowSeed';
import { REPO, type DharaServer } from './server';

// README screenshots: npm --prefix web run build && DHARA_SCREENSHOTS=1 npm --prefix web run e2e -- screenshots.spec.ts
test.skip(!process.env.DHARA_SCREENSHOTS, 'Set DHARA_SCREENSHOTS=1 to regenerate docs/screenshots');
test.use({ viewport: { width: 1440, height: 900 } });

const OUT = join(REPO, 'docs', 'screenshots');
const later = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const NOTE = `# Two pointers on a sorted array

Move the pointer on the side that cannot be part of an answer. Each step discards one candidate, so the scan is linear.

\`\`\`python
def pair_sum(nums: list[int], target: int) -> tuple[int, int] | None:
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        total = nums[lo] + nums[hi]
        if total == target:
            return lo, hi
        if total < target:
            lo += 1  # need a bigger sum
        else:
            hi -= 1
    return None
\`\`\`

Duplicates do not change the argument: skipping equal values only shortens the scan.`;

async function seed(dhara: DharaServer): Promise<string> {
  await dhara.api('PATCH', '/api/settings', { display_name: 'Sam' });
  const focus = await task(dhara, 'Finish the allocator write-up', { due_at: later(5), next_action: 'Draft the section on free-list coalescing.', estimate_minutes: 45, project: 'systems-notes' });
  await dhara.api('POST', '/api/focus', { task_id: focus.id, pinned: true });
  await task(dhara, 'Send the lease scan to the landlord', { planned_on: today(), estimate_minutes: 10 });
  await task(dhara, 'Review the pull request for the parser', { due_at: later(30), project: 'dhara' });
  await task(dhara, 'Practice two-pointer problems', { planned_on: today(), estimate_minutes: 30, priority: 'medium' });
  await task(dhara, 'Read the ownership chapter', { estimate_minutes: 40 });
  await task(dhara, 'Someday: tidy the dotfiles', {});
  const asking = await dhara.api<{ id: string }>('POST', '/api/runs', { task_id: (await task(dhara, 'Which job boards should the scraper cover first?', { project: 'job-watcher' })).id, agent: 'Claude Code' });
  await dhara.api('POST', `/api/runs/${asking.id}/events`, { event_id: crypto.randomUUID(), seq: 1, kind: 'needs_input', message: 'Which boards first?' });
  await dhara.api('POST', '/api/runs', { task_id: (await task(dhara, 'Refactor the capture outbox', { project: 'dhara' })).id, agent: 'Codex' });
  const open = await note(dhara, NOTE);
  await note(dhara, 'Free-list coalescing: merge a freed block with free neighbours using boundary tags, so fragmentation stays bounded.');
  await note(dhara, 'Ownership: a value has one owner; moving it ends the old binding. Borrows are checked at compile time.');
  await note(dhara, 'GCD checksum is just a running sum, not a hash.');
  return open.id;
}

async function shot(page: Page, name: string, options: { omitBackground?: boolean; fullPage?: boolean } = {}): Promise<void> {
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${name}.png`), ...options });
}

test('README screenshots', async ({ page, dhara }) => {
  mkdirSync(OUT, { recursive: true });
  const noteId = await seed(dhara);

  await gotoApp(page, dhara);
  await page.getByRole('button', { name: /^Agents:/ }).click();
  await shot(page, 'home', { fullPage: true });

  await gotoApp(page, dhara, `#/notes?note=${noteId}`);
  await expect(page.locator('pre.code-block')).toBeVisible();
  await shot(page, 'notes');

  await gotoApp(page, dhara, '#/plan');
  await expect(page.locator('.task-board')).toBeVisible();
  await shot(page, 'tasks');

  await gotoApp(page, dhara, '#/settings');
  await expect(page.getByLabel('OpenRouter key')).toBeVisible();
  await page.locator('section', { has: page.locator('#settings-ai') }).screenshot({ path: join(OUT, 'settings-ai.png') });

  await dhara.api('PATCH', '/api/settings', { theme: 'light' });
  await gotoApp(page, dhara);
  await shot(page, 'home-light');
  await dhara.api('PATCH', '/api/settings', { theme: 'dark' });

  await page.setViewportSize({ width: 400, height: 720 });
  await gotoApp(page, dhara, '#/companion');
  await page.getByRole('button', { name: /^Dhara companion:/ }).click();
  await expect(page.getByRole('region', { name: 'Dhara mini panel' })).toBeVisible();
  await shot(page, 'kitty-panel', { omitBackground: true });
});
