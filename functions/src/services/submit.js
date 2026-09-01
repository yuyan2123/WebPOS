import { boolean, text } from "../lib/values.js";
import { checkCapacityBeforeOrder } from "./capacity.js";
import { createOrder, updateOrder } from "./orders.js";

export async function submitOrder(shop, orderData = {}, options = {}) {
  const orderId = text(options.orderId || orderData.orderId);
  const confirmed = boolean(options.confirmed || orderData.capacityOverrideConfirmed);
  const capacity = await checkCapacityBeforeOrder(
    shop,
    orderData.deliveryDate,
    orderData.items,
    orderId || null,
    confirmed,
  );
  if (!capacity.allowed) return capacity;
  const result = orderId
    ? await updateOrder(shop, { ...orderData, orderId })
    : await createOrder(shop, orderData);
  return { ...result, capacityStatus: capacity.capacityStatus };
}
