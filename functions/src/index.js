import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { defineSecret } from "firebase-functions/params";
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

export const posRpc = onCall({
  cors: true,
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true",
  secrets: [securityHashSalt],
}, async (request) => {
  const user = authorize(request);
  const method = String(request.data?.method || "");
  const args = Array.isArray(request.data?.args) ? request.data.args : [];
  if (method === "initializeSession") {
    const [shops, device] = await Promise.all([
      listMyShopsService(user),
      recordDeviceSession(user, request, securityHashSalt.value(), args[0]),
    ]);
    return serialize({ shops, device });
  }
  if (method === "registerDeviceSession") {
    return serialize(await recordDeviceSession(user, request, securityHashSalt.value(), args[0]));
  }
  const handler = methods[method];
  if (!handler) throw new HttpsError("not-found", `Unknown POS method: ${method}`);
  if (GLOBAL_METHODS.has(method)) {
    return serialize(await handler(user, ...args));
  }
  const requiredRole = OWNER_METHODS.has(method) ? "owner" : VIEWER_METHODS.has(method) ? "viewer" : "editor";
  const shop = await requireShopAccess(user, request.data?.shopId, requiredRole);
  return serialize(await handler(shop, ...args));
});
