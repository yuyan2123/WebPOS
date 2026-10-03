const { test, expect } = require('@playwright/test');

async function loginPage(
  page,
  {
    mode = 'browser',
    result = 'none',
    host = 'webpos-14776.firebaseapp.com',
    failure = '',
    styled = false,
  } = {},
) {
  await page.addInitScript(
    ({ mode, result, failure }) => {
      window.__authScenario = { result, failure };
      window.__authCalls = [];
      Object.defineProperty(navigator, 'standalone', { value: mode === 'ios' });
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) =>
        query === '(display-mode: standalone)' ? { matches: mode === 'standalone' } : matchMedia(query);
    },
    { mode, result, failure },
  );
  await page.route(`https://${host}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/__/firebase/init.json')
      return route.fulfill({
        json: {
          projectId: 'webpos-14776',
          authDomain: 'webpos-14776.firebaseapp.com',
        },
      });
    if (path === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: `<html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styled ? '<link rel="stylesheet" href="/css/app.css">' : ''}</head><body${styled ? ' class="gj-ui"' : ''}><script src="/js/runtime-config.js"></script><script src="/js/rpc-bridge.js"></script></body></html>`,
      });
    return route.fulfill({ path: `public${path}` });
  });
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-app.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export const initializeApp = config => (window.__authConfig = config);',
    }),
  );
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-app-check.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export class ReCaptchaEnterpriseProvider {} export const initializeAppCheck = () => {};',
    }),
  );
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-functions.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export const getFunctions = () => ({});',
    }),
  );
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-auth.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
      const user = { uid: 'google-account', email: 'test@example.test', emailVerified: true,
        providerData: [{ providerId: 'google.com' }] };
      const auth = { currentUser: null };
      let listener;
      export const getAuth = () => auth;
      export const browserLocalPersistence = {};
      export const setPersistence = async () => window.__authCalls.push('persistence');
      export class GoogleAuthProvider {}
      export const signInWithRedirect = async () => {
        window.__authCalls.push('redirect');
        if (window.__authScenario.failure) throw Object.assign(new Error(window.__authScenario.failure), { code: window.__authScenario.failureCode });
        sessionStorage.setItem('oauth-return', 'yes');
        location.reload();
      };
      export const signInWithPopup = async () => {
        window.__authCalls.push('popup');
        auth.currentUser = user;
        listener(user);
      };
      export const getRedirectResult = async () => {
        window.__authCalls.push('result');
        if (window.__authScenario.result === 'delayed') {
          await new Promise(resolve => { window.__finishRedirect = resolve; });
        }
        if (window.__authScenario.result === 'error') throw new Error('Google return failed');
        if (sessionStorage.getItem('oauth-return') || window.__authScenario.result === 'delayed') {
          auth.currentUser = user;
          return { user };
        }
        return null;
      };
      export const onAuthStateChanged = (_, callback) => {
        window.__authCalls.push('observer');
        listener = callback;
        callback(auth.currentUser);
      };
      const emailAction = async (method, email, password) => {
        window.__authCalls.push(method);
        window.__emailInputs = { email, password };
        if (window.__authScenario.pending) {
          await new Promise(resolve => { window.__finishEmailAction = resolve; });
        }
        if (window.__authScenario.failure && (!window.__authScenario.failureMethod || window.__authScenario.failureMethod === method))
          throw Object.assign(new Error(window.__authScenario.failure), { code: window.__authScenario.failureCode });
      };
      export const signInWithEmailAndPassword = async (_, email, password) => {
        await emailAction('email-signin', email, password);
        auth.currentUser = user;
        listener(user);
        return { user };
      };
      export const sendPasswordResetEmail = (_, email) => emailAction('reset', email);
      export const createUserWithEmailAndPassword = async (_, email, password) => {
        await emailAction('register', email, password);
        const created = { uid: 'email-account', email, emailVerified: false,
          providerData: [{ providerId: 'password' }] };
        auth.currentUser = created;
        listener(created);
        return { user: created };
      };
      export const sendEmailVerification = async user => {
        window.__authCalls.push('verify-email');
        window.__verificationUid = user.uid;
      };
      export const updatePassword = async (existing, password) => {
        await emailAction('link', existing.email, password);
        window.__linkedAccount = { uid: existing.uid, email: existing.email, password, providerId: 'password' };
        existing.providerData.push({ providerId: 'password' });
      };
    `,
    }),
  );
  await page.goto(`https://${host}/?source=pwa`);
}

