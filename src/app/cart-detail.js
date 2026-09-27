import { escapeHandlerArgument } from '../platform/markup.js';
import { escapeHtml, escapeAttr } from './customers.js';
import { state } from './state.js';
import { generateGiftboxDetailsHtml, updateCartDisplay } from './cart.js';

let renderedBody = null;
let renderedMarkup = null;
let renderedFirstChild = null;

function renderCartBody(body, markup) {
  if (body === renderedBody && markup === renderedMarkup && body.firstChild === renderedFirstChild) return;
  const focusedButton = document.activeElement;
  const focusIndex = body.contains(focusedButton)
    ? [...body.querySelectorAll('button')].indexOf(focusedButton)
    : -1;
  body.innerHTML = markup;
  renderedBody = body;
  renderedMarkup = markup;
  renderedFirstChild = body.firstChild;
  if (focusIndex >= 0 && document.getElementById('cartModal').classList.contains('active')) {
    const buttons = [...body.querySelectorAll('button')];
    (buttons[focusIndex] || buttons.at(-1) || document.getElementById('checkoutBtn')).focus({
      preventScroll: true,
    });
  }
}

export function updateCartModalDisplay() {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const cartBody = document.getElementById('cartModalBody');
  if (allItems.length === 0) {
    renderCartBody(cartBody, '<p style="text-align: center;">購物車是空的</p>');
    return;
  }
  const markup = allItems
    .map((item, index) => {
      const isGiftbox = item.type === 'giftbox';
      const name = escapeHtml(isGiftbox ? item.name : item.productName);
      const accessibleName = escapeAttr(isGiftbox ? item.name : item.productName);
      const money = (value) => `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`;
      const special = item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.price;
      const giftboxDetails = isGiftbox ? generateGiftboxDetailsHtml(item) : '';
      return `<div class="cart-item-card gj-pos-card">
        <div class="cart-item-header">
          <div class="cart-item-details">
            <h3 class="cart-item-name">${name}</h3>
            <div class="cart-item-price">${special ? '<span class="cart-price-label">特價</span>' : ''}${money(item.price)}<span class="cart-price-label">／${isGiftbox ? '盒' : '件'}</span>${item.isCompanyPrice && !special ? '<span class="company-price-tag">企業價</span>' : ''}</div>
            ${special ? `<span class="cart-original-price">原價 ${money(item.originalPrice)}</span>` : ''}
          </div>
          <div class="cart-item-subtotal"><span>小計</span><strong>${money(item.price * item.quantity)}</strong></div>
        </div>
        ${giftboxDetails}
        ${item.notes ? `<div class="cart-giftbox-notes"><span>備註</span> ${escapeHtml(item.notes)}</div>` : ''}
        <div class="cart-item-controls">
          <div class="cart-qty-group" role="group" aria-label="${accessibleName} 數量">
            <button type="button" class="cart-qty-btn" aria-label="減少 ${accessibleName} 數量" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, -1)"><i class="fas fa-minus" aria-hidden="true"></i></button>
            <span class="cart-qty-value">${escapeHtml(item.quantity)}</span>
            <button type="button" class="cart-qty-btn" aria-label="增加 ${accessibleName} 數量" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, 1)"><i class="fas fa-plus" aria-hidden="true"></i></button>
          </div>
          <div class="cart-item-actions">
            ${isGiftbox ? `<button type="button" class="cart-edit-btn" onclick="event.stopPropagation(); editGiftboxItem(${escapeHandlerArgument(index)})"><i class="fas fa-edit" aria-hidden="true"></i> 編輯內容</button>` : ''}
            <button type="button" class="cart-delete-btn" aria-label="移除 ${accessibleName}" onclick="event.stopPropagation(); removeFromCartModal(${escapeHandlerArgument(index)})"><i class="fas fa-trash-alt" aria-hidden="true"></i> 移除</button>
          </div>
        </div>
      </div>`;
    })
    .join('');
  renderCartBody(cartBody, markup);
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
    const cart = state.giftCart.includes(item) ? state.giftCart : state.cakeCart;
    const originalItem = cart.find((i) => i === item);
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
  else if (state.giftCart.includes(item)) state.giftCart = state.giftCart.filter((i) => i !== item);
  else state.cakeCart = state.cakeCart.filter((i) => i !== item);
  updateCartDisplay();
}
