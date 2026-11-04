import { expect, type Page, test } from '@playwright/test';

// Sample-data logins (see README); the e2e database is reset before every run.
const ADMIN = { email: 'admin@resourceboard.local', password: 'Admin@12345' };
const PM = { email: 'priya.sharma@resourceboard.local', password: 'Password@123' }; // owns ATLAS, ORION
const MEMBER = { email: 'liam.chen@resourceboard.local', password: 'Password@123' };

async function signIn(page: Page, who: { email: string; password: string }, path = '/dashboard') {
  await page.goto(path);
  await page.getByLabel('Work email').fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
  await page.getByLabel('Work email').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
});

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');
});

test('sign-in checks the fields when they lose focus and on submit', async ({ page }) => {
  await page.goto('/login');
  const email = page.getByLabel('Work email');
  const password = page.getByLabel('Password', { exact: true });
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute('autocomplete', 'username');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');

  await email.fill('not-an-email');
  await email.press('Tab');
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveAttribute('aria-describedby', 'login-email-error');

  // Submitting shows every problem and puts the cursor on the first one; nothing is sent.
  let sent = 0;
  await page.route('**/api/auth/login', (route) => {
    sent++;
    return route.continue();
  });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter your password.')).toBeVisible();
  await expect(email).toBeFocused();
  expect(sent).toBe(0);

  await email.fill(ADMIN.email);
  await expect(page.getByText('Enter a valid email address')).toHaveCount(0);
  await expect(email).toHaveAttribute('aria-invalid', 'false');
});

test('sign-in page: no SSO or sign-up link by default, Remember me off', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Access your workspace')).toBeVisible();
  // VITE_SSO_ENABLED is not set for the e2e build: no Microsoft button and no "or" divider.
  await expect(page.getByText(/Microsoft/)).toHaveCount(0);
  await expect(page.getByText('or', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Create an account')).toHaveCount(0);
  await expect(page.getByText('Need access?')).toBeVisible();
  await expect(page.getByLabel('Remember me')).not.toBeChecked();
  for (const badge of [
    'Encrypted connection (TLS)',
    'Role-based access control',
    'Audit-logged access',
  ]) {
    await expect(page.getByText(badge)).toBeVisible();
  }
  // Page chrome: tab title, footer with the version, no environment badge in a PROD build.
  await expect(page).toHaveTitle('Sign in · SedHub');
  await expect(page.locator('footer')).toHaveText(
    /^© d{4} Sedin Technologies · Privacy · Terms · vd+.d+.d+$/,
  );
  await expect(page.getByText('Environment:')).toHaveCount(0);
  await signIn(page, PM, '/login');
  await expect(page).toHaveTitle('SedHub');
});

test('Enter signs in once, with a loading state, and the session ends with the browser', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let sent = 0;
  await page.route('**/api/auth/login', async (route) => {
    sent++;
    await gate;
    await route.continue();
  });
  await page.goto('/login');
  await page.getByLabel('Work email').fill(PM.email);
  const password = page.getByLabel('Password', { exact: true });
  await password.fill(PM.password);
  await password.press('Enter');

  const busy = page.getByRole('button', { name: 'Signing in…' });
  await expect(busy).toBeDisabled();
  await password.press('Enter'); // a second Enter while waiting sends nothing
  expect(sent).toBe(1);
  release();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(sent).toBe(1);
  // "Remember me" was off: the token is kept for this tab only.
  const stored = await page.evaluate(() => ({
    local: localStorage.getItem('rb.token'),
    session: sessionStorage.getItem('rb.token'),
  }));
  expect(stored.local).toBeNull();
  expect(stored.session).toBeTruthy();
});

