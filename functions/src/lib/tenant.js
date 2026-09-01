import { db } from "../firebase.js";
import { assert } from "./errors.js";

export function tenantPath(shop, collectionName) {
  const shopId = String(shop?.shopId || "");
  assert(shopId && !shopId.includes("/"), "缺少有效的店鋪身分");
  assert(collectionName && !String(collectionName).includes("/"), "資料集合名稱不正確");
  return `shops/${shopId}/${collectionName}`;
}

export function tenantCollection(shop, collectionName) {
  return db.collection(tenantPath(shop, collectionName));
}
