# POS architecture and migration ledger

## Baseline audit (2026-09-06)

The starting repository is Firebase Hosting + a 4,748-line classic browser script,
a 699-line Firebase bridge and a 4,640-line stylesheet. There is no frontend router
or module boundary. Inline DOM handlers share mutable globals. A single authenticated
callable (`posRpc`) dispatches to Node services. Firestore transactions maintain orders,
customers and daily capacity counters. Firebase Admin is the only database client;
browser rules deny all reads/writes. Email verification, optional email allowlist,
per-request shop membership and owner/editor/viewer checks protect RPCs. App Check is
configurable. Device session auditing uses HMAC pseudonyms.

The browser caches catalogs and drafts in IndexedDB under UID + shop, customer prefix
results in memory, and visible calendar months in memory. The service worker caches
only the app shell. Google login, email/password registration, verification, password
reset, multi-shop selection/membership, PWA installation/update, Air Datepicker,
Font Awesome and one-time Apps Script/Firestore migration tools are integrations.

Baseline: all 25 tests pass. Most existing tests inspect source; they do not prove live
Firebase behavior. No authenticated browser/emulator fixtures existed.

### Capability inventory / preservation contract

| Area | Existing capabilities that must remain |
|---|---|
| Accounts | Google/email login, registration, verification/resend/refresh, reset, sign out, session audit |
| Shops | Create/select/rename, list/add/remove members, owner/editor/viewer roles, isolation on switch |
| Customer | Name/title, autocomplete, phone or no-input LINE marker, normal/company pricing, recipient, address |
| Delivery | Home/shipping/pickup, free/charged shipping, calendar, capacity badges, date confirmation |
| Catalog | Gift/cake categories, enabled/disabled, descriptions, base/company/special prices, gift-box eligibility, CRUD |
| Gift boxes | 6/8/10/12/15 sizes, composition quantities, notes, pricing, back/edit flows |
| Cart | Add/detail/quantity/remove, separate price variants, shipping, draft recovery, edit existing orders |
| Submit | Idempotency key, loading lock/watchdog, capacity confirmation, create/update, payment adjustment |
| Search | Name/contact/date/status, cursor pagination, overdue orders, expanded items, detail view |
| Payments | Deposit/remaining/status preview, paid/completed/cancelled statuses, slide confirmation, delete |
| Planning | Weekday autosave, single/range date overrides, delete override, demand/gift-box totals |
| Reports | Daily revenue/order/item/average summaries, product breakdown |
| Platform | Responsive iframe viewport, device diagnostics, keyboard, install/offline/update, cache scoping |
| Migration | Export/import, capacity and contact backfills, stable document IDs and existing schema |

### Findings

- Duplicate `toggleShippingFeeInput`; the last declaration is the runtime behavior.
- Report HTML interpolates product names without escaping (stored markup injection).
- RPC method lookup inherits Object.prototype; unknown inherited names must be rejected.
- Calendar and confirmation sliders need keyboard semantics; modals need focus containment/restoration.
- Navigation has no history and hides labels at some widths; report/planning discovery is buried in settings.
- Broad stylesheet overrides obscure ownership. UI feedback/accessibility is partly applied only at startup.
- Report and legacy-capacity queries cap at 5,000 records; compound search filters can yield sparse pages.
- Capacity warnings read before order transactions: counters remain atomic, but warnings are advisory and
  may race. Preserve this explicit business rule rather than silently introducing a hard capacity limit.
- Client-entered prices are intentional staff overrides, not trusted public checkout prices.
- Firestore's deny-all rules prevent create/update bypass, role self-assignment and direct data abuse.
  Admin SDK RPC validation remains a separate boundary requiring application tests.

## Target and decisions

Rust is the portable domain implementation for capacity, unit accounting, pricing,
payment transitions, report aggregation and demand planning. One crate compiles to
WebAssembly for Node and the browser; typed serde contracts and Result errors form the
boundary. There is no native addon, new server or data migration. Node owns Firebase
SDK calls, I/O concurrency, transactions, identity and serialization. Browser modules
own DOM, input, local persistence and navigation. Existing inline handlers remain
behind an explicit compatibility export while feature modules replace the monolith.

This avoids translating Firebase's supported SDK into a custom Rust REST client or
rewriting browser widgets. Domain operations are small synchronous computations; async
I/O remains concurrent in the host where the supported APIs live.

