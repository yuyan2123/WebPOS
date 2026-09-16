# WebPOS — Rust domain + Firebase

WebPOS is a Traditional Chinese point-of-sale app for managing shops, products, customers,
orders and capacity. Originally built with Google Sheets + Apps Script, it now uses a shared
Rust domain compiled to WebAssembly,
modular browser controllers, and Firebase Hosting, Authentication, Cloud Functions and
Firestore. Database paths, RPC names, shop roles, order idempotency and local draft keys
remain compatible. See [the architecture and capability ledger](docs/architecture.md)
for the audit, migration boundaries and known limitations.

See the [database calls and storage inventory](docs/data-storage-cases.md) for all
application persistence workflows, RPC reads/writes, browser storage and migration utilities.

Users can create or join multiple shops, manage custom product categories and gift boxes,
record pickup or delivery orders, track deposits and payments, search orders, and review
daily reports and capacity. Customer entry accepts a name or contact information, with
phone and LINE contact modes. Server-side authorization controls editing and member management.

## Build and work locally

Install Node 22 and Rust through rustup, then run:

```powershell
npm ci
npm ci --prefix functions
rustup show
cargo install wasm-bindgen-cli --version 0.2.128 --locked
npx playwright install chromium webkit
npm run build
```

`rust-toolchain.toml` pins Rust, rustfmt, Clippy and the Wasm target. The build compiles
the Rust crate for browser and Node, generates the frontend and CSS, checks Rust/JS/TS,
and runs Rust, Node and Chromium/WebKit browser tests. Linux CI installs browser OS
dependencies with `playwright install --with-deps`.

Use `npm run dev` for the static preview at http://127.0.0.1:4173. It has no Firebase
configuration endpoint: use the Firebase emulators below for authenticated local use.
Browser tests supply an isolated RPC fixture and never modify a live shop. Transaction
tests exercise the real services with an in-memory transaction adapter; they do not
replace a staging test of Firebase Auth, App Check, indexes or deployed Functions.

For authenticated end-to-end backend checks, install Java 21 and run
`npm run test:integration` after building. This starts Auth, Firestore and Functions
under `demo-ginjia-pos`, with copied source and a temporary emulator-only secret in
`artifacts/emulator-test`. It never copies local credentials or `.env` files. CI runs
this suite before preview or live deployment. Ports 19099, 18080, 15101, 14400 and
14500 must be free. `FIREBASE_CLI_PATH` can point to an already installed Firebase CLI
JS entry point; otherwise the script uses pinned `firebase-tools@15.28.2` through npm.

Edit `src/app`, `src/ui`, `src/platform`, `src/styles` and `crates/pos-domain`.
`public/js/app.js`, `public/css/app.css`, `public/wasm`, and `functions/wasm` are generated
and committed deployment artifacts. Rebuild them after source changes. The small
`src/app/compatibility.js` export list preserves existing HTML handlers. Firebase SDK
integration stays in `public/js/rpc-bridge.js`, behind the promise-based `posApi` adapter.

## Project layout

