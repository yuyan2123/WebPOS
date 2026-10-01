import { escapeHandlerArgument } from '../platform/markup.js';
import { escapeHtml } from './customers.js';
import { rpc } from '../platform/rpc.js';
import { state } from './state.js';
import { initializeModalCloseHandlers } from './platform.js';
import { showAlert, setButtonLoading, handleError } from './feedback.js';
import { updateProductDisplays, updateNavVisibility, cacheProducts } from './catalog.js';
import { showConfirmModal, closeConfirmModal } from './dialogs.js';

const productFieldIds = ['productName', 'productCategory', 'productPrice'];
const productErrors = new Map();
let productSavePending = false;
let productEditorVersion = 0;

function productFieldError(id) {
  const value = document.getElementById(id).value.trim();
  if (id === 'productName') return value ? '' : '請填寫商品名稱。';
  if (id === 'productCategory') return value ? '' : '請填寫或選擇商品類別。';
  if (!value) return '請填寫商品價格。';
  const price = Number(value);
  return Number.isInteger(price) && price > 0 && price <= 10000000
    ? ''
    : '請輸入 1 至 10,000,000 之間的整數價格。';
}

function renderProductFeedback(serverMessage = '') {
  for (const id of productFieldIds) {
    const input = document.getElementById(id);
    const error = document.getElementById(id + 'Error');
    const message = productErrors.get(id) || '';
    error.textContent = message;
    error.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    input.closest('.gj-combobox')?.classList.toggle('gj-invalid', Boolean(message));
    const descriptions = [id === 'productCategory' ? 'productCategoryHint' : '', message ? error.id : '']
      .filter(Boolean)
      .join(' ');
    if (descriptions) input.setAttribute('aria-describedby', descriptions);
    else input.removeAttribute('aria-describedby');
  }
  const summary = document.getElementById('productFormFeedback');
  summary.replaceChildren();
  summary.hidden = !productErrors.size && !serverMessage;
  if (summary.hidden) return;
  const title = document.createElement('h4');
  title.id = 'productFormFeedbackTitle';
  title.textContent = serverMessage ? '商品尚未儲存' : '請確認以下欄位';
  summary.append(title);
  if (serverMessage) {
    const message = document.createElement('p');
    message.textContent = serverMessage;
    const retry = document.createElement('p');
    retry.textContent = '資料已保留，請確認後再次儲存。';
    summary.append(message, retry);
  } else {
    const list = document.createElement('ul');
    for (const [id, message] of productErrors) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#' + id;
      link.textContent = message;
      link.onclick = (event) => {
        event.preventDefault();
        document.getElementById(id).focus();
      };
      item.append(link);
      list.append(item);
    }
    summary.append(list);
  }
}

function resetProductFeedback() {
  productErrors.clear();
  renderProductFeedback();
  setProductFieldsDisabled(false);
  const modal = document.getElementById('productEditModal');
  if (modal.dataset.feedbackInitialized) return;
  modal.dataset.feedbackInitialized = 'true';
  for (const id of productFieldIds) {
    const update = () => {
      if (!productErrors.has(id)) return;
      const message = productFieldError(id);
      if (message) productErrors.set(id, message);
      else productErrors.delete(id);
      renderProductFeedback();
    };
    document.getElementById(id).addEventListener('input', update);
    document.getElementById(id).addEventListener('change', update);
  }
}

function setProductFieldsDisabled(disabled) {
  document
    .querySelectorAll(
      '#productEditModal .overflow-y-auto :is(input:not([type="hidden"]), textarea, select, button)',
    )
    .forEach((control) => {
      control.disabled = disabled;
    });
}

export function closeCategoryOptions() {
  document.getElementById('productCategoryOptions').hidden = true;
  document.getElementById('productCategoryToggle').setAttribute('aria-expanded', 'false');
}

function renderCategoryOptions(filter = '') {
  const input = document.getElementById('productCategory');
  const options = document.getElementById('productCategoryOptions');
  const categories = [...new Set(state.allProducts.map((p) => p.category).filter(Boolean))];
  options.replaceChildren(
    ...categories
      .filter((category) => category.includes(filter.trim()))
      .map((category) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = category;
        button.setAttribute('aria-pressed', String(category === input.value));
        button.onclick = () => {
          input.value = category;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          closeCategoryOptions();
          document.getElementById('productCategoryToggle').focus();
        };
        return button;
      }),
  );
  if (!options.childElementCount) {
    const empty = document.createElement('p');
    empty.textContent = '沒有符合的類別，可直接輸入新類別。';
    options.append(empty);
  }
}

