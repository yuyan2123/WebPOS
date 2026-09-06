import { domain } from "../lib/domain.js";
import { getProductsByIds } from "./catalog.js";
import { ordersInDateRange } from "./orders.js";
import { dateString, number } from "../lib/values.js";
import { assert } from "../lib/errors.js";

function productMap(products) {
  return Object.fromEntries(products.map((product) => [product.productId, product]));
}

function referencedGiftboxProductIds(orders) {
  const ids = new Set();
  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      Object.keys(item.giftBoxDetails?.products || {}).forEach((id) => ids.add(id));
    });
  });
  return [...ids];
}

export async function generateDailyReport(user, startDate, endDate = startDate) {
  const start = dateString(startDate);
  const end = dateString(endDate);
  for (const date of [start, end]) {
    const parsed = new Date(date);
    assert(!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date, "報表日期無效");
  }
  assert(start <= end, "結束日期不可早於開始日期");
  const input = await reportInput(user, start, end, true);
  return domain("report", { date: start === end ? start : `${start} ~ ${end}`, orders: input });
}

export async function getDemandStats(user, startDate, endDate) {
  return domain("demand", { orders: await reportInput(user, startDate, endDate) });
}

async function reportInput(user, startDate, endDate, requireComposition = false) {
  const orders = await ordersInDateRange(user, startDate, endDate);
  const productsById = productMap(await getProductsByIds(user, referencedGiftboxProductIds(orders)));
  return normalizeReportOrders(orders, productsById, requireComposition);
}

export function normalizeReportOrders(orders, productsById, requireComposition = false) {
  return orders.map((order) => ({
    totalAmount: number(order.totalAmount),
    items: (order.items || []).map((item) => ({
      name: item.productName || "未知商品",
      quantity: number(item.quantity),
      unitPrice: number(item.unitPrice),
      subtotal: number(item.subtotal),
      giftBox: Boolean(
        item.isGiftBox && item.giftBoxDetails && (!requireComposition || item.giftBoxDetails.products),
      ),
      size: number(item.giftBoxDetails?.size),
      components: Object.entries(item.giftBoxDetails?.products || {}).map(([id, quantity]) => ({
        reportName: productsById[id]?.productName || "商品ID: " + id,
        demandName: productsById[id]?.productName || "未知商品",
        quantity: number(quantity),
        price: number(productsById[id]?.price),
      })),
    })),
  }));
}
