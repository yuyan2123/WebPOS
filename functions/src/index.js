import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { REGION } from "./config.js";
import { authorize } from "./lib/auth.js";
import { serialize } from "./lib/values.js";
import {
  deleteProduct as deleteProductService,
  getProducts as getProductsService,
  saveProduct as saveProductService,
  searchCustomers as searchCustomersService,
  updateProductSpecialPrice as updateProductSpecialPriceService,
} from "./services/catalog.js";
import {
  deleteOrder as deleteOrderService,
  getOrderDetails as getOrderDetailsService,
  searchOrderById as searchOrderByIdService,
  searchOrders as searchOrdersService,
  searchOverdueOrders as searchOverdueOrdersService,
  updateOrderDeposit as updateOrderDepositService,
  updateOrderStatus as updateOrderStatusService,
} from "./services/orders.js";
import {
  generateDailyReport as generateDailyReportService,
  getDemandStats as getDemandStatsService,
} from "./services/reports.js";
import {
  deleteDateOverrideCapacity as deleteDateOverrideCapacityService,
  getCapacitySettings as getCapacitySettingsService,
  getMonthCapacityStatus as getMonthCapacityStatusService,
  saveDateOverrideCapacity as saveDateOverrideCapacityService,
  saveDateOverrideCapacityBatch as saveDateOverrideCapacityBatchService,
  saveWeekdayCapacity as saveWeekdayCapacityService,
} from "./services/capacity.js";
import {
  addShopMember as addShopMemberService,
  createShop as createShopService,
  listMyShops as listMyShopsService,
  listShopMembers as listShopMembersService,
  removeShopMember as removeShopMemberService,
  renameShop as renameShopService,
  requireShopAccess,
  updateShopMemberRole as updateShopMemberRoleService,
} from "./services/shops.js";
import { recordDeviceSession } from "./services/security.js";
import { getShopBootstrap as getShopBootstrapService } from "./services/bootstrap.js";
import { submitOrder as submitOrderService } from "./services/submit.js";

setGlobalOptions({ region: REGION, maxInstances: 20, timeoutSeconds: 60 });
const securityHashSalt = defineSecret("SECURITY_HASH_SALT");

const methods = Object.freeze({
  listMyShops: listMyShopsService,
  createShop: createShopService,
  listShopMembers: listShopMembersService,
  addShopMember: addShopMemberService,
  updateShopMemberRole: updateShopMemberRoleService,
  removeShopMember: removeShopMemberService,
  renameShop: renameShopService,
  getProducts: getProductsService,
  saveProduct: saveProductService,
  deleteProduct: deleteProductService,
  updateProductSpecialPrice: updateProductSpecialPriceService,
  searchCustomers: searchCustomersService,
  searchOrders: searchOrdersService,
  searchOrderById: searchOrderByIdService,
  getOrderDetails: getOrderDetailsService,
  updateOrderStatus: updateOrderStatusService,
  updateOrderDeposit: updateOrderDepositService,
  searchOverdueOrders: searchOverdueOrdersService,
  deleteOrder: deleteOrderService,
  generateDailyReport: generateDailyReportService,
  getDemandStats: getDemandStatsService,
  getCapacitySettings: getCapacitySettingsService,
  saveWeekdayCapacity: saveWeekdayCapacityService,
  saveDateOverrideCapacity: saveDateOverrideCapacityService,
  saveDateOverrideCapacityBatch: saveDateOverrideCapacityBatchService,
  deleteDateOverrideCapacity: deleteDateOverrideCapacityService,
  getMonthCapacityStatus: getMonthCapacityStatusService,
  getShopBootstrap: getShopBootstrapService,
  submitOrder: submitOrderService,
});

const GLOBAL_METHODS = new Set(["listMyShops", "createShop"]);
const VIEWER_METHODS = new Set([
  "getProducts",
  "searchCustomers",
  "searchOrders",
  "searchOrderById",
  "getOrderDetails",
  "searchOverdueOrders",
  "generateDailyReport",
  "getDemandStats",
  "getCapacitySettings",
  "getMonthCapacityStatus",
  "getShopBootstrap",
]);
const OWNER_METHODS = new Set([
  "listShopMembers",
  "addShopMember",
  "updateShopMemberRole",
  "removeShopMember",
  "renameShop",
]);

export const posRpc = onCall(
  {
    cors: true,
    enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true",
    secrets: [securityHashSalt],
  },
  async (request) => {
    const started = Date.now();
    let outcome = "ok";
    try {
      return await executeRpc(request);
    } catch (error) {
      outcome = error.code || "internal";
      throw error;
    } finally {
      logger.info("pos_rpc", {
        method: Object.hasOwn(methods, request.data?.method) ? request.data.method : "session-or-unknown",
        outcome,
        durationMs: Date.now() - started,
      });
    }
  },
);

export async function executeRpc(request) {
  const user = authorize(request);
  if (
    !request.data ||
    typeof request.data.method !== "string" ||
    request.data.method.length > 64 ||
    !Array.isArray(request.data.args) ||
    request.data.args.length > 8
  ) {
    throw new HttpsError("invalid-argument", "請求格式不正確");
  }
  const method = String(request.data?.method || "");
  const args = Array.isArray(request.data?.args) ? request.data.args : [];
  if (method === "initializeSession") {
    const [shops, device] = await Promise.all([
      listMyShopsService(user),
      recordDeviceSession(user, request, securityHashSalt.value(), args[0]),
    ]);
    const options = args[1];
    if (!options) return serialize({ shops, device });
    const selectedShop = shops.find((shop) => shop.shopId === options.shopId) || shops[0] || null;
    const shop = selectedShop ? await requireShopAccess(user, selectedShop.shopId, "viewer") : null;
    const bootstrap = shop ? await getShopBootstrapService(shop, options.year, options.month) : null;
    return serialize({ shops, device, selectedShop: selectedShop ? { ...selectedShop, role: shop.role } : null, bootstrap });
  }
  if (method === "registerDeviceSession") {
    return serialize(await recordDeviceSession(user, request, securityHashSalt.value(), args[0]));
  }
  const handler = Object.hasOwn(methods, method) ? methods[method] : null;
  if (!handler) throw new HttpsError("not-found", `Unknown POS method: ${method}`);
  if (GLOBAL_METHODS.has(method)) {
    return serialize(await handler(user, ...args));
  }
  const requiredRole = OWNER_METHODS.has(method) ? "owner" : VIEWER_METHODS.has(method) ? "viewer" : "editor";
  const shop = await requireShopAccess(user, request.data?.shopId, requiredRole);
  return serialize(await handler(shop, ...args));
}
