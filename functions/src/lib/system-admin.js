import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../firebase.js";

// Server-only identity. Never copy this document into claims, membership lists,
// or session responses. Firestore rules prohibit all direct client access.
const adminReference = () => db.doc("system/systemAdmin");

export async function initializeSystemAdmin() {
  const reference = adminReference();
  if ((await reference.get()).exists) return;

  let earliest;
  let tied = false;
  let pageToken;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const account of page.users) {
      const createdAt = Date.parse(account.metadata.creationTime);
      if (!Number.isFinite(createdAt)) {
        throw new HttpsError("failed-precondition", "帳號初始化失敗，請聯絡系統維護人員");
      }
      if (!earliest || createdAt < earliest.createdAt) {
        earliest = { uid: account.uid, createdAt };
        tied = false;
      } else if (createdAt === earliest.createdAt) {
        tied = true;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  // Do not guess which account is first when imported accounts share a timestamp.
  if (!earliest || tied) {
    throw new HttpsError("failed-precondition", "帳號初始化失敗，請聯絡系統維護人員");
  }
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(reference)).exists) return;
    transaction.create(reference, { ...earliest, initializedAt: Timestamp.now() });
  });
}

export async function isSystemAdmin(user) {
  const snapshot = await adminReference().get();
  const identity = snapshot.exists ? snapshot.data() : null;
  if (!identity || identity.uid !== user.uid || !Number.isFinite(identity.createdAt)) return false;

  // Check live Auth state on every privileged request. Deletion, disabling, or
  // recreating the account must never transfer this authority to another account.
  let account;
  try {
    account = await getAuth().getUser(user.uid);
  } catch (error) {
    if (error.code === "auth/user-not-found") return false;
    throw error;
  }
  const validAfter = Date.parse(account.tokensValidAfterTime);
  return (
    !account.disabled &&
    account.emailVerified &&
    Date.parse(account.metadata.creationTime) === identity.createdAt &&
    Number.isFinite(user.authTime) &&
    Number.isFinite(validAfter) &&
    user.authTime >= Math.floor(validAfter / 1000)
  );
}
