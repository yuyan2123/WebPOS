import { state } from '../app/state.js';
import { showSection, showSettingsSection } from '../app/navigation.js';
import { searchOrders, searchOverdueOrders } from '../app/search.js';
import { toggleCartModal } from '../app/cart.js';
import { getTaipeiDate } from '../app/platform.js';
import { loadProductsByCategory } from '../app/catalog.js';

const sections = {
  customer: ['建立訂單', '先填寫客戶與配送資料'],
  date: ['交貨安排', '選擇日期，掌握每日供應量'],
  gift: ['伴手禮', '挑選商品，隨時檢視訂單'],
  cake: ['喜餅', '挑選商品，隨時檢視訂單'],
  giftbox: ['禮盒組合', '選擇規格，自由搭配內容'],
  search: ['訂單管理', '查詢進度、付款與交貨資訊'],
  settings: ['店務管理', '商品、供應量與營運資訊'],
};
const panels = {
  products: '商品管理',
  capacity: '供應量設定',
  demand: '需求統計',
  reports: '營業報表',
  device: '裝置資訊',
};
let restoring = false;

function navigateFromUrl() {
  const [section, panel] = location.hash.slice(1).split('/');
  if (!sections[section]) return;
  restoring = true;
  showSection(section);
  if (section === 'settings' && panels[panel]) showSettingsSection(panel);
  restoring = false;
}

export function refreshWorkspace() {
  const customer = document.getElementById('workspaceCustomer');
  if (!customer) return;
  customer.textContent = state.currentCustomer.name || '尚未填寫客戶';
  document.getElementById('workspaceDate').textContent = state.currentDeliveryDate || '尚未選擇日期';
  const items = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  document.getElementById('workspaceQuantity').textContent = `${quantity} 件商品`;
  document.getElementById('workspaceCart').setAttribute('aria-label', `檢視訂單，${quantity} 件商品`);
  document.getElementById('workspaceMode').textContent = state.isEditingOrder ? '編輯訂單' : '新訂單';
}

export function initializeWorkspace() {
  for (const [id, category] of [
    ['gift', '伴手禮'],
    ['cake', '喜餅'],
  ]) {
    document
      .getElementById(id + 'ProductSearch')
      .addEventListener('input', () => loadProductsByCategory(category, id));
  }
  document.getElementById('workspaceCart').addEventListener('click', toggleCartModal);
  document.querySelectorAll('[data-panel]').forEach((button) =>
    button.addEventListener('click', () => {
      restoring = true;
      showSection('settings');
      restoring = false;
      showSettingsSection(button.dataset.panel);
    }),
  );
  document
    .querySelectorAll('[data-route]')
    .forEach((button) => button.addEventListener('click', () => showSection(button.dataset.route)));
  document.getElementById('todayOrders').addEventListener('click', () => {
    document.getElementById('searchDate').value = getTaipeiDate();
    searchOrders();
  });
  document.getElementById('overdueShortcut').addEventListener('click', searchOverdueOrders);
  document.querySelector('.search-form').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('input')) {
      event.preventDefault();
      searchOrders();
    }
  });
  document.addEventListener('pos:navigate', (event) => {
    const { section, panel } = event.detail;
    if (!sections[section]) return;
    const [title, subtitle] = sections[section];
    document.getElementById('workspaceTitle').textContent = panels[panel] || title;
    document.getElementById('workspaceSubtitle').textContent = subtitle;
    document.getElementById('orderContext').hidden = ['search', 'settings'].includes(section);
    document.body.dataset.section = section;
    document.title = `${panels[panel] || title} · 金家 POS`;
    const hash = `#${section}${panel ? '/' + panel : ''}`;
    if (!restoring && location.hash !== hash) history.pushState(null, '', hash);
    const heading = document.querySelector(`#${section} h2, #${section} h3`);
    if (heading && !restoring) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    document.querySelectorAll('.settings-nav-btn').forEach((button) => {
      const selected = panel && button.getAttribute('onclick')?.includes(`'${panel}'`);
      button.classList.toggle('active', Boolean(selected));
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    refreshWorkspace();
  });
  window.addEventListener('popstate', navigateFromUrl);
  window.addEventListener('hashchange', navigateFromUrl);
  document.addEventListener('input', refreshWorkspace);
  document.addEventListener('pos:draft-changed', refreshWorkspace);
  document.addEventListener('keydown', (event) => {
    if (
      event.key !== '/' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.target.matches('input,textarea,select,[contenteditable]')
    )
      return;
    if (
      document.querySelector(
        '.modal.active, .cart-sidebar.active, #firebaseAuthOverlay.active, #firebaseShopOverlay.active',
      )
    )
      return;
    event.preventDefault();
    showSection('search');
    document.getElementById('searchName').focus();
  });
  if (location.hash) navigateFromUrl();
  else showSection(new URLSearchParams(location.search).get('section') || 'customer');
  refreshWorkspace();
}
