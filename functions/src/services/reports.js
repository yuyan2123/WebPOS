import { domain } from "../lib/domain.js";
import { getProductsByIds } from "./catalog.js";
import { ordersInDateRange } from "./orders.js";
import { dateString, number } from "../lib/values.js";

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

export async function generateDailyReport(user, date) {
  const normalizedDate = dateString(date);
  const input = await reportInput(user, normalizedDate, normalizedDate, true);
  return domain("report", { date: normalizedDate, orders: input });
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