test('sign-in explains server errors in a banner that takes focus', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(PM.email);
  await page.getByLabel('Password', { exact: true }).fill('whatever');

  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 500, json: { error: 'Internal server error' } }),
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const banner = page.getByRole('alert');
  await expect(banner).toHaveText(
    'We couldn’t reach the server. Check your connection and try again.',
  );
  await expect(banner).toBeFocused();

  await page.unroute('**/api/auth/login');
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 423,
      headers: { 'Retry-After': '540' },
      json: { error: 'Locked', details: { code: 'ACCOUNT_LOCKED', retryAfterSeconds: 540 } },
    }),
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(banner).toHaveText(
    'Your account is locked after too many attempts. Try again in 9 minutes or contact your administrator.',
  );
});

test('the password field warns about Caps Lock and can show its characters', async ({ page }) => {
  await page.goto('/login');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('secret');
  await password.dispatchEvent('keydown', { key: 'A', modifierCapsLock: true });
  await expect(page.getByText('Caps Lock is on')).toBeVisible();
  await password.dispatchEvent('keydown', { key: 'a', modifierCapsLock: false });
  await expect(page.getByText('Caps Lock is on')).toHaveCount(0);

  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('an expired session returns to sign-in with a notice, then to the page', async ({ page }) => {
  await signIn(page, PM);
  // Replace the token with one whose expiry has passed (the payload is all the app reads).
  await page.evaluate(() => {
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
    const payload = { sub: 'x', email: 'x@y.z', role: 'PM', exp: 1 };
    sessionStorage.setItem('rb.token', `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`);
  });
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login\?reason=expired&next=%2Fprojects/);
  await expect(page.getByRole('status')).toHaveText('Your session expired. Please sign in again.');
  await page.getByLabel('Work email').fill(PM.email);
  await page.getByLabel('Password', { exact: true }).fill(PM.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test('a sign-in that needs MFA continues on the code page', async ({ page }) => {
  // The API has no MFA yet: answer the sign-in with a challenge and the code with a real session.
  const real = await page.request.post('/api/auth/login', { data: PM });
  const session = await real.json();
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      json: { mfaRequired: true, mfaToken: 'mfa-123', destination: 'p•••@resourceboard.local' },
    }),
  );
  let verified: unknown;
  await page.route('**/api/auth/mfa/verify', (route) => {
    verified = route.request().postDataJSON();
    return route.fulfill({ json: session });
  });

  await page.goto('/login?next=%2Fprojects');
  await page.getByLabel('Work email').fill(PM.email);
  await page.getByLabel('Password', { exact: true }).fill(PM.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login\/mfa$/);
  await expect(page.getByRole('heading', { name: 'Verify it’s you' })).toBeVisible();
  await expect(page.getByText('p•••@resourceboard.local')).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend code \(\d+s\)/ })).toBeDisabled();

  // Each digit moves to the next box; the sixth sends the code.
  await expect(page.getByLabel('Digit 1 of 6')).toBeFocused();
  await page.keyboard.type('12345');
  await expect(page.getByLabel('Digit 6 of 6')).toBeFocused();
  await page.keyboard.type('6');
  await expect(page).toHaveURL(/\/projects$/);
  expect(verified).toEqual({ mfaToken: 'mfa-123', code: '123456' });
});