Migration order: capture baseline and feature inventory → extract modules preserving
bindings → introduce Rust behind adapters → redesign shell/interactions → behavioral
parity and browser checks → remove replaced source. Existing database schema, RPC method
names, positional arguments, idempotency keys and IndexedDB keys remain stable.

## Implemented migration

- Browser behavior is split into feature controllers, platform adapters, workspace UI,
  accessibility and a private session store. The HTML compatibility boundary exposes
  65 handlers rather than every helper or mutable variable. The duplicate shipping
  function and four unreachable helpers were removed after call-site review.
- Rust owns item validation/normalization, price selection, gift-box unit expansion,
  capacity state, deposit/payment revisions, report aggregation and production demand.
  Adapters preserve JavaScript coercion and UTF-16 length limits at the wire boundary.
- Navigation separates ordering from management and exposes reports/planning directly
  on wide screens. Hash routes support history and preserve old `?section=` shortcuts.
  Order context links keep customer, date and cart within reach. Catalog search and
  optional recipient details provide progressive disclosure.
- Calendar buttons, keyboard confirmation, dialog focus/return/inert behavior,
  meaningful control names, live errors, reduced motion and forced-colors support
  improve keyboard and assistive-technology access. Mobile navigation keeps labels.
- Rendering escapes customer/product/report text and inline-handler arguments. RPC
  dispatch rejects inherited methods and malformed envelopes; logging records method,
  outcome and duration without customer data. Firestore rules and roles are unchanged.
- Checkout rechecks offline/viewer state at submission time; capacity cancellation
  releases the lock without a stale click throttle. Zero remaining balances display
  correctly. The previously missing gift-box price-preview handler now shows totals.
- IndexedDB writes resolve on transaction completion, not just request success.
  Service workers install a whole release (including Rust, local datepicker and icons)
  and serve it consistently until update acceptance. Existing waiting updates are
  offered on reopen and drafts are saved before controller-change reloads.

## Verification and remaining boundaries

`npm run build` compiles Wasm for both hosts, generates CSS/browser artifacts, runs
rustfmt, Clippy with warnings denied, ESLint, TypeScript boundary checks, syntax checks,
native Rust tests, Node service/contract tests, and Chromium/WebKit workflow tests.
Legacy report/item implementations are retained **only as test fixtures** for
differential verification (500 item inputs and 100 mixed report/demand datasets).
Browser tests cover desktop 1440×1000, tablet 820×1180, phone 390×844 and WebKit.
Automated axe checks cover the customer, date and search screens; screenshots are
written to Playwright test results for visual review.

The Firebase browser SDK bridge and Admin SDK I/O are deliberately retained. Feature
controllers still share a transitional session store and some reciprocal imports;
future changes should move one complete flow at a time to explicit state/actions.
Complex existing component styles remain compatibility modules in cascade order.
TypeScript checks the new Wasm contracts, while extracted JS is syntax/lint checked.
Reports/legacy-capacity reads retain their existing 5,000-record cap and sparse
post-filtered search pages remain possible. Capacity warnings remain advisory.

Dependency audit: root tooling has no reported advisories. The existing Firebase
dependency tree reports seven moderate entries from one transitive `uuid@9.0.1`
advisory ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)).
The installed gaxios and teeny-request call `v4()` without output buffers; the advisory
concerns `v3`/`v5`/`v6` buffer bounds. Those observed call sites do not use the affected
operation. Keep tracking upstream updates; npm's proposed forced Firebase major
downgrade was not applied, and the dependency is not claimed to be patched.

The isolated Firebase emulator suite additionally passes authenticated callable
workflows for verification/roles/isolation, catalog/membership management, customer
search, idempotent submission, capacity warnings/counters, payment, reports, demand,
and direct-client deny-all rules. It runs before CI deployment, using a demo project
and temporary local secret.

No production database migration or live deployment was performed. Auth provider configuration,
App Check enforcement, deployed Firestore indexes, real-device PWA installation,
screen-reader operation, and production data parity still require staging acceptance.
Browser RPC fixtures and in-memory transaction tests cannot prove those integrations.

Design references: [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
[Apple layout](https://developer.apple.com/design/human-interface-guidelines/layout),
[wasm-bindgen host targets](https://wasm-bindgen.github.io/wasm-bindgen/reference/deployment.html).
