# Database calls and data storage inventory

This inventory consolidates the implemented application workflows, browser persistence,
and migration utilities as of 2026-09-07. It describes current source behavior; it is
not a production database inspection or a proposed schema change.

Paths below are relative to `shops/{shopId}/` unless explicitly rooted at `users/`
or `system/`, plus the independent `posSecurityLimits/` collection. Read/write descriptions cover service work; the shared authorization
reads described below also apply. A single RPC can perform multiple queries, document
writes, or transaction retries, so RPC counts are not Firestore billing counts.

## Shared access and account lifecycle

Browser business operations go through `posRpc`; direct browser Firestore access is
denied. The dispatcher requires verified Firebase Authentication and checks shop access
before executing shop-scoped methods. Viewer methods are read operations; business
mutations require editor or owner; membership management and renaming require owner.

| Case / entry point | Reads or remote calls | Persistent changes |
| --- | --- | --- |
| Register, sign in with email/password or Google, sign out, reset password, verify email | Firebase Auth SDK calls; verification refresh reloads the user and forces an ID token refresh | Firebase Auth maintains accounts and authentication state; browser uses `browserLocalPersistence`. These are separate from POS Firestore documents. |
| Every recognized RPC: current-session and abuse checks | Live Auth user status/revocation time; transaction reads `posSecurityLimits/{uid}` | Updates independent request buckets and two-day `expiresAt`; Firestore TTL cleans inactive limit records. No existing business fields change. |
| Authorize every shop-scoped RPC: `requireShopAccess` | `system/systemAdmin`; ordinary users: `members/{uid}`. A matching system administrator additionally requires live Auth account validation and a read of `shops/{shopId}`. | None |
| List shops: `listMyShops` | System-admin initialization/check; normal users query `users/{uid}/shops` ordered by name; system admin queries all `shops` ordered by name | May initialize `system/systemAdmin` on first use |
| Initialize system administrator: `initializeSystemAdmin` | Reads `system/systemAdmin`; if absent, paginates Auth users to identify the unique earliest-created account, then rechecks the document in a transaction | Creates the server-only identity document once; ambiguous earliest timestamps fail initialization |
| Login initialization: `initializeSession` | Runs `listMyShops` and device recording concurrently | Same initialization side effect as shop listing, plus device history below |
| Device audit: `registerDeviceSession` / `recordDeviceSession` | Transaction reads target device and security-limit lock; new devices query up to 101 oldest records | Preserves the existing device path, fields, hashes and atomic seen-count increment; evicts oldest records beyond the 100-device cap and increments an independent transaction marker |

Sources: [RPC dispatcher](../functions/src/index.js), [shop services](../functions/src/services/shops.js),
[system administrator](../functions/src/lib/system-admin.js), [security history](../functions/src/services/security.js),
[browser Firebase bridge](../public/js/rpc-bridge.js).

## Shop and member management

| Case / RPC | Reads | Writes / deletes |
| --- | --- | --- |
| Create shop: `createShop` | Transaction reads the security-limit lock and up to 20 existing shops where `ownerUid` matches | Enforces the ownership cap, advances an independent transaction marker, then creates unchanged shop metadata, owner membership, `users/{uid}/shops/{shopId}` and `settings/capacity` with `usageVersion: 1` |
| List members: `listShopMembers` | `members`, ordered by role | None |
| Add member: `addShopMember` | Auth lookup by email and verified-email check; transaction reads shop and target membership | Transaction writes membership and user shop index; increments shop member count for a new member |
| Change role: `updateShopMemberRole` | Transaction reads target membership | Updates both membership and user shop index; owner role cannot be changed |
| Remove member: `removeShopMember` | Transaction reads shop and membership | Deletes membership and user shop index; updates member count; owner cannot be removed |
| Rename shop: `renameShop` | All shop memberships | Batch updates shop name and every member's user shop index |

Source: [shop services](../functions/src/services/shops.js). There is no exposed shop-deletion RPC.

## Catalog and customers

