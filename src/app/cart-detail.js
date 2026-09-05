import { escapeHandlerArgument } from '../platform/markup.js';
import { escapeHtml } from './customers.js';
import { state } from './state.js';
import { generateGiftboxDetailsHtml, updateCartDisplay } from './cart.js';

export function updateCartModalDisplay() {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const cartBody = document.getElementById('cartModalBody');
  if (allItems.length === 0) {
    cartBody.innerHTML = '<p style="text-align: center;">購物車是空的</p>';
    return;
  }
  cartBody.innerHTML = allItems
    .map((item, index) => {
      if (item.type === 'giftbox') {
        // 處理禮盒特價顯示
        let priceHtml;
        if (item.isSpecialPrice && item.originalPrice) {
          priceHtml = `<span class="original">NT$ ${item.originalPrice}</span>NT$ ${item.price}`;
        } else {
          priceHtml = `NT$ ${item.price}`;
        }
        // 生成禮盒細項
        const giftboxDetails = generateGiftboxDetailsHtml(item);
        return `
                        <div class="cart-item-card">
                            <div class="cart-item-header">
                                <div class="cart-item-icon giftbox">
                                    <i class="fas fa-box-open"></i>
                                </div>
                                <div class="cart-item-details">
                                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                                    <div class="cart-item-price">${priceHtml}</div>
                                </div>
                            </div>
                            <div class="cart-item-controls">
                                <div class="cart-qty-group">
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, -1)">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <div class="cart-qty-value">${item.quantity}</div>
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, 1)">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                                <button class="cart-edit-btn" onclick="event.stopPropagation(); editGiftboxItem(${escapeHandlerArgument(index)})" title="編輯禮盒內容">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="cart-delete-btn" onclick="event.stopPropagation(); removeFromCartModal(${escapeHandlerArgument(index)})">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            ${giftboxDetails ? `<div class="cart-giftbox-details">${giftboxDetails.replace(/<[^>]*>/g, '')}</div>` : ''}
                            ${item.notes ? `<div class="cart-giftbox-notes">${escapeHtml(item.notes)}</div>` : ''}
                        </div>`;
      } else {
        // 判斷類別圖示
        const iconClass = item.category === '伴手禮' ? 'gift' : 'cake';
        const iconName = item.category === '伴手禮' ? 'fa-cookie-bite' : 'fa-birthday-cake';
        // 構建價格顯示
        let priceHtml = `NT$ ${item.price}`;
        if (item.isSpecialPrice && item.originalPrice !== item.price) {
          priceHtml = `<span class="original">NT$ ${item.originalPrice}</span>NT$ ${item.price}`;
        } else if (item.isCompanyPrice) {
          priceHtml = `NT$ ${item.price}<span class="company-price-tag">企業價</span>`;
        }
        return `
                        <div class="cart-item-card">
                            <div class="cart-item-header">
                                <div class="cart-item-icon ${iconClass}">
                                    <i class="fas ${iconName}"></i>
                                </div>
                                <div class="cart-item-details">
                                    <div class="cart-item-name">${escapeHtml(item.productName)}</div>
                                    <div class="cart-item-price">${priceHtml}</div>
                                </div>
                            </div>
                            <div class="cart-item-controls">
                                <div class="cart-qty-group">
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, -1)">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <div class="cart-qty-value">${item.quantity}</div>
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, 1)">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                                <button class="cart-delete-btn" onclick="event.stopPropagation(); removeFromCartModal(${escapeHandlerArgument(index)})">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>`;
      }
    })
    .join('');
}

export function updateCartItemQuantity(index, change) {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const item = allItems[index];
  if (!item) return;
  if (item.type === 'giftbox') {
    const originalItem = state.giftboxCart.find((i) => i.id === item.id);
    if (originalItem) {
      originalItem.quantity += change;
      if (originalItem.quantity < 1) removeFromCartModal(index);
      else updateCartDisplay();
    }
  } else {
    const cart = item.category === '伴手禮' ? state.giftCart : state.cakeCart;
    const originalItem = cart.find((i) => i.productId === item.productId);
    if (originalItem) {
      originalItem.quantity += change;
      if (originalItem.quantity < 1) removeFromCartModal(index);
      else updateCartDisplay();
    }
  }
}

export function removeFromCartModal(index) {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const item = allItems[index];
  if (!item) return;
  if (item.type === 'giftbox') state.giftboxCart = state.giftboxCart.filter((i) => i.id !== item.id);
  else if (item.category === '伴手禮')
    state.giftCart = state.giftCart.filter((i) => i.productId !== item.productId);
  else state.cakeCart = state.cakeCart.filter((i) => i.productId !== item.productId);
  updateCartDisplay();
}
