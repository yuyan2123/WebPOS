import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../firebase.js";
import { assert, forbidden, notFound } from "../lib/errors.js";
import { newId } from "../lib/ids.js";
import { text } from "../lib/values.js";
import { initializeSystemAdmin, isSystemAdmin } from "../lib/system-admin.js";
import { MAX_OWNED_SHOPS, securityLimitReference } from "../lib/rate-limit.js";
import { HttpsError } from "firebase-functions/v2/https";

const ROLE_LEVEL = Object.freeze({ viewer: 1, editor: 2, owner: 3 });

function validRole(role, allowOwner = false) {
  const normalized = text(role).toLowerCase();
  const allowed = allowOwner ? ["owner", "editor", "viewer"] : ["editor", "viewer"];
  assert(allowed.includes(normalized), "成員角色不正確");
  return normalized;
}

function shopReference(shopId) {
  const normalized = text(shopId);
  assert(normalized && !normalized.includes("/"), "店鋪編號不正確");
  return db.collection("shops").doc(normalized);
}

function userShopReference(uid, shopId) {
  return db.collection("users").doc(uid).collection("shops").doc(shopId);
}

export async function requireShopAccess(user, shopId, requiredRole = "viewer") {
  const reference = shopReference(shopId);
  if (await isSystemAdmin(user)) {
    if (!(await reference.get()).exists) notFound("找不到店鋪，或此帳號不是店鋪成員");
    return { ...user, shopId: reference.id, role: "owner", shopRef: reference };
  }
  const membership = await reference.collection("members").doc(user.uid).get();
  if (!membership.exists) notFound("找不到店鋪，或此帳號不是店鋪成員");
  const role = validRole(membership.data().role, true);
  if (ROLE_LEVEL[role] < ROLE_LEVEL[requiredRole]) {
    forbidden("此帳號沒有執行這項操作的權限");
  }
  return {
    ...user,
    shopId: reference.id,
    role,
    shopRef: reference,
  };
}

export async function listMyShops(user) {
  await initializeSystemAdmin();
  if (await isSystemAdmin(user)) {
    const snapshot = await db.collection("shops").orderBy("name").get();
    return snapshot.docs.map((document) => ({
      shopId: document.id,
      name: document.data().name,
      ownerUid: document.data().ownerUid,
      role: "owner",
    }));
  }
  const snapshot = await db.collection("users").doc(user.uid).collection("shops").orderBy("name").get();
  return snapshot.docs.map((document) => ({ shopId: document.id, ...document.data() }));
}

export async function createShop(user, input = {}) {
  const name = text(input.name);
  assert(name.length >= 2 && name.length <= 60, "店鋪名稱需為 2 至 60 個字元");
  const shopId = newId("S");
  const shopRef = shopReference(shopId);
  const memberRef = shopRef.collection("members").doc(user.uid);
  const capacityConfigRef = shopRef.collection("settings").doc("capacity");
  const userShopRef = userShopReference(user.uid, shopId);
  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    // This shared document serializes concurrent creations from every instance.
    // Query the existing ownership field so legacy shops count without migration.
    const limitRef = securityLimitReference(user.uid);
    const [limitSnapshot, owned] = await Promise.all([
      transaction.get(limitRef),
      transaction.get(db.collection("shops").where("ownerUid", "==", user.uid).limit(MAX_OWNED_SHOPS)),
    ]);
    if (owned.size >= MAX_OWNED_SHOPS) {
      throw new HttpsError("resource-exhausted", "已達可建立的店鋪數量上限");
    }
    transaction.set(limitRef, { shopRevision: (limitSnapshot.data()?.shopRevision || 0) + 1 }, { merge: true });
    transaction.create(shopRef, {
      name,
      ownerUid: user.uid,
      memberCount: 1,
      createTime: now,
      updateTime: now,
    });
    transaction.create(memberRef, {
      uid: user.uid,
      email: user.email,
      name: user.name,
      role: "owner",
      joinedAt: now,
    });
    transaction.create(userShopRef, {
      shopId,
      name,
      role: "owner",
      ownerUid: user.uid,
      joinedAt: now,
      updateTime: now,
    });
    transaction.create(capacityConfigRef, {
      weekday: {},
      usageVersion: 1,
      updateTime: now,
    });
  });

  return { success: true, shop: { shopId, name, role: "owner", ownerUid: user.uid } };
}