```text
crates/pos-domain/          Rust item validation, capacity, pricing, payments and aggregation
src/app/                   Feature controllers and private session state
src/platform/              Typed Wasm and RPC host adapters
src/ui/                    Navigation, order context and accessible interactions
src/styles/                Component, surface, responsive and workspace styles
tests/browser/             Chromium + WebKit workflow/accessibility regression tests
docs/                      Architecture, capability ledger and security rules audit
public/                    Firebase Hosting site
  index.html               POS markup
  css/app.css              UI styles
  css/tailwind.generated.css  Build-time utility CSS (no CDN runtime)
  js/app.js                Generated browser bundle
  wasm/                    Generated Rust browser module
  vendor/                  Pinned datepicker/icons and licenses
  js/pwa.js                Install, offline and update lifecycle
  js/runtime-config.js     Public App Check site-key setting
  js/rpc-bridge.js         Apps Script-compatible Firebase RPC bridge
  manifest.webmanifest     iOS/iPadOS/Android PWA metadata
  sw.js                    Same-origin app-shell offline fallback
functions/
  wasm/                    Generated Rust Node module
  src/index.js             Authenticated POS RPC entry point
  src/services/            Products, orders, reports, capacity
  src/lib/                 Auth, tenant isolation, validation, IDs, serialization
  scripts/import-data.js   One-time Firestore importer
  scripts/backfill-capacity.js  Existing-shop capacity counter migration
  scripts/backfill-contacts.js  Phone/LINE contact schema migration
migration/
  ExportForFirebase.gs     One-time Google Sheets exporter
legacy-apps-script/        Local-only legacy files and migration tools (ignored by Git)
firebase.json              Hosting, Functions, Firestore, emulator config
firestore.rules            Denies direct browser access to POS records
```

## Public repository and private files

[`.gitignore`](.gitignore) excludes local environment and secret files, downloaded service-account
credentials and private keys, spreadsheets, migration data, database exports and backups, logs,
and local build/test artifacts. Keep customer, order and account data out of source files and
documentation, and store custom exports in the ignored `exports/`, `backups/` or `output/` directories.
Ignore rules match filenames and paths; they do not detect sensitive contents in arbitrary files.

Commit only placeholder configuration such as `.firebaserc.example` and `functions/.env.example`.
The deployment workflows reference GitHub Actions secrets; configure their values in GitHub,
never in committed YAML. Public runtime configuration and generated deployment assets remain tracked.

Adding a file to `.gitignore` does not remove it from Git tracking or history. Before making a
repository public, review its existing history as well as current files. If credentials were
committed, revoke or rotate them and remove the sensitive content from history before publishing.

## Firebase setup

1. Create a Firebase project and register a Web app.
2. Upgrade the project to the Blaze plan (required to deploy Cloud Functions).
3. Enable Firestore in Native mode in an Asia region.
4. In Authentication, enable the Email/Password and Google providers, then add the Hosting/custom domains as authorized domains. Enable Email Enumeration Protection in Google Cloud as recommended by Firebase. Email verification is enforced by both the browser and every Cloud Function.
5. Install the Firebase CLI and sign in.
6. Copy `.firebaserc.example` to `.firebaserc` and replace the project ID.
7. In `functions`, copy `.env.example` to `.env`. Set `POS_ALLOWED_EMAILS` to the allowed account emails, or leave it empty to allow any authenticated, email-verified account. Both Email/Password and Google sign-in are supported.
8. Create the HMAC key used for pseudonymous device/network audit records with `firebase functions:secrets:set SECURITY_HASH_SALT`. Use at least 32 random characters and never commit it.
9. Complete the build instructions above, run `npm run test:integration`, then deploy from the project root with `firebase deploy`.

`npm run build` compiles Rust/Wasm and the frontend, runs static checks, and runs Rust, Node
and browser tests. The emulator integration suite is a separate command. `firebase deploy`
and `npm run deploy` do not build or test automatically: `firebase.json` has no predeploy hook.

GitHub workflows run the build and emulator tests before deployment. Same-repository pull
requests receive Hosting previews; fork pull requests are skipped by the preview workflow.
Merges to `main` deploy Firestore rules/indexes, Functions and Hosting together. For your own
deployment, update the hard-coded project ID and service-account secret reference in both
files under `.github/workflows/`; changing `.firebaserc` alone does not change CI's target.

For the live workflow, the GitHub deployment service account needs Firebase Hosting Admin,
Firebase Rules Admin, Datastore Index Admin, Cloud Functions Admin, Secret Manager Viewer and
Service Usage Consumer on the project. Grant Service Account User only on the runtime identities
reported by the Firebase CLI (this project uses both its App Engine and Gen 2 Compute runtime
accounts), rather than on every service account in the project. Secret Manager Viewer exposes
metadata required for deployment, not secret values.

