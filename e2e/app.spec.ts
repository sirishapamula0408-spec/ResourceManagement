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

  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
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
  // The team list is paged (10 per page); show more so the new person is on screen.
  await page
    .getByRole('navigation', { name: 'people pages' })
    .getByLabel('Rows per page')
    .selectOption('25');
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
  await page.getByRole('link', { name: 'Team', exact: true }).click();
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

test('a team member sees only their own projects, board, tasks and figures', async ({ page }) => {
  // Liam is on ATLAS only and has two tasks assigned to him there.
  await signIn(page, MEMBER, '/projects');
  await expect(page.getByText('Projects you are on')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('row', { name: /Atlas Customer Portal/ })).toBeVisible();

  await page.getByRole('link', { name: 'Board', exact: true }).click();
  await expect(page.getByRole('button', { name: /Invoice PDF download/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Payments webhook handler/ })).toBeVisible(); // teammate, ATLAS
  await expect(page.getByRole('button', { name: /CRM ingestion job/ })).toHaveCount(0); // NOVA
  await expect(page.getByRole('button', { name: /Mobile UX research/ })).toHaveCount(0); // ORION

  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('Tasks assigned to you')).toBeVisible();
  await expect(page.getByLabel('Assignee')).toHaveCount(0);
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) await expect(row).toContainText('Liam Chen');

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByText(/Your own workload/)).toBeVisible();
  await expect(kpi(page, 'On bench this week')).toContainText('of 1');

  await page.getByRole('link', { name: 'Team', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'people pages' })).toContainText('of 1 people');
  await expect(page.getByRole('row', { name: /Liam Chen/ })).toBeVisible();
});

test('reports: weekly and monthly project status reports with CSV download', async ({ page }) => {
  await signIn(page, ADMIN, '/reports');
  await expect(page.getByText('Weekly project status report')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Week \d+/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Portfolio summary' })).toBeVisible();
  const atlas = page.getByRole('region', { name: 'ATLAS status' });
  await expect(atlas).toContainText(/On track|At risk|Off track/);
  await expect(atlas).toContainText('Completed this week');
  await expect(atlas).toContainText('Team effort this week');
  await page.screenshot({ path: 'test-results/reports-weekly.png', fullPage: true });

  await page.getByRole('button', { name: 'Monthly' }).click();
  await expect(page.getByText('Monthly project status report')).toBeVisible();
  const month = page.getByRole('heading', { level: 2 });
  await expect(month).toHaveText(/^[A-Z][a-z]+ \d{4}$/);
  const thisMonth = await month.textContent();
  await page.getByRole('button', { name: '← Previous' }).click();
  await expect(month).not.toHaveText(thisMonth!);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^project-status-\d{4}-\d{2}\.csv$/);
  const csv = await (await download.createReadStream()).toArray();
  expect(Buffer.concat(csv).toString('utf8')).toContain('Project key');

  // Back to this week, then export the same report as PowerPoint.
  await page.getByRole('button', { name: 'Weekly' }).click();
  const [deck] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PowerPoint' }).click(),
  ]);
  expect(deck.suggestedFilename()).toMatch(/^project-status-\d{4}-W\d{2}\.pptx$/);
  await deck.saveAs('test-results/report-weekly.pptx');
  const bytes = Buffer.concat(await (await deck.createReadStream()).toArray());
  expect(bytes.subarray(0, 2).toString()).toBe('PK'); // a zip container, as .pptx files are
  expect(bytes.length).toBeGreaterThan(20_000);
});

test('a team member only gets reports for their own projects', async ({ page }) => {
  await signIn(page, MEMBER, '/reports');
  await expect(page.getByText('Status of the projects you are on')).toBeVisible();
  await expect(page.getByRole('region', { name: 'ATLAS status' })).toBeVisible();
  await expect(page.getByRole('region', { name: /NOVA status|ORION status/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Portfolio summary' })).toHaveCount(0);
});

const SALES = { email: 'rohan.gupta@resourceboard.local', password: 'Sales@12345' };

test('a sales user lands on Leads, logs a lead and sets its priority', async ({ page }) => {
  await signIn(page, SALES, '/');
  await expect(page).toHaveURL(/\/leads$/);
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(nav.getByRole('link')).toHaveText(['Leads', 'Projects']);
  await expect(page.getByRole('region', { name: 'Pipeline summary' })).toContainText(
    'Open pipeline',
  );
  await expect(page.getByRole('row', { name: /Kaveri Finance/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/leads-sales.png', fullPage: true });

  await page.getByRole('button', { name: 'Add lead' }).click();
  const d = dialog(page);
  await d.getByLabel('Company').fill('E2E Shipping Co');
  await d.getByLabel('Contact name').fill('Asha Verma');
  await d.getByLabel('Contact email').fill('asha@e2e-shipping.example');
  await d.getByLabel('Stage').selectOption({ label: 'Qualified' });
  await d.getByLabel('Priority').selectOption({ label: 'Low' });
  await d.getByLabel('Estimated value (₹)').fill('1250000');
  await d.getByLabel('Next follow-up').fill('2026-11-05');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toHaveText('E2E Shipping Co added');
  // 45 sample leads span two pages, so find the new one by searching.
  await page.getByLabel('Search leads').fill('E2E Shipping');
  const row = page.getByRole('row', { name: /E2E Shipping Co/ });
  await expect(row).toContainText('Qualified');
  await expect(row).toContainText('₹12,50,000');
  await expect(row).toContainText('Low');

  await row.click();
  await dialog(page).getByLabel('Priority').selectOption({ label: 'High' });
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(row).toContainText('High');

  await page.getByRole('combobox', { name: 'Priority' }).selectOption({ label: 'High' });
  await expect(row).toBeVisible();
});

test('a sales user sees projects read-only and nothing else', async ({ page }) => {
  await signIn(page, SALES, '/projects');
  await expect(page.getByRole('columnheader', { name: 'Client' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Open tasks' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add project' })).toHaveCount(0);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/leads$/);

  const status = await page.evaluate(async () => {
    const token = localStorage.getItem('rb.token');
    const res = await fetch('/api/tasks', { headers: { Authorization: `Bearer ${token}` } });
    return res.status;
  });
  expect(status).toBe(403);
});

test('PMs can read the pipeline; team members have no Leads page', async ({ page }) => {
  await signIn(page, PM, '/leads');
  await expect(
    page.getByText('View only: sales users and admins update the pipeline.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add lead' })).toHaveCount(0);
  await page.getByRole('row', { name: /Kaveri Finance/ }).click();
  await expect(dialog(page).getByLabel('Company')).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Close' }).first().click();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, MEMBER);
  await expect(page.getByRole('link', { name: 'Leads', exact: true })).toHaveCount(0);
  const status = await page.evaluate(async () => {
    const token = localStorage.getItem('rb.token');
    return (await fetch('/api/leads', { headers: { Authorization: `Bearer ${token}` } })).status;
  });
  expect(status).toBe(403);
});
