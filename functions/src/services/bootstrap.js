import { assert } from "../lib/errors.js";
import { integer } from "../lib/values.js";
import { getProducts } from "./catalog.js";
import { buildMonthCapacityStatus, getCapacityRangeData, getCapacitySettings } from "./capacity.js";

export async function getShopBootstrap(shop, yearValue, monthValue) {
  const year = integer(yearValue);
  const month = integer(monthValue);
  assert(year >= 2000 && month >= 1 && month <= 12, "月份格式不正確");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${prefix}-01`;
  const endDate = `${prefix}-${String(daysInMonth).padStart(2, "0")}`;

  const [products, capacitySettings] = await Promise.all([
    getProducts(shop),
    getCapacitySettings(shop, startDate, endDate),
  ]);
  const capacityUsage = await getCapacityRangeData(shop, startDate, endDate, capacitySettings);

  return {
    products,
    capacityMonth: {
      key: `${year}-${month}`,
      data: buildMonthCapacityStatus(capacitySettings, capacityUsage, year, month),
    },
  };
}
