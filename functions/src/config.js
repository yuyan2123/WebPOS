export const REGION = "asia-east1";

export const COLLECTIONS = Object.freeze({
  orders: "orders",
  products: "products",
  customers: "customers",
  weekdayCapacity: "weekdayCapacity",
  capacityOverrides: "capacityOverrides",
  capacityUsage: "capacityUsage",
});

export const ORDER_STATUSES = new Set([
  "已確認",
  "已付訂金",
  "已付清",
  "已付款",
  "完成",
  "取消",
]);