test('the MFA page sends people without a challenge back to sign-in', async ({ page }) => {
  await page.goto('/login/mfa');
  await expect(page).toHaveURL(/\/login$/);
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

test('a PM creates a task in the dialog, then edits it on its task page', async ({ page }) => {
  await signIn(page, PM);
  await page.getByRole('button', { name: 'Create task' }).click();
  const d = dialog(page);
  await d.getByLabel('Summary').fill('E2E: export utilization report');
  await d.getByLabel('Project').selectOption({ label: 'ATLAS · Atlas Customer Portal' });
  await d.getByLabel('Assignee').selectOption({ label: 'Liam Chen' });
  await d.getByLabel('Estimate (hours)').fill('12');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toHaveText('Task created');

  await page.goto('/projects/ATLAS/list');
  await page.getByLabel('Search tasks').fill('E2E: export');
  const row = page.getByRole('row', { name: /E2E: export utilization report/ });
  await expect(row).toContainText('To do');

  await row.click();
  await expect(page).toHaveURL(/\/browse\/ATLAS-\d+$/);
  await expect(page.getByRole('heading', { name: 'E2E: export utilization report' })).toBeVisible();
  await page.getByLabel('Status').selectOption({ label: 'In progress' });
  await expect(toast(page).filter({ hasText: 'saved' })).toBeVisible();
  await page.goBack();
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
  await signIn(page, MEMBER, '/projects/ATLAS/list');
  await expect(page.getByRole('button', { name: 'Create task' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

  await page.getByRole('row', { name: /Invoice PDF download/ }).click();
  await expect(page.getByRole('heading', { name: 'Invoice PDF download' })).toBeVisible();
  await expect(page.getByLabel('Assignee')).toBeDisabled();
  await expect(page.getByLabel('Priority')).toBeDisabled();
  await expect(page.getByLabel('Status')).toBeEnabled();
  await expect(page.getByText('tasks assigned to you')).toBeVisible();
  // The quick-edit dialog (pencil) has the same rule.
  await page.goBack();
  await page
    .getByRole('row', { name: /Invoice PDF download/ })
    .getByRole('button', { name: 'Edit' })
    .click();
  await expect(dialog(page).getByLabel('Summary')).toBeDisabled();
  await expect(dialog(page).getByLabel('Status')).toBeEnabled();
});

test('a PM moves a card on the board by dragging it', async ({ page }) => {
  // ORION has no sprints, so its board shows every task.
  await signIn(page, PM, '/projects/ORION/board');
  const card = page.getByRole('button', { name: /Project kickoff deck/ });
  const target = page.getByRole('region', { name: 'In progress' });
  // Cards can sit below the fold; drag within the visible part of the board.
  await card.scrollIntoViewIfNeeded();
  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  const y = Math.min(from.y + from.height / 2, to.y + to.height - 20);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, y, { steps: 15 });
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
  await page.getByLabel('Work email').fill('nisha.verma@resourceboard.local');
  await page.getByLabel('Password', { exact: true }).fill('Welcome2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
  await signIn(page, PM, '/projects/ATLAS/list');

  const first = page.getByRole('row', { name: /ATLAS-6\b/ });
  const second = page.getByRole('row', { name: /ATLAS-11\b/ });
  await page.getByLabel('Select ATLAS-6').check();
  await page.getByLabel('Select ATLAS-11').check();
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
  await signIn(page, ADMIN, '/projects/ATLAS/list');
  const pager = page.getByRole('navigation', { name: 'tasks pages' });
  await pager.getByLabel('Rows per page').selectOption('10');
  await expect(pager).toContainText(/Showing 1–10 of \d+ tasks/);
  await expect(page.locator('tbody tr')).toHaveCount(10);

  await pager.getByRole('button', { name: 'Next →' }).click();
  await expect(pager).toContainText(/Showing 11–\d+ of/);
  await expect(pager.getByRole('button', { name: 'Page 2' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByLabel('Search tasks').fill('Invoice');
  await expect(pager).toContainText(/Showing 1–\d of \d tasks/);
});

test('a team member sees only their own projects, board, tasks and figures', async ({ page }) => {
  // Liam is on ATLAS only and has two tasks assigned to him there, so he lands on its list.
  await signIn(page, MEMBER, '/');
  await expect(page).toHaveURL(/\/projects\/ATLAS\/list$/);
  await expect(
    page.getByRole('navigation', { name: 'Views', exact: true }).getByRole('link'),
  ).toHaveText(['Dashboard', 'Projects', 'Team', 'Reports']);
  await expect(page.getByText('Tasks assigned to you')).toBeVisible();
  await expect(page.getByLabel('Assignee')).toHaveCount(0);
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) await expect(row).toContainText('Liam Chen');

  await page
    .getByRole('navigation', { name: 'Views', exact: true })
    .getByRole('link', { name: 'Projects' })
    .click();
  await expect(page.getByText('Projects you are on')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('row', { name: /Atlas Customer Portal/ }).click();

  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Board', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /Invoice PDF download/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Payments webhook handler/ })).toBeVisible(); // teammate, ATLAS
  // Other projects' spaces stay closed to him.
  await page.goto('/projects/NOVA/board');
  await expect(page.getByText('Project NOVA was not found, or you are not on it.')).toBeVisible();

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
    const token = localStorage.getItem('rb.token') ?? sessionStorage.getItem('rb.token');
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
    const token = localStorage.getItem('rb.token') ?? sessionStorage.getItem('rb.token');
    return (await fetch('/api/leads', { headers: { Authorization: `Bearer ${token}` } })).status;
  });
  expect(status).toBe(403);
});

test('a PM reorders cards within a column', async ({ page }) => {
  await signIn(page, PM, '/projects/ATLAS/board');
  await page.locator('div.font-medium').first().waitFor(); // board loaded
  // Earlier tests move and delete cards, so use whichever column has two or more.
  let column = page.getByRole('region', { name: 'To do' });
  for (const name of ['To do', 'In progress', 'Backlog', 'In review', 'Done']) {
    const c = page.getByRole('region', { name });
    if ((await c.locator('div.font-medium').count()) >= 2) {
      column = c;
      break;
    }
  }
  const titles = () => column.locator('div.font-medium').allTextContents();
  const [first, second] = await titles();
  const top = (await column.locator('div.font-medium').nth(0).boundingBox())!;
  const below = (await column.locator('div.font-medium').nth(1).boundingBox())!;
  await page.mouse.move(below.x + 20, below.y + 5);
  await page.mouse.down();
  await page.mouse.move(below.x + 20, below.y - 10, { steps: 5 });
  await page.mouse.move(top.x + 20, top.y - 5, { steps: 15 });
  await page.mouse.up();
  await expect(toast(page)).toContainText('reordered');
  await expect.poll(async () => (await titles()).slice(0, 2)).toEqual([second, first]);
  // The new order is saved.
  await page.reload();
  await expect.poll(async () => (await titles()).slice(0, 2)).toEqual([second, first]);
});

test('a PM plans a sprint, then labels a task and comments on it', async ({ page }) => {
  await signIn(page, PM, '/projects/ATLAS/sprints');
  await page.getByRole('button', { name: 'New sprint' }).click();
  await dialog(page).getByLabel('Project').selectOption({ label: 'ATLAS · Atlas Customer Portal' });
  await dialog(page).getByLabel('Name').fill('ATLAS Sprint 8');
  await dialog(page).getByLabel('Goal').fill('Polish the portal');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('row', { name: /ATLAS Sprint 8/ });
  await expect(row).toContainText('Planned');
  // One active sprint per project: Sprint 7 is still running.
  await row.getByRole('button', { name: 'Start' }).click();
  await expect(toast(page)).toContainText('Complete ATLAS Sprint 7 before starting another sprint');

  // A new ATLAS task, put in the new sprint with a label.
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'List', exact: true })
    .click();
  await page.getByRole('button', { name: 'Create task' }).click();
  await dialog(page).getByLabel('Summary').fill('Keyboard navigation fixes');
  await dialog(page).getByLabel('Project').selectOption({ label: 'ATLAS · Atlas Customer Portal' });
  await dialog(page).getByLabel('Sprint').selectOption({ label: 'ATLAS Sprint 8' });
  await dialog(page).getByLabel('Add a label').fill('Customer Request');
  await dialog(page).getByLabel('Add a label').press('Enter');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await page.getByLabel('Search tasks').fill('Keyboard navigation');
  const task = page.getByRole('row', { name: /Keyboard navigation fixes/ });
  await expect(task).toContainText('ATLAS Sprint 8');
  await expect(task).toContainText('customer-request');

  await page.getByLabel('Search tasks').fill('');
  await page.getByLabel('Label', { exact: true }).selectOption('customer-request');
  await expect(page.getByRole('row')).toHaveCount(2); // header + the one labelled task

  await task.click();
  await page.getByLabel('Add a comment').fill('Checked with the client: WCAG AA.');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Comments · 1' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Comments' })).toContainText('Priya Sharma');
});

test('a PM opens a project space: summary, backlog, board, list and settings', async ({ page }) => {
  await signIn(page, PM, '/projects');
  await page.getByRole('row', { name: /Atlas Customer Portal/ }).click();
  await expect(page).toHaveURL(/\/projects\/ATLAS$/);
  const views = page.getByRole('navigation', { name: 'Project views' });
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible();
  await expect(page.getByText('ATLAS Sprint 7').first()).toBeVisible();

  // Backlog: plan a backlog task into the active sprint.
  await views.getByRole('link', { name: 'Backlog', exact: true }).click();
  const sprint = page.getByRole('region', { name: 'ATLAS Sprint 7' });
  const backlog = page.getByRole('region', { name: 'Backlog' });
  await backlog.getByLabel('Create a task in the backlog').fill('Cookie banner');
  await backlog.getByLabel('Create a task in the backlog').press('Enter');
  await expect(backlog).toContainText('Cookie banner');
  await backlog
    .getByRole('listitem')
    .filter({ hasText: 'Cookie banner' })
    .getByRole('combobox')
    .selectOption({ label: 'ATLAS Sprint 7' });
  await expect(sprint).toContainText('Cookie banner');

  // Board opens on the active sprint, with the new task ready to do.
  await views.getByRole('link', { name: 'Board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ATLAS Sprint 7' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'To do' })).toContainText('Cookie banner');

  // List: only ATLAS tasks.
  await views.getByRole('link', { name: 'List', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'List' })).toBeVisible();
  await expect(page.locator('tbody tr td:nth-child(2)').first()).toContainText('ATLAS-');
  const keys = await page.locator('tbody tr td:nth-child(2)').allTextContents();
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.every((k) => k.startsWith('ATLAS-'))).toBe(true);

  await views.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Epics' })).toBeVisible();
  await expect(page.getByText('Account self-service')).toBeVisible();
});

