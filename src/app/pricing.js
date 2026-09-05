import { state } from './state.js';
import { domain } from '../platform/domain.js';

// 生成唯一ID（前端版本）
export function generateUniqueId(prefix = '') {
  const timestamp = new Date().getTime().toString().slice(-6);
  const random = Math.random().toString(36).substr(2, 3);
  return prefix + timestamp + random;
}

// 取得有效價格（企業客戶時套用企業價）
export function getEffectivePrice(product) {
  return domain('price', {
    company: state.isCompanyCustomer,
    companyPrice: parseFloat(product.companyPrice) || 0,
    price: parseFloat(product.price) || 0,
  });
}