test('email authentication retains field errors, submits with Enter and prevents overlapping actions', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'desktop') await page.setViewportSize({ width: 375, height: 812 });
  await loginPage(page, { styled: true });
  const email = page.getByLabel('Email', { exact: true });
  const password = page.getByLabel('密碼', { exact: true });
  const signIn = page.locator('#firebaseEmailSignIn');
  await signIn.click();
  await expect(page.locator('#firebaseAuthValidation')).toBeFocused();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const scan = await new (require('@axe-core/playwright').default)({ page })
      .include('#firebaseAuthOverlay')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-email-validation.png`) });
  }
  await page.getByRole('link', { name: '請填寫 Email。', exact: true }).click();
  await expect(email).toBeFocused();
  await email.fill('invalid');
  await expect(page.locator('#firebaseAuthEmailError')).toContainText('完整的 Email');
  await email.fill('test@example.test');
  await expect(email).not.toHaveAttribute('aria-invalid');
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await password.fill('secret-pass');
  await expect(page.locator('#firebaseAuthValidation')).toBeHidden();
  await page.getByRole('button', { name: '顯示密碼', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: '隱藏密碼', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.evaluate(() => {
    window.__authScenario.pending = true;
    window.__authScenario.failure = '暫時無法連線，請稍後重試';
  });
  await password.press('Enter');
  await expect(page.locator('#firebaseEmailAuth')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#firebaseGoogleSignIn')).toBeDisabled();
  await expect(page.locator('#firebaseEmailRegister')).toBeDisabled();
  await expect(email).toBeDisabled();
  await expect(signIn).toHaveText('登入中…');
  await page.evaluate(() => {
    document.getElementById('firebaseEmailAuth').dispatchEvent(new Event('submit', { cancelable: true }));
  });
  expect(await page.evaluate(() => window.__authCalls.filter((call) => call === 'email-signin').length)).toBe(
    1,
  );
  await expect.poll(() => page.evaluate(() => typeof window.__finishEmailAction)).toBe('function');
  await page.evaluate(() => window.__finishEmailAction());
  await expect(page.locator('#firebaseAuthError')).toContainText('暫時無法連線');
  await expect(email).toHaveValue('test@example.test');
  await expect(password).toHaveValue('secret-pass');
  await expect(signIn).toBeEnabled();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const scan = await new (require('@axe-core/playwright').default)({ page })
      .include('#firebaseAuthOverlay')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-email-retry.png`) });
  }
  await page.evaluate(() => {
    window.__authScenario.pending = false;
    window.__authScenario.failure = '';
  });
  await password.press('Enter');
  await expect(page.locator('#firebaseAuthOverlay')).toBeHidden();
  await expect(password).toHaveValue('');
});