test('board, tasks and sprints live in the project; old links still land there', async ({
  page,
}) => {
  await signIn(page, PM, '/dashboard');
  await expect(
    page.getByRole('navigation', { name: 'Views', exact: true }).getByRole('link'),
  ).toHaveText(['Dashboard', 'Projects', 'Team', 'Reports', 'Leads']);

  // An old link without a project goes to the project list; one with a project opens its view.
  await page.goto('/board');
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto('/tasks?project=ATLAS&q=Invoice');
  await expect(page).toHaveURL(/\/projects\/ATLAS\/list\?q=Invoice$/);
  await expect(page.getByLabel('Search tasks')).toHaveValue('Invoice');
  await page.goto('/sprints?project=ATLAS');
  await expect(page).toHaveURL(/\/projects\/ATLAS\/sprints$/);

  // The Sprints view lists the project's sprints, and each opens on the board.
  await expect(page.getByRole('heading', { name: 'Sprints', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'ATLAS Sprint 7', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/ATLAS\/board\?sprint=/);
  await expect(page.getByRole('heading', { name: 'ATLAS Sprint 7' })).toBeVisible();
});

test('a PM links tasks and the board shows what is blocked', async ({ page }) => {
  await signIn(page, PM, '/projects/ATLAS/list');
  await page.getByLabel('Search tasks').fill('Customer feedback widget');
  await page.getByRole('row', { name: /Customer feedback widget/ }).click();
  const links = page.getByRole('region', { name: 'Links' });
  await links.getByLabel('Link type').selectOption('BLOCKED_BY');
  await links.getByLabel('Task to link').fill('ATLAS-4');
  await links.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(links.getByRole('listitem')).toContainText(['Payments webhook handler']);
  await expect(page.getByText('Blocked by 1').first()).toBeVisible();

  // The other side of the link.
  await links.getByRole('button', { name: 'Payments webhook handler' }).click();
  await expect(page).toHaveURL(/\/browse\/ATLAS-4$/);
  await expect(page.getByRole('region', { name: 'Links' })).toContainText('blocks');
  await expect(page.getByRole('region', { name: 'Links' })).toContainText(
    'Customer feedback widget',
  );

  await page.goto('/projects/ATLAS/list');
  await page.getByLabel('Search tasks').fill('Customer feedback widget');
  await expect(page.getByRole('row', { name: /Customer feedback widget/ })).toContainText(
    'Blocked by 1',
  );
});

test('a task page shows the task and saves each field as it changes', async ({ page }) => {
  await signIn(page, PM, '/projects/ATLAS/board');
  await page.getByRole('button', { name: /Invoice PDF download/ }).click();
  await expect(page).toHaveURL(/\/browse\/ATLAS-5$/);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs).toContainText('Atlas Customer Portal');
  await expect(crumbs).toContainText('ATLAS-5');

  // Inline summary edit.
  await page.getByRole('heading', { name: 'Invoice PDF download' }).click();
  await page.getByLabel('Summary').fill('Invoice PDF download (A4)');
  await page.getByLabel('Summary').press('Enter');
  await expect(page.getByRole('heading', { name: 'Invoice PDF download (A4)' })).toBeVisible();

  // Details save on change.
  await page.getByLabel('Priority').selectOption({ label: 'Critical' });
  await expect(toast(page)).toContainText('ATLAS-5 saved');
  await page
    .getByText('Add a description…')
    .or(page.locator('#description-heading + div'))
    .first()
    .click();
  await page
    .getByRole('textbox', { name: 'Description' })
    .fill('Use the A4 template from finance.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Use the A4 template from finance.')).toBeVisible();

  await page.getByLabel('Hours worked today').fill('2');
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(toast(page)).toContainText('Logged 2.0h on ATLAS-5');

  // Saved for real.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Invoice PDF download (A4)' })).toBeVisible();
  await expect(page.getByLabel('Priority')).toHaveValue('CRITICAL');
});

