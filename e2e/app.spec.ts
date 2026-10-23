import { expect, type Page, test } from '@playwright/test';

// Sample-data logins (see README); the e2e database is reset before every run.
const ADMIN = { email: 'admin@resourceboard.local', password: 'Admin@12345' };
const PM = { email: 'priya.sharma@resourceboard.local', password: 'Password@123' }; // owns ATLAS, ORION
const MEMBER = { email: 'liam.chen@resourceboard.local', password: 'Password@123' };

async function signIn(page: Page, who: { email: string; password: string }, path = '/dashboard') {
  await page.goto(path);
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

const dialog = (page: Page) => page.getByRole('dialog');

/** The app's toast (the drag-and-drop library also has a role=status live region). */
const toast = (page: Page) => page.getByRole('status').filter({ hasNotText: 'Draggable' });

/** The value shown on a dashboard KPI tile, e.g. "526.0hrs". */
const kpi = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator('xpath=..');

test('signed-out visitors go to sign-in and come back to the page they asked for', async ({
  page,
}) => {
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects/);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
});

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('don’t match');
});

test('dashboard shows the KPIs and the project filter applies to them', async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(kpi(page, 'Total demand')).toContainText('hrs');
  await expect(page.getByText('Demand vs availability')).toBeVisible();
  await expect(page.getByText('Utilization by person')).toBeVisible();

  // NOVA is non-billable, so filtering to it leaves no billable demand.
  await page.getByLabel('Project').selectOption({ label: 'Nova Data Platform' });
  await expect(kpi(page, 'Billable demand')).toContainText('0.0');
});

test('a PM creates a task in the dialog, then edits it from the task list', async ({ page }) => {
  await signIn(page, PM);
  await page.getByRole('button', { name: 'Create task' }).click();
  const d = dialog(page);
  await d.getByLabel('Summary').fill('E2E: export utilization report');
  await d.getByLabel('Project').selectOption({ label: 'ATLAS · Atlas Customer Portal' });
  await d.getByLabel('Assignee').selectOption({ label: 'Liam Chen' });
  await d.getByLabel('Estimate (hours)').fill('12');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toHaveText('Task created');

  await page.getByRole('link', { name: 'Tasks' }).click();
  await page.getByLabel('Search tasks').fill('E2E: export');
  const row = page.getByRole('row', { name: /E2E: export utilization report/ });
  await expect(row).toContainText('To do');

  await row.click();
  await dialog(page).getByLabel('Status').selectOption({ label: 'In progress' });
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(row).toContainText('In progress');
});

test('a due date before the start date is not accepted', async ({ page }) => {
  await signIn(page, PM);
  await page.getByRole('button', { name: 'Create task' }).click();
  const d = dialog(page);
  await d.getByLabel('Summary').fill('E2E: bad dates');
  await d.getByLabel('Start').fill('2026-11-10');
  await d.getByLabel('Due').fill('2026-11-02');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toBeVisible();
  await expect(d.getByLabel('Due')).toHaveJSProperty('validity.valid', false);
});