test('password reset validates only Email and login stays operable on a short viewport', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loginPage(page, { styled: true });
  const reset = page.locator('#firebaseResetPassword');
  const email = page.getByLabel('Email', { exact: true });
  await email.fill('invalid');
  await reset.click();
  await expect(page.locator('#firebaseAuthValidation')).toBeFocused();
  await expect(email).not.toBeFocused();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#firebaseAuthPassword')).not.toHaveAttribute('aria-invalid');
  expect(await page.evaluate(() => window.__authCalls.includes('reset'))).toBe(false);
  await email.fill('test@example.test');
  await reset.click();
  await expect(page.locator('#firebaseAuthError')).toContainText('如果此帳號存在');
  expect(await page.evaluate(() => window.__authCalls.includes('reset'))).toBe(true);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    await page.locator('#firebaseGoogleSignIn').scrollIntoViewIfNeeded();
    await expect(page.locator('#firebaseGoogleSignIn')).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`${theme}-landscape-auth.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('authentication errors explain recovery in Chinese and keep entered credentials', async ({ page }) => {
  await loginPage(page, { styled: true });
  await page.locator('#firebaseAuthEmail').fill('test@example.test');
  await page.locator('#firebaseAuthPassword').fill('secret-pass');
  for (const [code, message] of [
    ['auth/invalid-credential', 'Email 或密碼不正確，請確認後再試。'],
    ['auth/network-request-failed', '目前無法連線，請檢查網路後重試。'],
    ['auth/too-many-requests', '嘗試次數過多，請稍後再試。'],
  ]) {
    await page.evaluate((code) => {
      window.__authScenario.failureCode = code;
      window.__authScenario.failure = `Firebase: Error (${code}).`;
    }, code);
    await page.locator('#firebaseEmailSignIn').click();
    await expect(page.locator('#firebaseAuthError')).toHaveText(message);
    await expect(page.locator('#firebaseAuthPassword')).toHaveValue('secret-pass');
    await expect(page.locator('#firebaseGoogleSignIn')).toBeEnabled();
  }
});

test('Google accounts add a password to the same account without registering a second user', async ({
  page,
}, testInfo) => {
  await loginPage(page, { styled: true });
  await page.locator('#firebaseAuthEmail').fill('test@example.test');
  await page.locator('#firebaseAuthPassword').fill('new-password-123');
  await page.evaluate(() => {
    Object.assign(window.__authScenario, {
      failure: 'Email exists',
      failureCode: 'auth/email-already-in-use',
      failureMethod: 'register',
    });
  });
  await page.locator('#firebaseEmailRegister').click();
  await expect(page.locator('#firebaseAuthError')).toContainText('使用者帳號 → 設定登入密碼');
  await page.locator('#firebaseGoogleSignIn').click();
  await page.locator('#firebaseAccountToggle').click();
  await page.locator('#firebaseSetPassword').click();
  await expect(page.locator('#firebaseAuthTitle')).toHaveText('設定登入密碼');
  await expect(page.locator('#firebaseAuthEmail')).toHaveValue('test@example.test');
  await expect(page.locator('#firebaseAuthEmail')).toHaveAttribute('readonly', '');
  await expect(page.locator('#firebaseAuthPassword')).toHaveValue('');
  await expect(page.locator('#firebaseAuthPassword')).toHaveAttribute('autocomplete', 'new-password');
  await expect(page.locator('#firebaseEmailSignIn')).toBeHidden();
  await expect(page.locator('#firebaseResetPassword')).toBeHidden();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const scan = await new (require('@axe-core/playwright').default)({ page })
      .include('#firebaseAuthOverlay')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-password-link.png`) });
  }
  await page.locator('#firebaseAuthPassword').fill('new-password-123');
  await page.locator('#firebaseAuthPassword').press('Enter');
  await expect(page.locator('#firebaseAuthTitle')).toHaveText('登入密碼已設定');
  expect(await page.evaluate(() => window.__linkedAccount)).toEqual({
    uid: 'google-account',
    email: 'test@example.test',
    password: 'new-password-123',
    providerId: 'password',
  });
  expect(await page.evaluate(() => window.__authCalls.filter((call) => call === 'register'))).toHaveLength(1);
  await expect(page.locator('body')).toHaveAttribute('data-user-id', 'google-account');
  await expect(page.locator('#firebaseAuthPassword')).toHaveValue('');
  await page.getByRole('button', { name: '返回工作台', exact: true }).click();
  await expect(page.locator('#firebaseAuthOverlay')).toBeHidden();
  await page.locator('#firebaseAccountToggle').click();
  await expect(page.locator('#firebaseSetPassword')).toBeHidden();
});

