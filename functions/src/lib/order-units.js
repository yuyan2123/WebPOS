import { boolean, integer } from "./values.js";

export function calculateOrderUnitCount(items = []) {
  return items.reduce((total, item) => {
    const quantity = integer(item.quantity);
    const isGiftBox = item.type === "giftbox" || boolean(item.isGiftBox);
    if (!isGiftBox) return total + quantity;
    const details = item.giftBoxDetails || item;
    const products = details.products || {};
    const unitsPerBox = Object.values(products).reduce((sum, qty) => sum + integer(qty), 0);
    return total + (unitsPerBox || integer(details.size, 1)) * quantity;
  }, 0);
}
