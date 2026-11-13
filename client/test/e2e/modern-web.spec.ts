import { test, expect, type Page } from '@playwright/test';

const user = {
  id: 'browser-test-user',
  email: 'browser@example.test',
  username: 'browser-test',
  fullName: 'مستخدم الاختبار',
  title: 'مراقب',
  role: 'OBSERVER',
  isActive: true,
};

const todo = {
  id: 'browser-test-todo',
  userId: user.id,
  title: 'مهمة اختبار المتصفح',
  description: '',
  priority: 'NORMAL',
  category: 'WORK',
  isCompleted: false,
  completionPercentage: 0,
  displayOrder: 1,
  createdAt: '2026-11-13T08:00:00.000Z',
  updatedAt: '2026-11-13T08:00:00.000Z',
  attachments: [],
};

async function openAgenda(page: Page, notifications: unknown[] = []) {
  await page.addInitScript((currentUser) => {
    localStorage.setItem('ports_auth_token', 'browser-test-token');
    localStorage.setItem('ports_current_user', JSON.stringify(currentUser));
    localStorage.setItem('ports_custom_api_url', `${location.origin}/api`);
  }, user);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const response = path === '/api/auth/me' ? user
      : path === '/api/todos' ? {
        todos: [todo],
        stats: { total: 1, completed: 0, pending: 1, urgentPending: 0, dueTodayPending: 0 },
      }
      : path === '/api/notifications/read' ? { readKeys: [] }
      : path === '/api/notifications' ? notifications
      : [];
    await route.fulfill({ json: response });
  });
  await page.goto('/todos');
  await expect(page.getByText(todo.title, { exact: true })).toBeVisible();
}

async function openDeleteDialog(page: Page) {
  const trigger = page.getByTitle('حذف', { exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'حذف المهمة من الأجندة' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveJSProperty('open', true);
  return { dialog, trigger };
}

test('login fields have persistent labels and keyboard-operable password visibility', async ({ page }) => {
  await page.goto('/');
  const username = page.getByLabel('اسم المستخدم', { exact: false });
  const password = page.getByLabel('كلمة المرور', { exact: false }).and(page.locator('input'));
  await expect(username).toHaveAttribute('autocomplete', 'username');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await password.fill('keyboard-test-password');
  await password.focus();
  await page.keyboard.press('Tab');
  const toggle = page.getByRole('button', { name: /إظهار.*كلمة المرور|إظهار وإخفاء كلمة المرور/ });
  await expect(toggle).toBeFocused();
  expect(await toggle.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'text');
  await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'password');
});

test('viewport allows zoom and reduced motion stops persistent decorative animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeVisible();
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).not.toMatch(/user-scalable=(no|0)|maximum-scale=1(?:[,.]|$)/);
  // Sample the same utility used by loading indicators without requiring a live backend.
  const animationName = await page.evaluate(() => {
    const indicator = document.createElement('span');
    indicator.className = 'animate-spin';
    document.body.append(indicator);
    const name = getComputedStyle(indicator).animationName;
    indicator.remove();
    return name;
  });
  expect(animationName).toBe('none');
  const submit = page.getByRole('button', { name: 'تسجيل الدخول' });
  const arrow = submit.locator('svg');
  await submit.hover();
  const transitionProperties = await submit.evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(transitionProperties).not.toMatch(/\ball\b|\btransform\b/);
  expect(await arrow.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await page.evaluate(() => {
    const indicator = document.createElement('span');
    indicator.className = 'animate-spin';
    document.body.append(indicator);
    const name = getComputedStyle(indicator).animationName;
    indicator.remove();
    return name;
  })).toBe('spin');
  await expect.poll(() => arrow.evaluate((element) =>
    new DOMMatrixReadOnly(getComputedStyle(element).transform).m41)).toBe(-2);
});

