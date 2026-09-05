import { boolean, integer } from "./values.js";
import { domain } from "./domain.js";

export function calculateOrderUnitCount(items = []) {
  return domain(
    "units",
    items.map((item) => {
      const details = item.giftBoxDetails || item;
      return {
        quantity: integer(item.quantity),
        giftBox: item.type === "giftbox" || boolean(item.isGiftBox),
        size: integer(details.size, 1),
        products: Object.values(details.products || {}).map((quantity) => integer(quantity)),
      };
    }),
  );
}
