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
  const app = read("public/js/app.js");
  const bridge = read("public/js/rpc-bridge.js");

  assert.match(app, /indexedDB\.open\('ginJiaPosLocal'/);
  assert.match(app, /return uid && shopId \? `\$\{uid\}:\$\{shopId\}`/);
  assert.match(app, /currentOrderRequestId/);
  assert.match(app, /product-load-error/);
  assert.match(bridge, /window\.saveOrderDraftNow/);
});

test("viewer role blocks mutation controls as well as backend calls", () => {
  const app = read("public/js/app.js");
  const css = read("public/css/app.css");

  assert.match(app, /#settingsCapacity input, #settingsCapacity button/);
  assert.ok((app.match(/此帳號只有檢視權限/g) || []).length >= 3);
  assert.match(css, /data-shop-role="viewer"/);
  assert.match(css, /button\[onclick\^="addDateOverride"\]/);
});

test("LINE is a no-input contact option and confirmation uses only the original sliders", () => {
  const html = read("public/index.html");
  const app = read("public/js/app.js");

  assert.match(html, /id="contactMethodPhone"[^>]*class="name-title-btn active"/);
  assert.match(html, /id="contactMethodLine"[^>]*class="name-title-btn"/);
  assert.match(app, /currentContactMethod === 'line' \? 'LINE'/);
  assert.match(app, /input\.readOnly = currentContactMethod === 'line'/);
  assert.match(app, /contactMethodLine[\s\S]*addEventListener\('click'/);
  assert.doesNotMatch(html, /statusConfirmButton|deleteConfirmButton/);
  assert.match(app, /initConfirmSlider\('statusSliderThumb'/);
  assert.match(app, /initConfirmSlider\('deleteSliderThumb'/);
});

test("opening the cart explicitly hides the Firebase account badge", () => {
  const app = read("public/js/app.js");
  const css = read("public/css/app.css");

  assert.match(app, /classList\.toggle\('cart-open'/);
  assert.match(app, /classList\.remove\('cart-open'\)/);
  assert.match(css, /body\.cart-open #firebaseAccountBadge[\s\S]*display: none !important/);
});
