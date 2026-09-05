import { domain } from "./domain.js";
import { newId } from "./ids.js";
import { boolean, integer, number, text } from "./values.js";

// Host coercion preserves historical RPC inputs; Rust validates and computes the record.
export function normalizeItem(item = {}) {
  const giftBox = item.type === "giftbox" || boolean(item.isGiftBox);
  const details = item.giftBoxDetails || {};
  const size = integer(item.size ?? details.size);
  const price = number(item.price ?? item.unitPrice, -1);
  return domain("normalizeItem", {
    detailId: text(item.detailId) || newId("D"),
    productId: giftBox ? text(item.id || item.productId) || newId("GB") : text(item.productId),
    productName: giftBox ? text(item.name || item.productName, `${size}粒裝禮盒`) : text(item.productName),
    quantity: integer(item.quantity),
    unitPrice: price,
    giftBox,
    size,
    products: Object.entries(item.products || details.products || {}).map(([id, quantity]) => [
      id,
      integer(quantity),
    ]),
    notes: text(item.notes ?? details.notes),
    originalPrice: number(item.originalPrice, price),
    isSpecialPrice: boolean(item.isSpecialPrice),
  });
}