For the local emulator, create the ignored file `functions/.secret.local` containing
`SECURITY_HASH_SALT=` followed by a development-only random value of at least 32 characters.
Customize the verification and password-reset messages under Authentication → Templates before launch.

### Production abuse protection

Before public launch, register the Web app with Firebase App Check using reCAPTCHA Enterprise.
Put its public site key in `public/js/runtime-config.js`, set `ENFORCE_APP_CHECK=true` in the
Functions environment, verify App Check metrics, and redeploy. When enforcement is on, callable
requests without a valid App Check token are rejected before POS code runs.

The web app loads its Firebase configuration from Hosting's reserved
`/__/firebase/init.json` URL, so no Firebase keys need to be copied into source files.

## Security and account isolation

- The Hosting HTML and JavaScript are public, but contain no catalog, customer, order, phone,
  address, or report records.
- Every RPC requires a valid Firebase Authentication token.
- Every RPC requires the token's `email_verified` claim to be true; hiding or changing the browser UI cannot bypass this check.
- The backend takes the caller UID only from `request.auth.uid`; a UID sent by browser code is ignored.
- Every shop-scoped request enforces server-side authorization before accessing `shops/{shopId}`. Session, device registration and shop creation/listing use account-level authorization.
- Firestore rules deny all direct browser reads and writes, including a user's own records.
- Changing accounts or shops reloads the page so records cannot remain in browser memory.
- The optional email allowlist makes the entire application invite-only.
- App Check can additionally reject requests that did not originate from the registered web app.
- After a verified login, the app creates a random browser-local device ID and records a security-history document. Device ID, IP address, and user agent are stored only as keyed HMAC hashes under the user's private server-only collection.

IP addresses and browser/device identifiers never replace account verification. They can be shared,
spoofed, copied, or reset, so this project uses them only for audit history—not to grant access or
skip Email verification. Direct browser access to these security records is denied by Firestore rules.

The static interface being downloadable is normal for a web application. Private data is protected
by authentication plus server-enforced ownership; it is never embedded in the public bundle.

## Move existing Google Sheets data

1. Add `migration/ExportForFirebase.gs` to the original spreadsheet's bound Apps Script project.
2. Run `exportForFirebase()` and approve its Google Sheets/Drive permissions.
3. Download the JSON file linked in the execution log and save it as `migration/data.json` here.
4. Sign in, create the destination shop, and copy its shop ID from the shop manager.
5. Set Google Application Default Credentials for the destination Firebase project.
6. From `functions`, run `npm run import:data -- SHOP_ID`. The shop ID is mandatory and decides which collaborative shop owns every imported record.
7. Compare product, customer, order, report, and capacity totals before switching users to Firebase.

This older importer writes immediately using Admin SDK credentials and replaces documents
with matching IDs. It has no dry run or membership/owner verification and rebuilds capacity
totals from the input export alone. Repeating an import can overwrite later POS edits; it
is intended for an initial migration into an empty destination shop. Writes are not one
atomic transaction. Run the contact backfill below after importing the older customer schema.

### Upgrade an existing Firebase shop

Shops created or imported by the current code already use daily capacity counters. For a shop
that contains orders from an earlier deployment, run this once from `functions` during a quiet
maintenance window:

```powershell
npm run backfill:capacity -- SHOP_ID
```

The script rebuilds `capacityUsage` from existing non-cancelled orders and then enables counter
reads for that shop. Do not create or edit orders while it is running. Verify the calendar totals,
then deploy the Functions, Hosting, Firestore indexes, and rules together with `firebase deploy`.

To add phone/LINE contact searching to existing shops, first review a dry run and then apply it:

```powershell
$env:SHOP_ID = 'your-shop-id'
npm --prefix functions run backfill:contacts
npm --prefix functions run backfill:contacts -- --apply
```

