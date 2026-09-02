# 金家 POS — Firebase edition

This project is the Firebase migration of the original Google Sheets + Apps Script POS.
The existing Traditional Chinese interface and workflows are preserved, while Firebase
Hosting, Authentication, Cloud Functions, and Cloud Firestore replace Apps Script and
Google Sheets at runtime.

## Project layout

```text
public/                    Firebase Hosting site
  index.html               POS markup
  css/app.css              UI styles
  css/tailwind.generated.css  Build-time utility CSS (no CDN runtime)
  js/app.js                POS behavior
  js/pwa.js                Install, offline and update lifecycle
  js/runtime-config.js     Public App Check site-key setting
  js/rpc-bridge.js         Apps Script-compatible Firebase RPC bridge
  manifest.webmanifest     iOS/iPadOS/Android PWA metadata
  sw.js                    Same-origin app-shell offline fallback
functions/
  src/index.js             Authenticated POS RPC entry point
  src/services/            Products, orders, reports, capacity
  src/lib/                 Auth, tenant isolation, validation, IDs, serialization
  scripts/import-data.js   One-time Firestore importer
  scripts/backfill-capacity.js  Existing-shop capacity counter migration
  scripts/backfill-contacts.js  Phone/LINE contact schema migration
migration/
  ExportForFirebase.gs     One-time Google Sheets exporter
legacy-apps-script/        Local-only source snapshot (ignored by Git)
firebase.json              Hosting, Functions, Firestore, emulator config
firestore.rules            Denies direct browser access to POS records
```

## Firebase setup

1. Create a Firebase project and register a Web app.
2. Upgrade the project to the Blaze plan (required to deploy Cloud Functions).
3. Enable Firestore in Native mode in an Asia region.
4. In Authentication, enable the Email/Password and Google providers, then add the Hosting/custom domains as authorized domains. Enable Email Enumeration Protection in Google Cloud as recommended by Firebase. Email verification is enforced by both the browser and every Cloud Function.
5. Install the Firebase CLI and sign in.
6. Copy `.firebaserc.example` to `.firebaserc` and replace the project ID.
7. In `functions`, copy `.env.example` to `.env` and list the staff Google account emails.
8. Create the HMAC key used for pseudonymous device/network audit records with `firebase functions:secrets:set SECURITY_HASH_SALT`. Use at least 32 random characters and never commit it.
9. Run `npm ci` at the project root and `npm ci --prefix functions`, then deploy from the project root with `firebase deploy`.

The root build runs local Tailwind generation, syntax checks and the complete test suite. GitHub
pull requests build before creating a Hosting preview; merges to `main` build and deploy Firestore
rules/indexes, Functions and Hosting together.

For the live workflow, the GitHub deployment service account needs Firebase Hosting Admin,
Firebase Rules Admin, Datastore Index Admin, Cloud Functions Admin, Secret Manager Viewer and
Service Usage Consumer on the project. Grant Service Account User only on the Functions runtime
service account (`PROJECT_ID@appspot.gserviceaccount.com`), rather than on every service account
in the project. Secret Manager Viewer exposes metadata required for deployment, not secret values.

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
- Every request verifies that UID is a member of the selected shop before reading or writing below `shops/{shopId}`.
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

The importer is idempotent for the same export: product, order, customer, weekday, and
date-override documents are written with stable IDs.

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
- The app shell can reopen during a connection failure, while order drafts stay in IndexedDB.
- Authentication, Functions responses and business records are never stored in the service-worker cache.
- An available PWA update waits when an unfinished order draft exists.

## Local testing

Run `firebase emulators:start` from the root, then open `http://127.0.0.1:5000`.
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
the user UID only from the verified Firebase Authentication token. For each request it verifies
that UID against `shops/{shopId}/members/{uid}` before building any business-data reference.
Separate shops cannot read, edit, search, report on, or delete one another's records.

`POS_ALLOWED_EMAILS` is an optional second gate. Leave it empty for a multi-user app where any
Google account may create shops or join shops shared with it; populate it to make the entire POS invite-only.

Shop roles are enforced by the backend: owners manage the shop and members, editors operate the
POS, and viewers can only search and view data and reports. One account can own or join many shops.
To add a collaborator, that account must sign into the POS once and verify its Email so Firebase Authentication
has created its account record; the shop owner can then add its email from the shop manager.

## Database request budget

- Initial shop data uses one `getShopBootstrap` call for the product catalog and visible calendar month.
- Login combines the pseudonymous device audit and shop list into one `initializeSession` request.
- Customers are queried only after two characters, limited to eight prefix matches, and cached in the browser.
- Only the visible calendar month is loaded. Future months load on navigation and stay cached until an order or capacity setting changes.
- Capacity views read one small daily aggregate document per used date instead of scanning every order.
- Capacity totals are updated atomically in the same batch or transaction as order creation, editing, status changes, and deletion.
- Weekday capacity settings are stored in one document, so saving all seven days is one write.
- Capacity validation and order creation/update share one authenticated callable request through `submitOrder`.
- Product mutations update the browser cache from the returned record instead of reloading the catalog.
- Device audit uses an atomic increment, avoiding a read-before-write transaction.
- Order search is bounded and cursor-paginated; opening a result already containing its items does not make a second detail request.
- Successful product catalogs and unfinished orders are stored per `uid:shopId` in IndexedDB, preventing cross-account/shop cache leakage.

Shop membership is deliberately checked on every callable request. This security read is not cached or
trusted from the browser because it is the boundary that prevents one shop from accessing another shop's data.
Firestore index exemptions in `firestore.indexes.json` also avoid indexing large fields that are never queried.