test('native confirmation contains focus, cancels with Escape, and restores the trigger', async ({ page }, testInfo) => {
  await openAgenda(page);
  const { dialog, trigger } = await openDeleteDialog(page);
  await expect(dialog.getByRole('button', { name: 'إلغاء', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'نعم، احذف المهمة' })).toBeFocused();
  // The modal makes unrelated page controls inert, including programmatic focus.
  await trigger.evaluate((element) => element.focus());
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('confirmation.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('long announcement details stay within the viewport and scroll to their footer', async ({ page }, testInfo) => {
  const title = 'تعميم لاختبار النص الطويل';
  const content = Array.from({ length: 40 }, (_, index) =>
    `البند ${index + 1}: يرجى متابعة تنفيذ الخطط اليومية وتوثيق المستجدات والإنجازات بالتنسيق مع كافة المديريات المختصة.`
  ).join('\n\n');
  await openAgenda(page, [{
    id: 'browser-test-notification',
    userId: user.id,
    type: 'announcement',
    title,
    message: 'يرجى قراءة تفاصيل التعميم الطويل.',
    referenceId: 'browser-test-announcement',
    createdAt: '2026-11-13T08:00:00.000Z',
    metadata: { title, content, priority: 'NORMAL', authorName: 'الإدارة العامة' },
  }]);
  await page.getByRole('button', { name: 'التنبيهات اللحظية' }).click();
  await page.getByText(title, { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'تفاصيل التعميم الإداري الرسمي' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error('Missing dialog bounds or viewport');
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const body = dialog.locator('div.overflow-y-auto').first();
  expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await body.hover();
  await page.mouse.wheel(0, 10_000);
  await expect.poll(() => body.evaluate((element) =>
    element.scrollTop + element.clientHeight >= element.scrollHeight - 2)).toBe(true);
  const close = dialog.getByRole('button', { name: 'إغلاق', exact: true }).last();
  await expect(close).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('announcement-details.png'), animations: 'disabled' });
  await close.click();
  await expect(dialog).toBeHidden();
});

for (const nativeLightDismiss of [true, false]) {
  test(`backdrop dismissal is drag-safe (${nativeLightDismiss ? 'native' : 'fallback'})`, async ({ page }) => {
    if (!nativeLightDismiss) {
      await page.addInitScript(() => {
        Reflect.deleteProperty(HTMLDialogElement.prototype, 'closedBy');
      });
    }
    await openAgenda(page);
    const { dialog } = await openDeleteDialog(page);
    if (!nativeLightDismiss) {
      // Disable native light dismissal so this checks the pointer-event fallback.
      await dialog.evaluate((element) => element.removeAttribute('closedby'));
    }
    const heading = await dialog.getByRole('heading', { name: 'حذف المهمة من الأجندة' }).boundingBox();
    if (!heading) throw new Error('Dialog heading has no bounds');
    await page.mouse.move(heading.x + heading.width / 2, heading.y + heading.height / 2);
    await page.mouse.down();
    await page.mouse.move(3, 3, { steps: 5 });
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await page.mouse.click(3, 3);
    await expect(dialog).toBeHidden();
  });
}

test('the backdrop prevents wheel scrolling of the underlying page', async ({ page }) => {
  await openAgenda(page);
  // A long document makes scroll leakage observable even with a one-task fixture.
  await page.evaluate(() => { document.body.style.minHeight = '300vh'; });
  const { dialog } = await openDeleteDialog(page);
  const before = await page.evaluate(() => scrollY);
  await page.mouse.move(3, 3);
  await page.mouse.wheel(0, 600);
  // Wait for the compositor's wheel scroll before inspecting the document offset.
  await page.waitForTimeout(150);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  await expect(dialog).toBeVisible();
});

test('confirmation cannot be dismissed while its delete request is pending', async ({ page }) => {
  await openAgenda(page);
  let finishDelete!: () => void;
  const pendingDelete = new Promise<void>((resolve) => { finishDelete = resolve; });
  await page.route(`**/api/todos/${todo.id}`, async (route) => {
    await pendingDelete;
    await route.fulfill({ json: { success: true } });
  });
  const { dialog } = await openDeleteDialog(page);
  try {
    await dialog.getByRole('button', { name: 'نعم، احذف المهمة' }).click();
    await expect(dialog.getByRole('button', { name: 'إلغاء', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.mouse.click(3, 3);
    await expect(dialog).toBeVisible();
  } finally {
    finishDelete();
  }
  await expect(dialog).toBeHidden();
});
