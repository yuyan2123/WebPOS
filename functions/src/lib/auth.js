import { HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";

export function authorize(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "請先使用授權帳號登入");
  }

  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("failed-precondition", "請先完成 Email 驗證，再使用 POS");
  }

  const configured = String(process.env.POS_ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const email = String(request.auth.token.email || "").toLowerCase();
  if (configured.length > 0 && (!email || !configured.includes(email))) {
    throw new HttpsError("permission-denied", "此帳號沒有 POS 使用權限");
  }

  return {
    uid: request.auth.uid,
    authTime: request.auth.token.auth_time,
    email,
    name: String(request.auth.token.name || ""),
    emailVerified: true,
  };
}

// Callable token verification checks signature/expiry, but not revocation. Keep
// this live check outside Firestore rules: all POS operations use the Admin SDK.
export async function requireCurrentSession(user) {
  let account;
  try {
    account = await getAuth().getUser(user.uid);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "登入狀態已失效，請重新登入");
    }
    throw error;
  }
  const validAfter = Date.parse(account.tokensValidAfterTime);
  if (
    account.disabled ||
    !account.emailVerified ||
    String(account.email || "").toLowerCase() !== user.email ||
    !Number.isFinite(user.authTime) ||
    !Number.isFinite(validAfter) ||
    user.authTime < Math.floor(validAfter / 1000)
  ) {
    throw new HttpsError("unauthenticated", "登入狀態已失效，請重新登入");
  }
}
