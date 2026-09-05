import { frontendSource } from './frontend-source.js';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("ships an installable PWA without the Tailwind CDN runtime", () => {
  const html = read("public/index.html");
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  const serviceWorker = read("public/sw.js");
  const firebaseConfig = JSON.parse(read("firebase.json"));

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /src="\/js\/pwa\.js"/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/i);
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.doesNotMatch(serviceWorker, /firebaseapp\.com|googleapis\.com|identitytoolkit/i);
  const scriptStylesHeader = firebaseConfig.hosting.headers.find((entry) => entry.source === "**/*.@(css|js)");
  assert.match(scriptStylesHeader.headers.find((header) => header.key === "Cache-Control").value, /no-cache/);
});

test("keeps order drafts and product fallbacks scoped to the signed-in shop", () => {
  const app = frontendSource();
  const bridge = read("public/js/rpc-bridge.js");

  assert.match(app, /indexedDB\.open\('ginJiaPosLocal'/);
  assert.match(app, /return uid && shopId \? `\$\{uid\}:\$\{shopId\}`/);
  assert.match(app, /currentOrderRequestId/);
  assert.match(app, /product-load-error/);
  assert.match(bridge, /window\.saveOrderDraftNow/);
});

test("viewer role blocks mutation controls as well as backend calls", () => {
  const app = frontendSource();
  const css = read("public/css/app.css");

  assert.match(app, /#settingsCapacity input, #settingsCapacity button/);
  assert.ok((app.match(/此帳號只有檢視權限/g) || []).length >= 3);
  assert.match(css, /data-shop-role="viewer"/);
  assert.match(css, /button\[onclick\^="addDateOverride"\]/);
});

test("LINE is a no-input contact option and confirmation uses only the original sliders", () => {
  const html = read("public/index.html");
  const app = frontendSource();

  assert.match(html, /id="contactMethodPhone"[^>]*class="name-title-btn active"/);
  assert.match(html, /id="contactMethodLine"[^>]*class="name-title-btn"/);
  assert.match(app, /currentContactMethod === 'line' \? 'LINE'/);
  assert.match(app, /input\.readOnly = state.currentContactMethod === 'line'/);
  assert.match(app, /contactMethodLine[\s\S]*addEventListener\('click'/);
  assert.doesNotMatch(html, /statusConfirmButton|deleteConfirmButton/);
  assert.match(app, /initConfirmSlider\('statusSliderThumb'/);
  assert.match(app, /initConfirmSlider\('deleteSliderThumb'/);
});

test("opening the cart explicitly hides the Firebase account badge", () => {
  const app = frontendSource();
  const bridge = read("public/js/rpc-bridge.js");
  const css = read("public/css/app.css");

  assert.match(app, /classList\.toggle\('cart-open'/);
  assert.match(app, /classList\.remove\('cart-open'\)/);
  assert.match(bridge, /classList\.toggle\('account-badge-visible', Boolean\(visible\)\)/);
  assert.match(css, /body\.account-badge-visible \.alert-container \{[^}]*top: calc\(72px \+ var\(--vp-top\)\)/);
  assert.match(css, /body\.cart-open #firebaseAccountBadge[\s\S]*display: none !important/);
});

test("PWA banner stays above navigation actions and clears the cart", () => {
  const css = read("public/css/app.css");

  assert.match(css, /body\.cart-open \.pwa-banner[\s\S]*pointer-events: none/);
  const workspace = read('src/styles/workspace.css');
  assert.match(workspace, /@media \(min-width: 900px\)[\s\S]*\.pwa-banner[\s\S]*position: static !important/);
  assert.match(workspace, /bottom: calc\(150px \+ env\(safe-area-inset-bottom\)\)/);
});

test("footer uses normal flow and only scrolls when page content overflows", () => {
  const html = read("public/index.html");
  const css = read("public/css/app.css");

  assert.match(html, /<main[\s\S]*<footer class="footer">[\s\S]*<\/main>/);
  assert.match(css, /main \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*overflow-y: auto/);
  assert.match(css, /\.content-section\.active \{[^}]*flex: 1 0 auto;[^}]*min-height: 0/);
  assert.match(css, /\.footer \{[^}]*flex: 0 0 auto/);
  assert.doesNotMatch(css, /\.footer \{[^}]*(?:position:\s*(?:fixed|sticky))/);
});

test("order search uses the same phone and LINE button pattern", () => {
  const html = read("public/index.html");
  const app = frontendSource();

  assert.doesNotMatch(html, /id="searchContactType"/);
  assert.match(html, /id="searchContactPhone"[^>]*class="name-title-btn active"/);
  assert.match(html, /id="searchContactLine"[^>]*class="name-title-btn"/);
  assert.match(app, /currentSearchContactMethod === 'line'\s*\?\s*'LINE'/);
  assert.match(app, /selectSearchContactMethod\('phone', false\)/);
});
