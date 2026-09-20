const { test, expect } = require('@playwright/test');

async function authenticatedPage(page) {
  await page.addInitScript(() => {
    window.__authUser = JSON.parse(localStorage.getItem('security-test-user') || 'null') || {
      uid: 'account-a', email: 'a@example.test', emailVerified: true,
    };
    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem('security-before-unload', JSON.stringify({
        hasPrivateData: document.body.textContent.includes('PRIVATE CUSTOMER A'),
        userId: document.body.dataset.userId || null,
      }));
    });
  });
  await page.route('**/__/firebase/init.json', (route) => route.fulfill({ json: { projectId: 'demo-ginjia-pos' } }));
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-app.js', (route) => route.fulfill({
    contentType: 'text/javascript', body: 'export const initializeApp = config => config;',
  }));
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-auth.js', (route) => route.fulfill({
    contentType: 'text/javascript', body: `
      const auth = { currentUser: window.__authUser };
      window.__testAuth = auth;
      export const getAuth = () => auth;
      export const browserLocalPersistence = {};
      export const setPersistence = async () => {};
      export const connectAuthEmulator = () => {};
      export const signOut = async () => window.__emitAuth(null);
      export function onAuthStateChanged(auth, callback) {
        window.__emitAuth = user => {
          auth.currentUser = user;
          localStorage.setItem('security-test-user', JSON.stringify(user));
          callback(user);
        };
        callback(auth.currentUser);
      }
    `,
  }));
  await page.route('https://www.gstatic.com/firebasejs/*/firebase-functions.js', (route) => route.fulfill({
    contentType: 'text/javascript', body: `
      export const getFunctions = () => ({});
      export const connectFunctionsEmulator = () => {};
      window.__securityRequests = [];
      export const httpsCallable = () => async request => {
        window.__securityRequests.push(request);
        if (request.method === 'initializeSession') {
          const shop = {shopId:'shop-' + window.__testAuth.currentUser.uid,name:'Test shop',role:'owner'};
          return {data:{shops:[shop],selectedShop:shop,device:{recorded:true,deviceReference:'test'},bootstrap:{
            products:[],capacitySettings:{weekday:{},dateOverrides:[]},
            capacityMonth:{key:request.args[1].year + '-' + request.args[1].month,data:{}}
          }}};
        }
        if (request.method === 'getProducts') return new Promise((resolve,reject) => {
          window.__completeSecurityRpc = () => resolve({data:[{productName:'PRIVATE CUSTOMER A'}]});
          window.__rejectSecurityRpc = () => reject(Object.assign(new Error('revoked'),{code:'functions/unauthenticated'}));
        });
        return {data:[]};
      };
    `,
  }));
  await page.goto('/');
  await expect(page.locator('#startupStatus')).toBeHidden({ timeout: 20_000 });
}

test('cross-tab signout followed by another login clears old DOM before reloading', async ({ page }) => {
  await authenticatedPage(page);
  await page.evaluate(() => { document.getElementById('searchResults').textContent = 'PRIVATE CUSTOMER A'; });
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.evaluate(() => {
      window.__emitAuth(null);
      window.__emitAuth({uid:'account-b',email:'b@example.test',emailVerified:true});
    }),
  ]);
  await expect(page.locator('#startupStatus')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('body')).toHaveAttribute('data-user-id', 'account-b');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('security-before-unload'))))
    .toEqual({ hasPrivateData: false, userId: null });
  await expect(page.locator('body')).not.toContainText('PRIVATE CUSTOMER A');
});

test('responses from a previous identity are discarded and RPC envelope stays compatible', async ({ page }) => {
  await authenticatedPage(page);
  await page.evaluate(() => {
    window.posApi.call('getProducts', []).then(
      result => { window.__securityResult = result; },
      error => { window.__securityError = error.code; },
    );
  });
  await expect.poll(() => page.evaluate(() => typeof window.__completeSecurityRpc)).toBe('function');
  expect(await page.evaluate(() => window.__securityRequests.at(-1)))
    .toEqual({ method: 'getProducts', args: [], shopId: 'shop-account-a' });
  await page.evaluate(() => {
    window.__testAuth.currentUser = {uid:'account-b',email:'b@example.test',emailVerified:true};
    window.__completeSecurityRpc();
  });
  await expect.poll(() => page.evaluate(() => window.__securityError)).toBe('auth/session-changed');
  expect(await page.evaluate(() => window.__securityResult)).toBeUndefined();
});

test('CSP permits existing handlers and blocks arbitrary injected scripts and event handlers', async ({ page }) => {
  await authenticatedPage(page);
  await page.locator('#nav-date').click();
  await expect(page.locator('.calendar-day').first()).toBeVisible();
  await page.evaluate(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.__cspViolations.push(event.effectiveDirective));
    const script = document.createElement('script');
    script.textContent = 'window.__injectedScript = true';
    document.body.append(script);
    const image = document.createElement('img');
    image.setAttribute('onerror', 'window.__injectedHandler = true');
    document.body.append(image);
    image.dispatchEvent(new Event('error'));
  });
  await expect.poll(() => page.evaluate(() => window.__cspViolations.length)).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => Boolean(window.__injectedScript || window.__injectedHandler))).toBe(false);
});