function initializeCategoryPicker() {
  const picker = document.getElementById('productCategoryPicker');
  closeCategoryOptions();
  if (picker.dataset.initialized) return;
  picker.dataset.initialized = 'true';
  const input = document.getElementById('productCategory');
  const toggle = document.getElementById('productCategoryToggle');
  const options = document.getElementById('productCategoryOptions');
  const modal = document.getElementById('productEditModal');
  // Stay inside the dialog's focus boundary, but outside its clipped content.
  modal.append(options);
  const contains = (target) => picker.contains(target) || options.contains(target);
  const position = () => {
    if (options.hidden) return;
    const anchor = picker.getBoundingClientRect();
    const bounds = modal.getBoundingClientRect();
    const form = picker.closest('.overflow-y-auto').getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = Math.max(bounds.top, viewport?.offsetTop || 0) + 8;
    const bottom =
      Math.min(bounds.bottom, (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight)) - 8;
    if (anchor.bottom <= Math.max(form.top, top) || anchor.top >= Math.min(form.bottom, bottom)) {
      closeCategoryOptions();
      return;
    }
    const width = Math.min(Math.max(anchor.width, 220), bounds.width - 16);
    options.style.width = `${width}px`;
    const below = Math.max(0, bottom - anchor.bottom - 6);
    const above = Math.max(0, anchor.top - top - 6);
    const upwards = below < Math.min(220, options.scrollHeight + 2) && above > below;
    options.style.maxHeight = `${Math.min(220, upwards ? above : below)}px`;
    options.style.left = `${Math.max(8, Math.min(anchor.left - bounds.left, bounds.width - width - 8))}px`;
    options.style.top = `${(upwards ? anchor.top - 6 - options.offsetHeight : anchor.bottom + 6) - bounds.top}px`;
  };
  const open = (filter = '') => {
    renderCategoryOptions(filter);
    options.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    options.scrollTop = 0;
    position();
  };
  toggle.addEventListener('click', () => {
    toggle.focus();
    if (options.hidden) open();
    else closeCategoryOptions();
  });
  input.addEventListener('click', () => open());
  input.addEventListener('input', () => open(input.value));
  const navigate = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.hidden) open();
      const buttons = [...options.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? index + 1 : index < 0 ? buttons.length - 1 : index - 1;
      buttons[(next + buttons.length) % buttons.length]?.focus();
    }
  };
  picker.addEventListener('keydown', navigate);
  options.addEventListener('keydown', navigate);
  options.addEventListener('click', (event) => event.stopPropagation());
  modal.addEventListener(
    'scroll',
    (event) => {
      if (event.target !== options) position();
    },
    true,
  );
  modal.addEventListener('animationend', position);
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Tab' && !contains(document.activeElement)) closeCategoryOptions();
  });
  document.addEventListener(
    'click',
    (event) => {
      if (!contains(event.target)) closeCategoryOptions();
    },
    true,
  );
}

