# Developer account access

The first successful shop-list/session request initializes the server-only
`system/systemAdmin` Firestore document. The backend scans **all pages** of Firebase
Authentication accounts and selects the earliest `metadata.creationTime`, regardless
of who made the request. The transaction never overwrites an existing assignment.
The caller cannot nominate a UID or assign this role through an RPC.

For an existing installation, this means the earliest **remaining** Auth account.
Firebase cannot recover an already deleted first account from `listUsers`. Confirm
the earliest account is the developer before deploying this change. Equal earliest
creation timestamps fail closed with a generic initialization error; a trusted
project operator must resolve that ambiguity using the original account records.

The record contains `uid`, `createdAt` (Auth creation time in Unix milliseconds),
and `initializedAt` (Firestore timestamp). Keep it in backups. Do not delete it to
reset access: deletion would enable initialization again. Disabling or deleting
the assigned Auth account does not promote another user. Recreating its UID with
a different creation timestamp also does not restore developer access.

Every privileged request checks the server record and live Auth account, including
email verification, disabled state and token revocation time. The developer sees
all stores through the existing shop picker and receives effective owner access
for all existing store operations. Actual store ownership and owner-protection
rules remain intact. No synthetic membership or per-user shop index is created.

Other accounts retain their normal membership permissions. The developer UID and
assignment are not returned in session responses, custom claims, member lists or
frontend configuration. Existing deny-all Firestore rules protect the registry;
all access continues through authenticated Cloud Functions. Existing request and
device logging remains enabled. This limits disclosure through the application;
it does not make the feature secret from someone with source or project access.

Deploy the Cloud Functions changes for this behavior to take effect. No frontend
build or Firestore rules change is required for this feature. The Functions runtime
service account needs Firebase Auth user-list/read permissions, in addition to its
existing Firestore permissions.
