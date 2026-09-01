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
  const orders = await ordersInDateRange(user, normalizedDate, normalizedDate);
  const products = await getProductsByIds(user, referencedGiftboxProductIds(orders));
  const productsById = productMap(products);
  const productStats = {};
  let totalItems = 0;

  for (const order of orders) {
    for (const item of order.items || []) {
      if (item.isGiftBox && item.giftBoxDetails?.products) {
        for (const [productId, quantityInBox] of Object.entries(item.giftBoxDetails.products)) {
          const quantity = number(quantityInBox) * number(item.quantity);
          const product = productsById[productId];
          const name = product?.productName || `商品ID: ${productId}`;
          const unitPrice = number(product?.price);
          totalItems += quantity;
          productStats[name] ||= {
            productName: name,
            quantity: 0,
            amount: 0,
            unitPrice,
            isFromGiftBox: true,
          };
          productStats[name].quantity += quantity;
          productStats[name].amount += quantity * unitPrice;
        }
      } else {
        const name = item.productName || "未知商品";
        const quantity = number(item.quantity);
        totalItems += quantity;
        productStats[name] ||= {
          productName: name,
          quantity: 0,
          amount: 0,
          unitPrice: number(item.unitPrice),
          isGiftBox: false,
        };
        productStats[name].quantity += quantity;
        productStats[name].amount += number(item.subtotal);
      }
    }
  }

  return {
    date: normalizedDate,
    totalRevenue: orders.reduce((sum, order) => sum + number(order.totalAmount), 0),
    totalOrders: orders.length,
    totalItems,
    productSales: Object.values(productStats).sort((a, b) => b.amount - a.amount),
  };
}

export async function getDemandStats(user, startDate, endDate) {
  const orders = await ordersInDateRange(user, startDate, endDate);
  const products = await getProductsByIds(user, referencedGiftboxProductIds(orders));
  const productsById = productMap(products);
  const productTotals = {};
  const giftboxTotals = {};

  for (const order of orders) {
    for (const item of order.items || []) {
      if (item.isGiftBox && item.giftBoxDetails) {
        const size = number(item.giftBoxDetails.size);
        const sizeKey = `${size}粒裝`;
        giftboxTotals[sizeKey] = (giftboxTotals[sizeKey] || 0) + number(item.quantity);
        for (const [productId, quantityInBox] of Object.entries(item.giftBoxDetails.products || {})) {
          const name = productsById[productId]?.productName || "未知商品";
          productTotals[name] ||= { loose: 0, inbox: 0 };
          productTotals[name].inbox += number(quantityInBox) * number(item.quantity);
        }
      } else {
        const name = item.productName || "未知商品";
        productTotals[name] ||= { loose: 0, inbox: 0 };
        productTotals[name].loose += number(item.quantity);
      }
    }
  }

  return {
    productStats: Object.entries(productTotals)
      .map(([name, counts]) => ({ name, ...counts, total: counts.loose + counts.inbox }))
      .sort((a, b) => b.total - a.total),
    giftboxStats: Object.entries(giftboxTotals)
      .map(([size, count]) => ({ size, count }))
      .sort((a, b) => parseInt(a.size) - parseInt(b.size)),
    orderCount: orders.length,
  };
}