export function renderProductCards() {
  const grid = document.getElementById('productsCardGrid');
  const tabsContainer = document.getElementById('productsFilterTabs');
  const focusedFilter = tabsContainer.contains(document.activeElement)
    ? document.activeElement.dataset.filter
    : null;
  renderCategoryOptions();
  if (
    state.currentProductFilter !== null &&
    !state.allProducts.some((p) => p.category === state.currentProductFilter)
  )
    state.currentProductFilter = null;
  // 建立類別篩選 tabs
  const categories = [null, ...new Set(state.allProducts.map((p) => p.category))];
  const categoryCounts = Object.create(null);
  state.allProducts.forEach((p) => {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  });
  tabsContainer.replaceChildren(
    ...categories.map((category) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.classList.toggle('active', category === state.currentProductFilter);
      button.dataset.filter = category === null ? 'all' : 'category:' + category;
      button.setAttribute('aria-pressed', String(category === state.currentProductFilter));
      button.textContent = `${category === null ? '全部' : category} (${category === null ? state.allProducts.length : categoryCounts[category]})`;
      button.onclick = () => filterProductsByCategory(category);
      return button;
    }),
  );
  if (focusedFilter !== null) {
    (
      [...tabsContainer.children].find((button) => button.dataset.filter === focusedFilter) ||
      tabsContainer.querySelector('.active')
    )?.focus({ preventScroll: true });
  }
  // 篩選商品
  const filtered =
    state.currentProductFilter === null
      ? state.allProducts
      : state.allProducts.filter((p) => p.category === state.currentProductFilter);
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="products-empty workspace-empty" style="grid-column: 1/-1;" role="status">
                    <h3>尚未建立商品</h3>
                    <p>${document.body.dataset.shopRole === 'viewer' ? '請聯絡店鋪擁有者或可編輯成員新增商品。' : '使用上方「新增商品」設定品名、類別與價格，即可開始建立訂單。'}</p>
                </div>`;
    return;
  }
  grid.innerHTML = filtered
    .map((p) => {
      const statusClass = p.status === '啟用' ? 'enabled' : 'disabled';
      const statusIcon = p.status === '啟用' ? 'fa-check-circle' : 'fa-times-circle';
      const giftboxBadge =
        p.giftBoxEnabled === '是'
          ? '<span class="status-badge yes"><i class="fas fa-gift"></i> 可裝禮盒</span>'
          : '';
      const money = (value) => `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`;
      const specialPriceDisplay =
        p.specialPrice && p.specialPrice !== ''
          ? `<span class="price-special">${money(p.specialPrice)}</span>`
          : '<span class="price-none">未設定</span>';
      const companyPriceDisplay =
        p.companyPrice && p.companyPrice !== ''
          ? `<span class="price-value">${money(p.companyPrice)}</span>`
          : '<span class="price-none">未設定</span>';
      return `<div class="product-card gj-pos-card">
                    <div class="product-card-header">
                        <h3 class="product-name">${escapeHtml(p.productName)}</h3>
                        <span class="status-badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${p.status}</span>
                    </div>
                    <div class="product-card-tags">
                        <span class="status-badge category"><i class="fas fa-tag"></i> ${escapeHtml(p.category)}</span>
                        ${giftboxBadge}
                    </div>
                    <div class="product-card-prices">
                        <div class="price-row">
                            <span class="price-label">售價</span>
                            <span class="price-value">${money(p.price)}</span>
                        </div>
                        <div class="price-row">
                            <span class="price-label">特價</span>
                            ${specialPriceDisplay}
                        </div>
                        <div class="price-row">
                            <span class="price-label">企業價</span>
                            ${companyPriceDisplay}
                        </div>
                    </div>
                    ${
                      document.body.dataset.shopRole === 'viewer'
                        ? ''
                        : `<div class="product-card-actions requires-editor">
                        <button class="btn-card-edit" onclick="editProduct('${escapeHandlerArgument(p.productId)}')">
                            <i class="fas fa-edit"></i> 編輯
                        </button>
                        <button class="btn-card-delete" onclick="event.stopPropagation(); deleteProduct('${escapeHandlerArgument(p.productId)}')">
                            <i class="fas fa-trash-alt"></i> 刪除
                        </button>
                    </div>`
                    }
                </div>`;
    })
    .join('');
}

export function filterProductsByCategory(category) {
  state.currentProductFilter = category;
  renderProductCards();
}

// 商品編輯視窗的按鈕群組選擇器（寫入對應 hidden input）
export function selectProductOption(inputId, button) {
  button.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  document.getElementById(inputId).value = button.dataset.value;
}

// 依 hidden input 的值同步按鈕群組的 active 狀態
export function syncProductOptionButtons(inputId) {
  const value = document.getElementById(inputId).value;
  const group = document.getElementById(inputId + 'Group');
  if (!group) return;
  group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === value));
}

export function showAddProduct() {
  initializeCategoryPicker();
  productEditorVersion++;
  resetProductFeedback();
  document.getElementById('productEditModalTitle').textContent = '新增商品';
  document.getElementById('editProductId').value = '';
  document.getElementById('productName').value = '';
  document.getElementById('productPrice').value = '';
  document.getElementById('productSpecialPrice').value = '';
  document.getElementById('productCompanyPrice').value = '';
  document.getElementById('productDescription').value = '';
  document.getElementById('productCategory').value = '';
  document.getElementById('productStatus').value = '啟用';
  document.getElementById('productGiftBoxEnabled').value = '是';
  syncProductOptionButtons('productStatus');
  syncProductOptionButtons('productGiftBoxEnabled');
  document.getElementById('productEditModal').classList.add('active');
  // 確保modal有正確的關閉處理器
  setTimeout(() => initializeModalCloseHandlers(), 50);
}

export function closeProductEditModal() {
  productEditorVersion++;
  closeCategoryOptions();
  document.getElementById('productEditModal').classList.remove('active');
}

export function saveProduct() {
  if (productSavePending) return;
  const saveBtn = document.getElementById('productSaveButton');
  closeCategoryOptions();
  productErrors.clear();
  for (const id of productFieldIds) {
    const message = productFieldError(id);
    if (message) productErrors.set(id, message);
  }
  renderProductFeedback();
  if (productErrors.size) {
    (productErrors.size > 1
      ? document.getElementById('productFormFeedback')
      : document.getElementById(productErrors.keys().next().value)
    ).focus();
    return;
  }
  const specialPriceValue = document.getElementById('productSpecialPrice').value.trim();
  const data = {
    productId: document.getElementById('editProductId').value,
    productName: document.getElementById('productName').value.trim(),
    category: document.getElementById('productCategory').value.trim(),
    price: parseInt(document.getElementById('productPrice').value),
    status: document.getElementById('productStatus').value,
    description: document.getElementById('productDescription').value.trim(),
    giftBoxEnabled: document.getElementById('productGiftBoxEnabled').value,
    specialPrice: specialPriceValue ? parseInt(specialPriceValue) : '',
    companyPrice: document.getElementById('productCompanyPrice').value.trim()
      ? parseInt(document.getElementById('productCompanyPrice').value.trim())
      : '',
  };
  const editorVersion = productEditorVersion;
  productSavePending = true;
  setProductFieldsDisabled(true);
  setButtonLoading(saveBtn, true, '儲存中...');
  rpc
    .withSuccessHandler(function (result) {
      productSavePending = false;
      setProductFieldsDisabled(false);
      setButtonLoading(saveBtn, false);
      handleProductSaved(result, editorVersion === productEditorVersion);
    })
    .withFailureHandler(function (error) {
      productSavePending = false;
      setProductFieldsDisabled(false);
      setButtonLoading(saveBtn, false);
      if (editorVersion === productEditorVersion) {
        renderProductFeedback(error?.message || '無法連線');
        document.getElementById('productFormFeedback').focus();
      } else handleError(error);
    })
    .saveProduct(data);
}

export function handleProductSaved(result, closeEditor = true) {
  if (result?.product) {
    const index = state.allProducts.findIndex((p) => p.productId === result.product.productId);
    if (index >= 0) state.allProducts[index] = { ...state.allProducts[index], ...result.product };
    else state.allProducts.push(result.product);
    cacheProducts(state.allProducts);
    renderProductCards();
    updateProductDisplays();
    updateNavVisibility();
  }
  showAlert('商品已儲存', 'success');
  if (closeEditor) closeProductEditModal();
}

export function editProduct(productId) {
  const p = state.allProducts.find((p) => p.productId === productId);
  if (!p) return;
  initializeCategoryPicker();
  productEditorVersion++;
  resetProductFeedback();
  document.getElementById('productEditModalTitle').textContent = '編輯商品';
  document.getElementById('editProductId').value = p.productId;
  document.getElementById('productName').value = p.productName;
  document.getElementById('productCategory').value = p.category;
  document.getElementById('productPrice').value = p.price;
  document.getElementById('productSpecialPrice').value = p.specialPrice || '';
  document.getElementById('productCompanyPrice').value = p.companyPrice || '';
  document.getElementById('productStatus').value = p.status;
  document.getElementById('productDescription').value = p.description || '';
  document.getElementById('productGiftBoxEnabled').value = p.giftBoxEnabled || '是';
  syncProductOptionButtons('productStatus');
  syncProductOptionButtons('productGiftBoxEnabled');
  document.getElementById('productEditModal').classList.add('active');
  // 確保modal有正確的關閉處理器
  setTimeout(() => initializeModalCloseHandlers(), 50);
}

export function deleteProduct(productId) {
  showConfirmModal('確定要刪除此商品嗎？', () => {
    rpc
      .withSuccessHandler(function () {
        closeConfirmModal();
        showAlert('商品已刪除', 'success');
        state.allProducts = state.allProducts.filter((p) => p.productId !== productId);
        cacheProducts(state.allProducts);
        renderProductCards();
        updateProductDisplays();
        updateNavVisibility();
      })
      .withFailureHandler(function (error) {
        closeConfirmModal();
        handleError(error);
      })
      .deleteProduct(productId);
  });
}
