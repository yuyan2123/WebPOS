import { escapeHandlerArgument } from '../platform/markup.js';
import { escapeHtml, escapeAttr } from './customers.js';
import { state } from './state.js';
import { setButtonLoading, showAlert } from './feedback.js';
import { getEffectivePrice, generateUniqueId } from './pricing.js';
import { updateCartDisplay, closeCartModal } from './cart.js';
import { showSectionById } from './platform.js';

// === 禮盒功能函數 ===
function renderGiftboxProductCard(product, selectedQuantity = 0) {
  const quantity = Math.max(0, parseInt(selectedQuantity, 10) || 0);
  const productId = escapeAttr(product.productId);
  const handlerId = escapeHandlerArgument(product.productId);
  const productName = escapeHtml(product.productName);
  const accessibleName = escapeAttr(product.productName);
  const price = (value) => `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`;
  const effectivePrice = getEffectivePrice(product);
  const companyPriceActive =
    state.isCompanyCustomer &&
    Number(product.companyPrice) > 0 &&
    Number(product.companyPrice) !== Number(product.price);
  return `<div class="giftbox-product-card gj-pos-card ${quantity > 0 ? 'has-quantity' : ''}" id="card_${productId}">
    <div class="giftbox-product-meta">
      <span class="giftbox-product-category">${escapeHtml(product.category || '禮盒商品')}</span>
      <span class="giftbox-product-selection"><i class="fas fa-check" aria-hidden="true"></i> 已選 <span class="giftbox-selected-quantity">${quantity}</span> 粒</span>
    </div>
    <div class="giftbox-product-info">
      <h3>${productName}</h3>
      <div class="giftbox-product-pricing"><span class="price">${price(effectivePrice)}</span><span class="giftbox-price-unit">／粒</span>${companyPriceActive ? '<span class="company-price-tag">企業價</span>' : ''}</div>
      ${companyPriceActive ? `<span class="company-original-price">原價 ${price(product.price)}</span>` : ''}
    </div>
    <div class="giftbox-product-quantity">
      <label for="display_${productId}">數量（粒）</label>
      <div class="giftbox-quantity-control">
        <button type="button" class="giftbox-qty-btn" aria-label="減少 ${accessibleName} 數量" ${quantity === 0 ? 'disabled' : ''} onclick="adjustGiftboxQty('${handlerId}', -1)"><i class="fas fa-minus" aria-hidden="true"></i></button>
        <input type="number" inputmode="numeric" min="0" step="1" class="giftbox-qty-display ${quantity > 0 ? 'has-value' : ''} gj-input" id="display_${productId}" aria-label="${accessibleName} 數量（粒）" value="${quantity}" onfocus="this.select()" onchange="setGiftboxQty('${handlerId}', this.value)">
        <button type="button" class="giftbox-qty-btn" aria-label="增加 ${accessibleName} 數量" onclick="adjustGiftboxQty('${handlerId}', 1)"><i class="fas fa-plus" aria-hidden="true"></i></button>
      </div>
    </div>
    <input type="hidden" class="giftbox-product-input" id="qty_${productId}" value="${quantity}">
  </div>`;
}

function updateGiftboxCard(productId, quantity) {
  const card = document.getElementById('card_' + productId);
  document.getElementById('display_' + productId).classList.toggle('has-value', quantity > 0);
  card.classList.toggle('has-quantity', quantity > 0);
  card.querySelector('.giftbox-selected-quantity').textContent = quantity;
  card.querySelector('.giftbox-qty-btn').disabled = quantity === 0;
}

