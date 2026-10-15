import { expect, gotoApp, refetch, test } from './fixtures';
import { changeElsewhere, task } from './nowSeed';

test('an edit in progress survives a snapshot refetch', async ({ page, dhara }) => {
  const t = await task(dhara, 'Shared task');
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /^Shared task/ }).click();
  await page.getByRole('dialog', { name: 'Shared task' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await editor.getByLabel('Title', { exact: true }).fill('Half-typed title');
  await changeElsewhere(dhara, t.id, { next_action: 'Changed on another device' });
  await refetch(page);
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Half-typed title');
});

test('Add task input survives a snapshot refetch', async ({ page, dhara }) => {
  await gotoApp(page, dhara, '#/plan');
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  const add = page.getByRole('dialog', { name: 'Add task' });
  await add.getByLabel('What do you need to do?').fill('Half-typed task');
  await task(dhara, 'Created elsewhere');
  await refetch(page);
  await expect(page.locator('.plan-list')).toContainText('Created elsewhere');
  await expect(add.getByLabel('What do you need to do?')).toHaveValue('Half-typed task');
});