| Case / RPC | Reads | Writes / deletes |
| --- | --- | --- |
| Load/reload catalog: `getProducts` | All products ordered by `productName` | Browser caches the returned catalog in IndexedDB |
| Initial shop load: `getShopBootstrap` | Products, capacity settings/date overrides, then monthly usage or legacy order fallback | Browser caches catalog in IndexedDB and monthly capacity in memory |
| Create/edit product: `saveProduct` | No service-level pre-read | Creates a new product or updates an existing product, including name, category, prices, status, description and gift-box eligibility |
| Delete product: `deleteProduct` | No service-level pre-read | Deletes `products/{productId}`; no order cascade |
| Change special price: `updateProductSpecialPrice` | No service-level pre-read | Updates product special price and timestamp |
| Customer autocomplete: `searchCustomers` | Name/contact prefix query, limited to 8; phone search falls back to legacy `phone` if the new-field query is empty. Keywords shorter than 2 characters skip the customer query. | None |
| Save customer during order creation/edit | No separate customer read | Merges name, contact fields, address and last-order/update timestamps into `customers/{normalizedContact}` in the order transaction |

Phone customer document IDs are normalized numeric contacts; LINE contacts use an
opaque hash. The generic `LINE` contact additionally includes the customer name in
the reference input. There is no standalone customer create/edit/delete RPC.
Orders also store their own customer, recipient and delivery fields, plus embedded
items and gift-box composition; there is no separate live order-detail collection.

Sources: [catalog services](../functions/src/services/catalog.js), [bootstrap](../functions/src/services/bootstrap.js),
[catalog controller](../src/app/catalog.js), [order services](../functions/src/services/orders.js).

## Orders, payments and production capacity

| Case / RPC | Reads | Writes / deletes |
| --- | --- | --- |
| Search orders: `searchOrders` | Indexed status/name/contact/date query with cursor; requests page size + 1, default page size 30 and range 10–50. Empty first-page phone results can trigger a legacy phone query. Additional filters run after fetching. | None |
| Lookup ID / open details: `searchOrderById`, `getOrderDetails` | One order document | None |
| Show overdue orders: `searchOverdueOrders` | Orders due on/before Taipei today in open statuses, limited to 250 | None |
| Submit new order: `submitOrder` → `createOrder` | Capacity preflight below; transaction reads the order ID derived from the client request ID | Atomically creates order, merges customer and increments delivery-date usage. Existing order returns an idempotent replay without these writes. |
| Edit existing order: `submitOrder` → `updateOrder` | Capacity preflight, then transaction reads original order | Atomically updates order and customer, recalculates payment fields, and adjusts usage. Moving delivery dates subtracts old usage and adds new usage. |
| Change fulfillment/status or cancel: `updateOrderStatus` | Transaction reads order | Updates status; crossing the cancelled/non-cancelled boundary adjusts daily usage |
| Record deposit/payment: `updateOrderDeposit` | Transaction reads order | Updates cumulative paid amount, remaining amount, payment notes and status; adjusts capacity if cancellation membership changes |
| Delete order: `deleteOrder` | Transaction reads order | Deletes order and subtracts capacity when non-cancelled; customer record remains |
| Read settings: `getCapacitySettings` | `settings/capacity` and date overrides (optionally range-filtered); if config is absent, reads legacy `weekdayCapacity` | None |
| Calendar month: `getMonthCapacityStatus` | Settings/overrides plus range query of `capacityUsage` when `usageVersion >= 1`; otherwise reads projected order fields and aggregates them | None; browser may reuse an in-memory month cache |
| Submission capacity preflight: `checkCapacityBeforeOrder` | Settings/overrides for delivery date, usage or legacy orders, and an optional existing-order read to exclude its units | None until submission proceeds; an unconfirmed exceeded limit returns a confirmation result |
| Save recurring limits: `saveWeekdayCapacity` | No service-level pre-read | Merges weekday settings into `settings/capacity` |
| Save date limit: `saveDateOverrideCapacity` | No service-level pre-read | Merges `capacityOverrides/{YYYY-MM-DD}` |
| Save multiple date limits: `saveDateOverrideCapacityBatch` | No service-level pre-read | One batch merges the date override documents |
| Delete date limit: `deleteDateOverrideCapacity` | No service-level pre-read | Deletes the override document |

Capacity usage is an atomic increment on `capacityUsage/{YYYY-MM-DD}`, not a separate
pre-read in the order transaction. Limits are advisory: the capacity check precedes
the transaction and can race with another submission. Legacy capacity queries are
capped at 5,000 orders without the report query's explicit limit error.

Sources: [order services](../functions/src/services/orders.js), [submission](../functions/src/services/submit.js),
[capacity services](../functions/src/services/capacity.js).

## Reports and planning