test('password linking preserves failed input, blocks overlapping actions and can be canceled safely', async ({
  page,
}) => {
  await loginPage(page, { styled: true });
  await page.locator('#firebaseGoogleSignIn').click();
  await page.locator('#firebaseAccountToggle').click();
  await page.locator('#firebaseSetPassword').click();
  await page.locator('#firebaseAuthPassword').fill('retry-password-123');
  await page.evaluate(() => {
    Object.assign(window.__authScenario, {
      pending: true,
      failure: 'Network unavailable',
      failureCode: 'auth/network-request-failed',
      failureMethod: 'link',
    });
  });
  await page.locator('#firebaseEmailRegister').click();
  await expect(page.locator('#firebasePasswordSetupCancel')).toBeDisabled();
  await expect(page.locator('#firebaseAuthPassword')).toBeDisabled();
  await page.evaluate(() => {
    document.getElementById('firebaseEmailAuth').dispatchEvent(new Event('submit', { cancelable: true }));
    window.closePasswordSetup();
  });
  await expect(page.locator('#firebaseAuthOverlay')).toBeVisible();
  expect(await page.evaluate(() => window.__authCalls.filter((call) => call === 'link'))).toHaveLength(1);
  await page.evaluate(() => window.__finishEmailAction());
  await expect(page.locator('#firebaseAuthError')).toContainText('目前無法連線');
  await expect(page.locator('#firebaseAuthTitle')).toHaveText('設定登入密碼');
  await expect(page.locator('#firebaseAuthPassword')).toHaveValue('retry-password-123');
  await expect(page.locator('#firebasePasswordSetupCancel')).toBeEnabled();
  await page.locator('#firebasePasswordSetupCancel').click();
  await expect(page.locator('#firebaseAuthOverlay')).toBeHidden();
  await expect(page.locator('#firebaseAuthPassword')).toHaveValue('');
  await page.locator('#firebaseAccountToggle').click();
  await expect(page.locator('#firebaseSetPassword')).toBeVisible();
});

test("credential actions keep the same left and right positions when adding a password", async ({
  page,
}, testInfo) => {
  const { expectActionPair } = require("./helpers/actions");
  await loginPage(page, { styled: true });
  async function review(name, dismissId, primaryId) {
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const size of [
        page.viewportSize(),
        { width: 320, height: 740 },
        { width: 667, height: 375 },
      ]) {
        await page.setViewportSize(size);
        await expectActionPair(
          page,
          page.locator("#" + dismissId),
          page.locator("#" + primaryId),
        );
        await page.screenshot({
          path: testInfo.outputPath(
            `${theme}-${name}-actions-${size.width}.png`,
          ),
        });
      }
    }
  }
  await review("login", "firebaseEmailRegister", "firebaseEmailSignIn");
  await page.locator("#firebaseGoogleSignIn").click();
  await page.locator("#firebaseAccountToggle").click();
  await page.locator("#firebaseSetPassword").click();
  await review(
    "password",
    "firebasePasswordSetupCancel",
    "firebaseEmailRegister",
  );
  await expect(page.locator("#firebaseEmailRegister")).toHaveClass(
    /gj-btn--primary/,
  );
  await page.locator("#firebasePasswordSetupCancel").click();
  await expect(page.locator("#firebaseAuthOverlay")).toBeHidden();
  expect(
    await page.evaluate(
      () => window.__authCalls.filter((call) => call === "link").length,
    ),
  ).toBe(0);
});

test("new Email registrations still create a verified-email flow", async ({
  page,
}) => {
  await loginPage(page);
  await page.locator("#firebaseAuthEmail").fill("new@example.test");
  await page.locator("#firebaseAuthPassword").fill("new-password-123");
  await page.locator("#firebaseEmailRegister").click();
  await expect(page.locator("#firebaseAuthTitle")).toHaveText("請驗證 Email");
  await expect(page.locator("#firebaseAuthError")).toContainText(
    "驗證信已寄出",
  );
  expect(await page.evaluate(() => window.__verificationUid)).toBe(
    "email-account",
  );
  expect(await page.evaluate(() => window.__authCalls.includes("link"))).toBe(
    false,
  );
});

