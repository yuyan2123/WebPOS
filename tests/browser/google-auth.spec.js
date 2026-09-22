const { test, expect } = require('@playwright/test');

async function loginPage(page, { mode = 'browser', result = 'none', host = 'webpos-14776.firebaseapp.com', failure = '' } = {}) {
  await page.addInitScript(({ mode, result, failure }) => {
    window.__authScenario = { result, failure };
    window.__authCalls = [];
    Object.defineProperty(navigator, 'standalone', { value: mode === 'ios' });
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => query === '(display-mode: standalone)'
      ? { matches: mode === 'standalone' } : matchMedia(query);
  }, { mode, result, failure });
  await page.route(`https://${host}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/__/firebase/init.json') return route.fulfill({ json: {
      projectId: 'webpos-14776', authDomain: 'webpos-14776.firebaseapp.com',
    } });
    if (path === '/') return route.fulfill({ contentType: 'text/html', body:
      '<html><body><script src="/js/runtime-config.js"></script><script src="/js/rpc-bridge.js"></script></body></html>' });
    return route.fulfill({ path: `public${path}` });
  });
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-app.js', route => route.fulfill({
    contentType: 'text/javascript', body: 'export const initializeApp = config => (window.__authConfig = config);',
  }));
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-app-check.js', route => route.fulfill({
    contentType: 'text/javascript', body: 'export class ReCaptchaEnterpriseProvider {} export const initializeAppCheck = () => {};',
  }));
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-functions.js', route => route.fulfill({
    contentType: 'text/javascript', body: 'export const getFunctions = () => ({});',
  }));
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-auth.js', route => route.fulfill({
    contentType: 'text/javascript', body: `
      const user = { uid: 'google-account', email: 'test@example.test', emailVerified: true };
      const auth = { currentUser: null };
      let listener;
      export const getAuth = () => auth;
      export const browserLocalPersistence = {};
      export const setPersistence = async () => window.__authCalls.push('persistence');
      export class GoogleAuthProvider {}
      export const signInWithRedirect = async () => {
        window.__authCalls.push('redirect');
        if (window.__authScenario.failure) throw new Error(window.__authScenario.failure);
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
    `,
  }));
  await page.goto(`https://${host}/?source=pwa`);
}

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
  expect(await page.evaluate(() => window.__authCalls)).toEqual(['persistence', 'result', 'observer', 'popup']);
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
  await page.evaluate(() => { void window.posApi.call('getProducts', []); });
  await expect(page.locator('#firebaseAuthError')).toHaveText('Google return failed');
  await expect(page.locator('#firebaseGoogleSignIn')).toBeEnabled();
});

test('failed redirect launch allows retry without reopening the PWA', async ({ page }) => {
  await loginPage(page, { mode: 'ios', failure: 'Network unavailable' });
  await page.locator('#firebaseGoogleSignIn').click();
  await expect(page.locator('#firebaseAuthError')).toHaveText('Network unavailable');
  await expect(page.locator('#firebaseGoogleSignIn')).toBeEnabled();
  await page.evaluate(() => { window.__authScenario.failure = ''; });
  await page.locator('#firebaseGoogleSignIn').click();
  await expect(page.locator('body')).toHaveAttribute('data-user-id', 'google-account');
});
