export type ShopRole = "owner" | "editor" | "viewer";
export type OrderStatus = "已確認" | "已付訂金" | "已付清" | "已付款" | "完成" | "取消";
export interface UnitItem {
  quantity: number;
  giftBox: boolean;
  size: number;
  products: number[];
}
export interface CapacityInput {
  limit: number;
  hasLimit: boolean;
  source: "none" | "dateOverride" | "weeklyDefault";
  currentQuantity: number;
  newOrderQuantity: number;
}
export interface CapacityStatus extends CapacityInput {
  projectedQuantity: number;
  exceededQuantity: number;
  usageRate: number;
  status: "unlimited" | "available" | "warning" | "nearFull" | "full" | "exceeded";
}
export interface Payment {
  depositAmount: number;
  remainingAmount: number;
  newStatus: OrderStatus;
}
export interface DomainOperations {
  units: { input: UnitItem[]; output: number };
  price: { input: { price: number; companyPrice: number; company: boolean }; output: number };
  payment: { input: { total: number; paid: number }; output: Payment };
  capacity: { input: CapacityInput; output: CapacityStatus };
}

declare global {
  interface Window {
    posApi?: { call(method: string, args: unknown[]): Promise<unknown> };
  }
}