export async function listShopMembers(shop) {
  const snapshot = await shop.shopRef.collection("members").orderBy("role").get();
  return snapshot.docs.map((document) => ({ uid: document.id, ...document.data() }));
}

export async function addShopMember(shop, input = {}) {
  const email = text(input.email).toLowerCase();
  const role = validRole(input.role);
  assert(email, "請輸入成員的帳號 Email");

  let account;
  try {
    account = await getAuth().getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      notFound("此 Email 尚未登入過本系統；請對方先登入一次，再新增為成員");
    }
    throw error;
  }
  assert(account.emailVerified, "此帳號尚未完成 Email 驗證，暫時不能加入店鋪");

  const memberRef = shop.shopRef.collection("members").doc(account.uid);
  const targetShopRef = userShopReference(account.uid, shop.shopId);
  const now = Timestamp.now();
  await db.runTransaction(async (transaction) => {
    const [shopSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(shop.shopRef),
      transaction.get(memberRef),
    ]);
    if (!shopSnapshot.exists) notFound("找不到店鋪");
    const shopData = shopSnapshot.data();
    transaction.set(memberRef, {
      uid: account.uid,
      email: account.email || email,
      name: account.displayName || "",
      role: memberSnapshot.exists && memberSnapshot.data().role === "owner" ? "owner" : role,
      joinedAt: memberSnapshot.exists ? memberSnapshot.data().joinedAt : now,
      updateTime: now,
    });
    transaction.set(targetShopRef, {
      shopId: shop.shopId,
      name: shopData.name,
      role: memberSnapshot.exists && memberSnapshot.data().role === "owner" ? "owner" : role,
      ownerUid: shopData.ownerUid,
      joinedAt: memberSnapshot.exists ? memberSnapshot.data().joinedAt : now,
      updateTime: now,
    });
    if (!memberSnapshot.exists) {
      transaction.update(shop.shopRef, { memberCount: (shopData.memberCount || 1) + 1, updateTime: now });
    }
  });

  return { success: true, uid: account.uid, email: account.email || email, role };
}

export async function updateShopMemberRole(shop, input = {}) {
  const uid = text(input.uid);
  const role = validRole(input.role);
  assert(uid, "缺少成員 UID");
  const memberRef = shop.shopRef.collection("members").doc(uid);
  await db.runTransaction(async (transaction) => {
    const member = await transaction.get(memberRef);
    if (!member.exists) notFound("找不到成員");
    assert(member.data().role !== "owner", "不可變更店鋪擁有者的角色");
    transaction.update(memberRef, { role, updateTime: Timestamp.now() });
    transaction.update(userShopReference(uid, shop.shopId), { role, updateTime: Timestamp.now() });
  });
  return { success: true, uid, role };
}

export async function removeShopMember(shop, uidValue) {
  const uid = text(uidValue);
  assert(uid, "缺少成員 UID");
  const memberRef = shop.shopRef.collection("members").doc(uid);
  await db.runTransaction(async (transaction) => {
    const [shopSnapshot, member] = await Promise.all([
      transaction.get(shop.shopRef),
      transaction.get(memberRef),
    ]);
    if (!member.exists) notFound("找不到成員");
    assert(member.data().role !== "owner", "不可移除店鋪擁有者");
    transaction.delete(memberRef);
    transaction.delete(userShopReference(uid, shop.shopId));
    transaction.update(shop.shopRef, {
      memberCount: Math.max(1, (shopSnapshot.data().memberCount || 2) - 1),
      updateTime: Timestamp.now(),
    });
  });
  return { success: true, uid };
}

export async function renameShop(shop, nameValue) {
  const name = text(nameValue);
  assert(name.length >= 2 && name.length <= 60, "店鋪名稱需為 2 至 60 個字元");
  const members = await shop.shopRef.collection("members").get();
  const batch = db.batch();
  const now = Timestamp.now();
  batch.update(shop.shopRef, { name, updateTime: now });
  members.docs.forEach((member) => {
    batch.update(userShopReference(member.id, shop.shopId), { name, updateTime: now });
  });
  await batch.commit();
  return { success: true, shopId: shop.shopId, name };
}