test('a task page records who changed what in its history', async ({ page }) => {
  await signIn(page, PM, '/browse/ATLAS-13');
  await expect(page.getByRole('heading', { name: 'Customer feedback widget' })).toBeVisible();
  await page.getByLabel('Priority').selectOption({ label: 'High' });
  await expect(toast(page)).toContainText('ATLAS-13 saved');
  await page.getByLabel('Status').selectOption({ label: 'In review' });
  await expect(toast(page)).toContainText('ATLAS-13 saved');

  await page.getByRole('tab', { name: 'History' }).click();
  const history = page.getByRole('list', { name: 'History' });
  const entries = history.locator(':scope > li');
  await expect(entries.first()).toContainText('Priya Sharma changed Status');
  await expect(entries.first()).toContainText('In review');
  await expect(entries.nth(1)).toContainText('changed Priority');
  await expect(entries.nth(1)).toContainText('High');
});

test('board filters live in the address and can be saved by name', async ({ page }) => {
  await signIn(page, PM, '/projects/ATLAS/board');
  await page.getByLabel('Search tasks').fill('Invoice');
  await expect(page).toHaveURL(/sprint=.+&q=Invoice/);
  await page.reload();
  await expect(page.getByLabel('Search tasks')).toHaveValue('Invoice');
  await expect(page.getByRole('region', { name: 'In progress' })).toContainText('Invoice PDF');

  await page.getByRole('button', { name: /Saved filters/ }).click();
  await page.getByLabel('Filter name').fill('Atlas invoices');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: /Filter: Atlas invoices/ })).toBeVisible();

  // Clear the filters, then bring the saved one back.
  await page.goto('/projects/ATLAS/board?q=');
  await page.getByLabel('Search tasks').fill('');
  await page.getByRole('button', { name: /Saved filters/ }).click();
  await page
    .getByRole('dialog', { name: 'Saved filters' })
    .getByRole('button', { name: 'Atlas invoices', exact: true })
    .click();
  await expect(page.getByLabel('Search tasks')).toHaveValue('Invoice');
  await expect(page).toHaveURL(/q=Invoice/);
});