test("Email verification keeps switching accounts left of the verification action", async ({
  page,
}) => {
  const { expectActionPair } = require("./helpers/actions");
  await loginPage(page, { styled: true });
  await page.locator("#firebaseAuthEmail").fill("new@example.test");
  await page.locator("#firebaseAuthPassword").fill("new-password-123");
  await page.locator("#firebaseEmailRegister").click();
  for (const size of [
    page.viewportSize(),
    { width: 320, height: 740 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(size);
    await expectActionPair(
      page,
      page.locator("#firebaseVerificationSignOut"),
      page.locator("#firebaseRefreshVerification"),
    );
  }
});

test('password reset reports delivery errors and only conceals missing accounts', async ({ page }) => {
  await loginPage(page);
  await page.locator('#firebaseAuthEmail').fill('test@example.test');
  const reset = page.locator('#firebaseResetPassword');
  for (const [code, message] of [
    ['auth/network-request-failed', '目前無法連線'],
    ['auth/too-many-requests', '嘗試次數過多'],
    ['auth/operation-not-allowed', '未啟用 Email／密碼登入'],
  ]) {
    await page.evaluate((code) => {
      Object.assign(window.__authScenario, { failure: code, failureCode: code });
    }, code);
    await reset.click();
    await expect(page.locator('#firebaseAuthError')).toContainText(message);
    await expect(page.locator('#firebaseAuthError')).not.toContainText('如果此帳號存在');
    await expect(reset).toBeEnabled();
  }
  await page.evaluate(() => {
    Object.assign(window.__authScenario, { failure: 'Not found', failureCode: 'auth/user-not-found' });
  });
  await reset.click();
  await expect(page.locator('#firebaseAuthError')).toContainText('如果此帳號存在');
});

test('labeled Google button loads its local logo and stays readable in both themes', async ({
  page,
}, testInfo) => {
  await loginPage(page, { styled: true });
  const button = page.getByRole('button', { name: '使用 Google 帳號登入', exact: true });
  await expect(button).toBeVisible();
  const logo = button.locator('img');
  await expect.poll(() => logo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await logo.evaluate((image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3];
  })).toBe(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await expect(button).toHaveCSS('display', 'flex');
    await expect(button).toHaveCSS('border-radius', '8px');
    await expect(button.locator('.gj-social-logo')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const result = await new (require('@axe-core/playwright').default)({ page })
      .include('#firebaseGoogleSignIn')
      .withRules(['color-contrast'])
      .analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`google-${theme}.png`) });
  }
});

for (const mode of ['ios', 'standalone']) {
  test(`${mode} Google redirect restores the account after returning and reloading`, async ({ page }) => {
    await loginPage(page, { mode });
    await page.locator('#firebaseGoogleSignIn').click();
    await expect(page.locator('body')).toHaveAttribute('data-user-id', 'google-account');
    await expect(page.locator('#firebaseAuthOverlay')).toBeHidden();
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-user-id', 'google-account');
  });
}

test('browser tab uses popup even when opened with the PWA start query', async ({ page }) => {
  await loginPage(page);
  await page.locator('#firebaseGoogleSignIn').click();
  expect(await page.evaluate(() => window.__authCalls)).toEqual([
    'persistence',
    'result',
    'observer',
    'popup',
  ]);
  await expect(page.locator('body')).toHaveAttribute('data-user-id', 'google-account');
});

test('web.app uses same-origin auth and waits for the redirect result', async ({ page }) => {
  await loginPage(page, { host: 'webpos-14776.web.app', result: 'delayed' });
  await expect.poll(() => page.evaluate(() => typeof window.__finishRedirect)).toBe('function');
  expect(await page.evaluate(() => window.__authConfig.authDomain)).toBe('webpos-14776.web.app');
  await expect(page.locator('#firebaseAuthOverlay')).toBeHidden();
  expect(await page.evaluate(() => window.__authCalls)).toEqual(['persistence', 'result']);
  await page.evaluate(() => window.__finishRedirect());
  await expect(page.locator('body')).toHaveAttribute('data-user-id', 'google-account');
});

test('redirect return errors remain visible when startup requests authentication', async ({ page }) => {
  await loginPage(page, { result: 'error' });
  await expect(page.locator('#firebaseAuthError')).toHaveText('Google return failed');
  await page.evaluate(() => {
    void window.posApi.call('getProducts', []);
  });
  await expect(page.locator('#firebaseAuthError')).toHaveText('Google return failed');
  await expect(page.locator('#firebaseGoogleSignIn')).toBeEnabled();
});

test('failed redirect launch allows retry without reopening the PWA', async ({ page }) => {
  await loginPage(page, { mode: 'ios', failure: 'Network unavailable' });
  await page.locator('#firebaseGoogleSignIn').click();
  await expect(page.locator('#firebaseAuthError')).toHaveText('Network unavailable');
  await expect(page.locator('#firebaseGoogleSignIn')).toBeEnabled();
  await page.evaluate(() => {
    window.__authScenario.failure = '';
  });
  await page.locator('#firebaseGoogleSignIn').click();
  await expect(page.locator('body')).toHaveAttribute('data-user-id', 'google-account');
});