| Case / RPC | Reads | Stored result |
| --- | --- | --- |
| Daily/date-range sales report: `generateDailyReport` | Orders in delivery-date range; excludes cancelled orders after retrieval; fetches distinct referenced gift-box products using `getAll` when present | None; Rust computes the response |
| Production demand: `getDemandStats` | Same order-range and referenced-product reads | None; Rust computes the response |

Both fail when the range query returns 5,000 documents, asking for a smaller range.
Reports and demand totals are not materialized in a Firestore collection.
Source: [report services](../functions/src/services/reports.js).

## Browser storage and offline behavior

| Storage / key | When used | Contents / lifecycle |
| --- | --- | --- |
| IndexedDB `ginJiaPosLocal`, store `drafts`, key `order:{uid}:{shopId}` | Debounced draft changes (250 ms), explicit draft preservation before reload/update, restore on shop load | Customer/recipient fields, date, carts, prices, edit state and request ID. Deletes empty, discarded, successfully submitted, invalid-age or older-than-30-day drafts; expiration is checked during restoration. |
| Same IndexedDB, store `catalogs`, key `products:{uid}:{shopId}` | Cache successful catalog loads; read when catalog loading fails | Product records and cache timestamp, displayed with stale-data notice; no explicit expiry in this code |
| localStorage `ginJiaPos.deviceId` | Verified-session device registration | Random persistent browser identifier; server receives it and stores its HMAC |
| localStorage `ginJiaPos.activeShop.{uid}` | Shop selection and next session initialization | Previously selected shop ID; selected against the authorized shop list |
| Firebase Auth local persistence | Authentication setup and session restoration | SDK-managed authentication state |
| sessionStorage `ginJiaPos.iosInstallHint` | Dismiss iOS install hint | `dismissed` for the tab session |
| Cache Storage `gin-jia-pos-{release hash}` | Service-worker install, fetch and activation | Allowlisted same-origin app shell, JS/CSS, Wasm, icons and fonts; activation removes old app cache versions |
| In-memory session state | Catalog filtering, search results, order details, month capacity, report rendering | Transient data; account/shop switches reload the page |

The service-worker cache excludes Auth and business API responses. IndexedDB
separately stores business data (catalog and drafts). Offline drafts are not a
background submission queue: saving an actual order requires a successful RPC.

Sources: [draft persistence](../src/app/drafts.js), [startup](../src/app/startup.js),
[catalog](../src/app/catalog.js), [Firebase bridge](../public/js/rpc-bridge.js),
[PWA](../public/js/pwa.js), [service worker](../public/sw.js).

## Migration and maintenance storage

These are explicit operator utilities, outside the normal browser RPC flow.

| Utility | Reads | Writes / deletes |
| --- | --- | --- |
| [Google Sheets exporter](../migration/ExportForFirebase.gs) | Products, customers, orders, order details and capacity sheets | JSON export file in Google Drive, subsequently downloaded locally |
| [JSON importer](../functions/scripts/import-data.js) | Local export JSON and destination shop | Bulk writes products, customers, orders, weekday config, capacity usage and date overrides with stable IDs |
| [Capacity backfill](../functions/scripts/backfill-capacity.js) | Shop, all projected orders and existing usage documents | Rebuilds daily usage, deletes obsolete usage documents, then enables `usageVersion: 1`; requires a quiet maintenance window |
| [Contact backfill](../functions/scripts/backfill-contacts.js) | Selected shop or all shops, then customers and orders | Default dry run; `--apply` merges normalized contact fields and schema version into records needing migration |
| Local legacy Excel conversion/import (`legacy-apps-script/data_trans`) | Converter reads XLSX; importer reads JSON, Auth account, ownership/membership/index, config and destination records | Converter writes JSON and validation report; importer defaults to preview and requires `--apply` for transactional business-data/config/usage writes |

Builds and tests also write generated bundles/Wasm/CSS, screenshots, test reports and
isolated emulator data. These are development artifacts, not application records.
No Firebase Cloud Storage bucket or attachment-upload workflow is implemented in the
current application sources.

## Operations that do not independently require database calls

Catalog filtering after load, cart composition, quantity/price calculations,
gift-box previews, shipping totals, navigation and rendering use existing in-memory
data. Order-related edits may still trigger local draft persistence. Rust domain
validation, payment calculations, aggregation and capacity arithmetic perform no I/O;
their host services supply fetched data and persist results where listed above.