function renderGiftboxFilterTabs(products) {
  const tabs = document.getElementById('giftboxFilterTabs');
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
  let selected = categories.includes(tabs.dataset.category) ? tabs.dataset.category : '';
  function applyFilter() {
    tabs.dataset.category = selected;
    for (const button of tabs.children) {
      const active = button.dataset.category === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    // Keep every quantity input mounted so filtering never loses selections or
    // excludes hidden categories from the progress and final combination.
    for (const product of products) {
      const card = document.getElementById('card_' + product.productId);
      if (card) card.style.display = !selected || product.category === selected ? '' : 'none';
    }
  }
  tabs.replaceChildren(
    ...['', ...categories].map((category) => {
      const button = document.createElement('button');
      const count = category
        ? products.filter((product) => product.category === category).length
        : products.length;
      button.type = 'button';
      button.dataset.category = category;
      button.textContent = `${category || '全部類別'} (${count})`;
      button.onclick = () => {
        selected = category;
        applyFilter();
      };
      return button;
    }),
  );
  applyFilter();
}

export function selectGiftboxSize(size, btnElement) {
  const sizeBtn = btnElement || window.event?.currentTarget || window.event?.target?.closest('button');
  // 防止重複點擊
  if (sizeBtn.classList.contains('loading')) return;
  setButtonLoading(sizeBtn, true, '準備中...');
  state.currentGiftboxSize = size;
  state.giftboxSelection = {};
  // 更新按鈕狀態
  document.querySelectorAll('.giftbox-size-btn').forEach((btn) => {
    btn.classList.remove('selected');
    setButtonLoading(btn, false);
  });
  sizeBtn.classList.add('selected');
  document.getElementById('giftboxStep1').classList.remove('active');
  document.getElementById('giftboxStep2').classList.add('active');
  document.getElementById('giftboxStep2Title').textContent = `步驟2: 選擇商品組合 (${size}粒裝)`;
  document.getElementById('targetCount').textContent = size;
  loadGiftboxProducts();
  setButtonLoading(sizeBtn, false);
}

export function loadGiftboxProducts() {
  const giftboxProducts = state.allProducts.filter((p) => p.status === '啟用' && p.giftBoxEnabled === '是');
  const container = document.getElementById('giftboxProducts');
  if (giftboxProducts.length === 0) {
    renderGiftboxFilterTabs(giftboxProducts);
    container.innerHTML =
      '<p style="text-align: center; padding: 20px; color: var(--gj-muted);">目前沒有可用於禮盒的商品</p>';
    return;
  }
  container.innerHTML = `<div class="giftbox-product-grid">${giftboxProducts
    .map((product) => renderGiftboxProductCard(product))
    .join('')}</div>`;
  updateGiftboxProgress();
  renderGiftboxFilterTabs(giftboxProducts);
}

export function adjustGiftboxQty(productId, change) {
  const input = document.getElementById('qty_' + productId);
  const display = document.getElementById('display_' + productId);
  let currentVal = parseInt(input.value) || 0;
  // 計算目前已選總數
  const currentTotal = Object.values(state.giftboxSelection).reduce((sum, qty) => sum + qty, 0);
  // 如果是增加數量，檢查是否會超過限制
  if (change > 0 && currentTotal >= state.currentGiftboxSize) {
    // 已達上限，顯示提示並禁止增加
    showAlert(`已達${state.currentGiftboxSize}入上限`, 'warning');
    return;
  }
  let newVal = Math.max(0, currentVal + change);
  input.value = newVal;
  display.value = newVal;
  // 更新視覺狀態
  updateGiftboxCard(productId, newVal);
  updateGiftboxSelection(productId, newVal);
}

// 直接輸入數量（onchange 觸發，超過上限時自動裁切為剩餘可選數）
export function setGiftboxQty(productId, rawValue) {
  const input = document.getElementById('qty_' + productId);
  const display = document.getElementById('display_' + productId);
  let newVal = Math.max(0, parseInt(rawValue, 10) || 0);
  // 其他商品已選的總數
  const otherTotal = Object.entries(state.giftboxSelection)
    .filter(([id]) => id !== productId)
    .reduce((sum, [, qty]) => sum + qty, 0);
  if (otherTotal + newVal > state.currentGiftboxSize) {
    newVal = Math.max(0, state.currentGiftboxSize - otherTotal);
    showAlert(`已達${state.currentGiftboxSize}入上限，已自動調整為 ${newVal}`, 'warning');
  }
  input.value = newVal;
  display.value = newVal;
  updateGiftboxCard(productId, newVal);
  updateGiftboxSelection(productId, newVal);
}

export function updateGiftboxSelection(productId, quantity) {
  const qty = parseInt(quantity) || 0;
  if (qty > 0) {
    state.giftboxSelection[productId] = qty;
  } else {
    delete state.giftboxSelection[productId];
  }
  updateGiftboxProgress();
}

export function updateGiftboxProgress() {
  const totalSelected = Object.values(state.giftboxSelection).reduce((sum, qty) => sum + qty, 0);
  document.getElementById('selectedCount').textContent = totalSelected;
  // 移除按鈕鎖定，改為顏色提示
  if (totalSelected > state.currentGiftboxSize) {
    document.querySelector('.giftbox-progress').style.color = 'var(--gj-danger)';
    document.querySelector('.giftbox-progress').style.borderLeftColor = 'var(--gj-danger)';
  } else if (totalSelected === state.currentGiftboxSize) {
    document.querySelector('.giftbox-progress').style.color = 'var(--gj-success)';
    document.querySelector('.giftbox-progress').style.borderLeftColor = 'var(--gj-success)';
  } else {
    document.querySelector('.giftbox-progress').style.color = 'var(--gj-primary)';
    document.querySelector('.giftbox-progress').style.borderLeftColor = 'var(--gj-primary)';
  }
}

export function proceedToStep3() {
  const totalSelected = Object.values(state.giftboxSelection).reduce((sum, qty) => sum + qty, 0);
  // 檢查數量是否符合要求
  if (totalSelected === 0) {
    showAlert('請選擇至少一個商品', 'error');
    return;
  }
  if (totalSelected < state.currentGiftboxSize) {
    showAlert(`還需要選擇 ${state.currentGiftboxSize - totalSelected} 個商品`, 'error');
    return;
  }
  if (totalSelected > state.currentGiftboxSize) {
    showAlert(`商品數量超過限制，請減少 ${totalSelected - state.currentGiftboxSize} 個商品`, 'error');
    return;
  }
  // 數量正確，繼續下一步
  const proceedBtn = document.getElementById('proceedStep3');
  setButtonLoading(proceedBtn, true, '計算中...');
  document.getElementById('giftboxStep2').classList.remove('active');
  document.getElementById('giftboxStep3').classList.add('active');
  updateGiftboxSummary();
  setButtonLoading(proceedBtn, false);
  // 編輯模式時更新按鈕文字
  const addBtn = document.querySelector('.btn-add-cart');
  if (addBtn) {
    if (state.editingGiftboxIndex >= 0) {
      addBtn.innerHTML = '<i class="fas fa-save"></i> 更新禮盒';
    } else {
      addBtn.innerHTML = '<i class="fas fa-cart-plus"></i> 加入購物車';
    }
  }
}

export function updateGiftboxSummary() {
  const summaryContainer = document.getElementById('giftboxSummary');
  const sizeLabel = document.getElementById('giftboxSizeLabel');
  let summaryHtml = '';
  let totalPrice = 0;
  // 更新標題中的規格標籤
  if (sizeLabel) {
    sizeLabel.textContent = `${state.currentGiftboxSize}粒裝禮盒`;
  }
  for (const [productId, quantity] of Object.entries(state.giftboxSelection)) {
    const product = state.allProducts.find((p) => p.productId === productId);
    if (product) {
      const subtotal = getEffectivePrice(product) * quantity;
      totalPrice += subtotal;
      summaryHtml += `
                        <div class="giftbox-summary-product">
                            <div class="product-info">
                                <div>
                                    <div class="product-name">${escapeHtml(product.productName)}</div>
                                    <div class="product-qty">${quantity} 粒 · 單價 NT$ ${getEffectivePrice(product).toLocaleString('zh-TW')}</div>
                                </div>
                            </div>
                            <div class="product-price"><span>小計</span>NT$ ${subtotal.toLocaleString('zh-TW')}</div>
                        </div>
                    `;
    }
  }
  summaryHtml += `
                <div class="giftbox-summary-total">
                    <span class="total-label">單組禮盒總價</span>
                    <span class="total-price">NT$ ${totalPrice.toLocaleString('zh-TW')}</span>
                </div>
            `;
  summaryContainer.innerHTML = summaryHtml;
  // 保存當前組合資訊
  state.currentGiftboxCombo = {
    size: state.currentGiftboxSize,
    products: { ...state.giftboxSelection },
    unitPrice: totalPrice,
  };
  updateGiftboxPrice();
}

export function updateGiftboxPrice() {
  if (!state.currentGiftboxCombo) return;
  const quantity = Math.max(1, parseInt(document.getElementById('giftboxQuantity').value) || 1);
  const special = parseFloat(document.getElementById('giftboxSpecialPriceInput').value) || 0;
  const original = state.currentGiftboxCombo.unitPrice;
  document.getElementById('giftboxPriceComparison').style.display = special > 0 ? '' : 'none';
  document.getElementById('giftboxOriginalTotalText').textContent = (original * quantity).toLocaleString();
  document.getElementById('giftboxSpecialTotalText').textContent = (special * quantity).toLocaleString();
  document.getElementById('giftboxTotalAmount').textContent =
    `禮盒合計 NT$ ${((special > 0 ? special : original) * quantity).toLocaleString()}`;
}

export function addGiftboxToCart() {
  const addBtn =
    window.event?.currentTarget || window.event?.target?.closest('button') || window.event?.target;
  const quantity = parseInt(document.getElementById('giftboxQuantity').value) || 1;
  const notes = document.getElementById('giftboxNotes').value.trim();
  const isEditing = state.editingGiftboxIndex >= 0;
  if (!state.currentGiftboxCombo) {
    showAlert('禮盒組合資訊錯誤', 'error');
    return;
  }
  // 檢查是否有設定特價
  const specialPriceInput = document.getElementById('giftboxSpecialPriceInput');
  const specialPrice = parseFloat(specialPriceInput.value) || 0;
  let finalPrice = state.currentGiftboxCombo.unitPrice;
  let isSpecialPrice = false;
  if (specialPrice > 0) {
    finalPrice = specialPrice;
    isSpecialPrice = true;
  }
  const loadingText = isEditing ? '更新中...' : '加入中...';
  setButtonLoading(addBtn, true, loadingText);
  if (isEditing) {
    // 編輯模式：更新現有禮盒
    const existingItem = state.giftboxCart[state.editingGiftboxIndex];
    state.giftboxCart[state.editingGiftboxIndex] = {
      ...existingItem,
      name: `${state.currentGiftboxCombo.size}粒裝禮盒`,
      size: state.currentGiftboxCombo.size,
      products: state.currentGiftboxCombo.products,
      price: finalPrice,
      originalPrice: state.currentGiftboxCombo.unitPrice,
      isSpecialPrice: isSpecialPrice,
      quantity: quantity,
      notes: notes,
    };
    showAlert('禮盒已更新', 'success');
  } else {
    // 新增模式：添加新禮盒
    const giftboxItem = {
      type: 'giftbox',
      id: generateUniqueId('GB'),
      name: `${state.currentGiftboxCombo.size}粒裝禮盒`,
      size: state.currentGiftboxCombo.size,
      products: state.currentGiftboxCombo.products,
      price: finalPrice,
      originalPrice: state.currentGiftboxCombo.unitPrice,
      isSpecialPrice: isSpecialPrice,
      quantity: quantity,
      notes: notes,
    };
    state.giftboxCart.push(giftboxItem);
    showAlert(`已將 ${quantity} 組禮盒加入購物車`, 'success');
  }
  updateCartDisplay();
  setButtonLoading(addBtn, false);
  // 重置禮盒狀態
  resetGiftboxState();
}

export function resetGiftboxState() {
  state.currentGiftboxSize = 0;
  state.giftboxSelection = {};
  state.currentGiftboxCombo = null;
  state.editingGiftboxIndex = -1; // 重置編輯模式
  // 重置到步驟1
  document.querySelectorAll('.giftbox-step').forEach((step) => step.classList.remove('active'));
  document.getElementById('giftboxStep1').classList.add('active');
  // 重置按鈕狀態
  document.querySelectorAll('.giftbox-size-btn').forEach((btn) => btn.classList.remove('selected'));
  // 重置表單
  document.getElementById('giftboxQuantity').value = 1;
  document.getElementById('giftboxNotes').value = '';
  // 重置特價相關欄位
  document.getElementById('giftboxSpecialPriceInput').value = '';
  document.getElementById('giftboxPriceComparison').style.display = 'none';
  // 重置加入購物車按鈕文字
  const addBtn = document.querySelector('.btn-add-cart');
  if (addBtn) {
    addBtn.innerHTML = '<i class="fas fa-cart-plus"></i> 加入購物車';
  }
}

export function editGiftboxItem(cartIndex) {
  // 找到 giftboxCart 中的對應項目
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const item = allItems[cartIndex];
  if (!item || item.type !== 'giftbox') {
    showAlert('找不到禮盒項目', 'error');
    return;
  }
  // 找到在 giftboxCart 中的實際索引
  const giftboxIndex = state.giftboxCart.findIndex((g) => g.id === item.id);
  if (giftboxIndex === -1) {
    showAlert('找不到禮盒項目', 'error');
    return;
  }
  // 設置編輯模式
  state.editingGiftboxIndex = giftboxIndex;
  // 關閉購物車 modal
  closeCartModal();
  // 導航到禮盒頁面
  showSectionById('giftbox');
  // 設置禮盒規格
  state.currentGiftboxSize = item.size;
  state.giftboxSelection = { ...item.products };
  // 更新按鈕狀態
  document.querySelectorAll('.giftbox-size-btn').forEach((btn) => btn.classList.remove('selected'));
  // 直接跳到步驟2
  document.querySelectorAll('.giftbox-step').forEach((step) => step.classList.remove('active'));
  document.getElementById('giftboxStep2').classList.add('active');
  document.getElementById('giftboxStep2Title').textContent = `步驟2: 選擇商品組合 (${item.size}粒裝)`;
  document.getElementById('targetCount').textContent = item.size;
  // 載入產品並填入已選擇的數量
  loadGiftboxProductsForEdit(item.products);
  // 填入數量和備註
  document.getElementById('giftboxQuantity').value = item.quantity;
  document.getElementById('giftboxNotes').value = item.notes || '';
  // 如果有特價，填入特價
  if (item.isSpecialPrice) {
    document.getElementById('giftboxSpecialPriceInput').value = item.price;
  }
  showAlert('正在編輯禮盒，修改後請點擊「更新禮盒」', 'info');
}

export function loadGiftboxProductsForEdit(existingProducts) {
  const giftboxProducts = state.allProducts.filter((p) => p.status === '啟用' && p.giftBoxEnabled === '是');
  const container = document.getElementById('giftboxProducts');
  if (giftboxProducts.length === 0) {
    renderGiftboxFilterTabs(giftboxProducts);
    container.innerHTML =
      '<p style="text-align: center; padding: 20px; color: var(--gj-muted);">目前沒有可用於禮盒的商品</p>';
    return;
  }
  container.innerHTML = `<div class="giftbox-product-grid">${giftboxProducts
    .map((product) => renderGiftboxProductCard(product, existingProducts[product.productId]))
    .join('')}</div>`;
  updateGiftboxProgress();
  renderGiftboxFilterTabs(giftboxProducts);
}

export function backToStep1() {
  document.querySelectorAll('.giftbox-step').forEach((step) => step.classList.remove('active'));
  document.getElementById('giftboxStep1').classList.add('active');
  if (typeof resetGiftboxState === 'function') {
    resetGiftboxState();
  }
}

export function backToStep2() {
  document.getElementById('giftboxStep3').classList.remove('active');
  document.getElementById('giftboxStep2').classList.add('active');
}
