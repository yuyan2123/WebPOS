import { escapeHandlerArgument } from '../platform/markup.js';
import { escapeHtml, escapeAttr } from './customers.js';
import { state } from './state.js';
import { generateGiftboxDetailsHtml, updateCartDisplay } from './cart.js';
import {
  initializeCartSwipe,
  animateCartRemoval,
  cartMotionLayer,
  clearCartRemovalMotion,
} from '../ui/cart-swipe.js';

let renderedBody = null;
let renderedMarkup = null;
let renderedFirstChild = null;
let swipeController = null;
const itemKeys = new WeakMap();
let nextItemKey = 0;
function itemKey(item) {
  if (!itemKeys.has(item)) itemKeys.set(item, `cart-item-${++nextItemKey}`);
  return itemKeys.get(item);
}

export function closeCartItemActions() {
  return swipeController?.closeOpen() || false;
}
export function resetCartItemActions() {
  swipeController?.reset();
  clearCartRemovalMotion(document.getElementById('cartModalBody'));
}

function renderCartBody(body, markup, items = []) {
  if (body === renderedBody && markup === renderedMarkup && body.firstChild === renderedFirstChild) return;
  const focusedButton = document.activeElement;
  const focusedRow = body.contains(focusedButton) ? focusedButton.closest('[data-cart-item-key]') : null;
  const focusKey = focusedRow?.dataset.cartItemKey;
  const focusControl =
    focusedButton?.dataset.cartControl === 'delete' ? 'options' : focusedButton?.dataset.cartControl;
  const focusIndex = focusedRow ? [...body.querySelectorAll('[data-cart-item-key]')].indexOf(focusedRow) : -1;
  swipeController?.destroy();
  const layer = cartMotionLayer(body);
  body.innerHTML = markup;
  if (layer) body.append(layer);
  const byKey = new Map(items.map((item) => [itemKey(item), item]));
  swipeController = initializeCartSwipe(body, (row) => {
    const item = byKey.get(row.dataset.cartItemKey);
    const index = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart].indexOf(item);
    if (index >= 0) removeFromCartModal(index);
  });
  renderedBody = body;
  renderedMarkup = markup;
  renderedFirstChild = body.firstChild;
  if (focusIndex >= 0 && document.getElementById('cartModal').classList.contains('active')) {
    const rows = [...body.querySelectorAll('[data-cart-item-key]')];
    const retained = rows.find((row) => row.dataset.cartItemKey === focusKey);
    const target =
      retained?.querySelector(`[data-cart-control="${focusControl}"]`) ||
      (rows[focusIndex] || rows.at(-1))?.querySelector('.cart-delete-btn') ||
      document.querySelector('#cartModal .cart-close');
    target?.focus({
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
      const key = itemKey(item);
      return `<div class="cart-swipe-row" data-cart-item-key="${key}" data-cart-item-name="${accessibleName}" role="group" aria-label="${accessibleName}">
        <div class="cart-swipe-actions" id="${key}-delete" hidden inert>
          <button type="button" class="cart-swipe-delete" data-cart-control="delete" aria-label="刪除 ${accessibleName}"><i class="fas fa-trash-alt" aria-hidden="true"></i><span>刪除</span></button>
        </div>
        <div class="cart-item-card gj-pos-card">
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
            <button type="button" class="cart-qty-btn" data-cart-control="decrease" aria-label="減少 ${accessibleName} 數量" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, -1)"><i class="fas fa-minus" aria-hidden="true"></i></button>
            <span class="cart-qty-value">${escapeHtml(item.quantity)}</span>
            <button type="button" class="cart-qty-btn" data-cart-control="increase" aria-label="增加 ${accessibleName} 數量" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, 1)"><i class="fas fa-plus" aria-hidden="true"></i></button>
          </div>
          <div class="cart-item-actions">
            ${isGiftbox ? `<button type="button" class="cart-edit-btn" data-cart-control="edit" onclick="event.stopPropagation(); editGiftboxItem(${escapeHandlerArgument(index)})"><i class="fas fa-edit" aria-hidden="true"></i> 編輯內容</button>` : ''}
            <button type="button" class="cart-delete-btn" data-cart-control="options" aria-label="顯示 ${accessibleName} 的刪除選項" aria-expanded="false" aria-controls="${key}-delete" title="顯示刪除選項"><i class="fas fa-ellipsis-h" aria-hidden="true"></i> 更多</button>
          </div>
        </div>
        </div>
      </div>`;
    })
    .join('');
  renderCartBody(cartBody, markup, allItems);
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
  const remove = () => {
    if (item.type === 'giftbox') state.giftboxCart = state.giftboxCart.filter((i) => i.id !== item.id);
    else if (state.giftCart.includes(item)) state.giftCart = state.giftCart.filter((i) => i !== item);
    else state.cakeCart = state.cakeCart.filter((i) => i !== item);
    updateCartDisplay();
  };
  const body = document.getElementById('cartModalBody');
  const row = body.querySelector(`[data-cart-item-key="${itemKey(item)}"]`);
  if (row && document.getElementById('cartModal').classList.contains('active'))
    animateCartRemoval(body, row, remove);
  else remove();
}