Omit `SHOP_ID` only when you intentionally want to process every shop. Deploy the new indexes
before exposing the updated search UI.

## Install on iPhone, iPad and Android

- Android/Chrome shows the native install prompt when supported.
- iPhone/iPad users open the site in Safari, tap Share, then **Add to Home Screen**.
- The service worker caches the app shell; catalogs and unfinished order drafts are stored separately in IndexedDB per account and shop. Authentication and startup still require backend access, so this is not a fully offline POS.
- Authentication, Functions responses and business records are never stored in the service-worker cache.
- An available PWA update waits when an unfinished order draft exists.

## Local testing

After installing dependencies, building, selecting a Firebase project and creating the local
environment/secret files described above, run `npm run emulators` from the root, then open
`http://127.0.0.1:5000`. Use local test accounts and data; the emulator UI runs on port 4000.
The browser bridge automatically connects Authentication and Functions to their emulators
when the host is `localhost` or `127.0.0.1`.

## Firestore model

- `shops/{shopId}` — shop metadata and owner
- `shops/{shopId}/members/{uid}` — owner, editor, or viewer membership
- `users/{uid}/shops/{shopId}` — each account's shop selector index
- `users/{uid}/securityDevices/{deviceHash}` — server-only pseudonymous login/device history
- `shops/{shopId}/products/{productId}` — collaborative catalog and prices
- `shops/{shopId}/customers/{normalizedContact}` — collaborative customer data; legacy phones keep their numeric ID and LINE IDs use an opaque hash
- `shops/{shopId}/orders/{orderId}` — collaborative orders and gift-box composition
- `shops/{shopId}/settings/capacity` — all seven recurring weekday limits and counter schema version
- `shops/{shopId}/capacityOverrides/{YYYY-MM-DD}` — collaborative date overrides
- `shops/{shopId}/capacityUsage/{YYYY-MM-DD}` — atomically maintained daily capacity total

All browser access to Firestore is denied. Authenticated users call Cloud Functions, which derive
the user UID only from the verified Firebase Authentication token. Shop-scoped requests enforce
server-side authorization before reading or changing business data.

`POS_ALLOWED_EMAILS` is an optional second gate. Leave it empty for a multi-user app where any
email-verified account may create shops or join shops shared with it; populate it to make the entire POS invite-only.

Shop roles are enforced by the backend: owners manage the shop and members, editors operate the
POS, and viewers can only search and view data and reports. One account can own or join many shops.
To add a collaborator, that account must sign into the POS once and verify its Email so Firebase Authentication
has created its account record; the shop owner can then add its email from the shop manager.

## Database request budget

- Startup combines the device audit and shop list in `initializeSession`. When the saved shop is available or there is only one shop, that response also includes the catalog, capacity settings and current month; otherwise `getShopBootstrap` loads them after shop selection.
- Customers are queried only after two characters, limited to eight prefix matches, and cached in the browser.
- Capacity usage is loaded for the requested calendar month; capacity settings include all date overrides. Future months load on navigation and are cached until relevant changes invalidate them.
- Capacity views read one small daily aggregate document per used date instead of scanning every order.
- Capacity totals are updated atomically in the same batch or transaction as order creation, editing, status changes, and deletion.
- Weekday capacity settings are stored in one document, so saving all seven days is one write.
- Capacity validation and order creation/update share one authenticated callable request through `submitOrder`.
- Product mutations update the browser cache from the returned record instead of reloading the catalog.
- Device audit uses an atomic increment, avoiding a read-before-write transaction.
- Order search is bounded and cursor-paginated; opening a result already containing its items does not make a second detail request.
- Successful product catalogs and unfinished orders are stored per `uid:shopId` in IndexedDB, preventing cross-account/shop cache leakage.

Shop authorization is checked on every shop-scoped request. Browser role information never
replaces these backend checks.
Firestore index exemptions in `firestore.indexes.json` also avoid indexing large fields that are never queried.