test('a team member can only change the status of their own tasks', async ({ page }) => {
  await signIn(page, MEMBER, '/tasks');
  await expect(page.getByRole('button', { name: 'Create task' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

  await page.getByRole('row', { name: /Invoice PDF download/ }).click();
  const d = dialog(page);
  await expect(d.getByLabel('Summary')).toBeDisabled();
  await expect(d.getByLabel('Status')).toBeEnabled();
  await expect(d).toContainText('tasks assigned to you');
});

test('a PM moves a card on the board by dragging it', async ({ page }) => {
  await signIn(page, PM, '/board');
  const card = page.getByRole('button', { name: /Project kickoff deck/ });
  const target = page.getByRole('region', { name: 'In progress' });
  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 15 });
  await page.mouse.up();
  await expect(toast(page)).toContainText('moved to In progress');
  await expect(target).toContainText('Project kickoff deck');
});

test('an admin adds a project with team members, then deletes it', async ({ page }) => {
  await signIn(page, ADMIN, '/projects');
  await page.getByRole('button', { name: 'Add project' }).click();
  const d = dialog(page);
  await d.getByLabel('Key').fill('e2e');
  await d.getByLabel('Name').fill('E2E Project');
  await d.getByLabel('Client', { exact: true }).fill('Contoso');
  await d.getByRole('checkbox', { name: /Arjun Mehta/ }).check();
  await d.getByRole('checkbox', { name: /Meera Iyer/ }).check();
  await d.getByRole('button', { name: 'Save' }).click();

  const row = page.getByRole('row', { name: /E2E Project/ });
  await expect(row).toContainText('E2E');
  await expect(row.getByTitle('Arjun Mehta, Meera Iyer')).toBeVisible();

  page.once('dialog', (confirm) => confirm.accept());
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(toast(page)).toHaveText('E2E deleted');
  await expect(row).toHaveCount(0);
});

test('a new person signs in with a temporary password and must choose their own', async ({
  page,
}) => {
  await signIn(page, ADMIN, '/teams');
  await page.getByRole('button', { name: 'Add person' }).click();
  const d = dialog(page);
  await d.getByLabel('Name').fill('Nisha Verma');
  await d.getByLabel('Email').fill('nisha.verma@resourceboard.local');
  await d.getByLabel('Department').fill('Engineering');
  await d.getByLabel('Temporary password').fill('Welcome2026');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /Nisha Verma/ })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Email').fill('nisha.verma@resourceboard.local');
  await page.getByLabel('Password').fill('Welcome2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible();

  await page.getByLabel('Temporary password').fill('Welcome2026');
  await page.getByLabel('New password', { exact: true }).fill('NishaChose9');
  await page.getByLabel('Confirm new password').fill('NishaChose9');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('link', { name: /Nisha Verma/ })).toBeVisible();
});

test('staffing is read-only for a PM', async ({ page }) => {
  await signIn(page, PM, '/projects');
  await expect(page.getByRole('button', { name: 'Add project' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Team' }).click();
  await expect(page.getByRole('button', { name: 'Add person' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
});

test('a PM deletes several tasks at once, only on their own projects', async ({ page }) => {
  await signIn(page, PM, '/tasks');
  // NOVA belongs to the other PM, so its tasks can't be selected.
  await expect(page.getByLabel('Select RB-14')).toHaveCount(0);

  const first = page.getByRole('row', { name: /RB-6\b/ });
  const second = page.getByRole('row', { name: /RB-11\b/ });
  await page.getByLabel('Select RB-6').check();
  await page.getByLabel('Select RB-11').check();
  const bar = page.getByRole('region', { name: 'Selected tasks' });
  await expect(bar).toContainText('2 tasks selected');

  page.once('dialog', (confirm) => confirm.accept());
  await bar.getByRole('button', { name: 'Delete selected' }).click();
  await expect(toast(page)).toHaveText('Deleted 2 tasks');
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(0);
  await expect(bar).toHaveCount(0);
});

test('the task list pages through results and returns to page 1 when filtering', async ({
  page,
}) => {
  await signIn(page, ADMIN, '/tasks');
  const pager = page.getByRole('navigation', { name: 'tasks pages' });
  await pager.getByLabel('Rows per page').selectOption('10');
  await expect(pager).toContainText(/Showing 1–10 of \d+ tasks/);
  await expect(page.locator('tbody tr')).toHaveCount(10);

  await pager.getByRole('button', { name: 'Next →' }).click();
  await expect(pager).toContainText(/Showing 11–20 of/);
  await expect(pager.getByRole('button', { name: 'Page 2' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByLabel('Project').selectOption({ label: 'Orion Mobile Refresh' });
  await expect(pager).toContainText(/Showing 1–\d of \d tasks/);
});
