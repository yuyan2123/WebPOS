import { state } from '../app/state.js';
import { showSection, showSettingsSection } from '../app/navigation.js';
import { searchOrders, searchOverdueOrders } from '../app/search.js';
import { toggleCartModal } from '../app/cart.js';
import { getTaipeiDate } from '../app/platform.js';

const sections = {
  customer: ['建立訂單', '先填寫客戶與配送資料'],
  date: ['交貨安排', '選擇日期，掌握每日供應量'],
  gift: ['商品', '挑選商品，隨時檢視訂單'],
  cake: ['商品', '挑選商品，隨時檢視訂單'],
  giftbox: ['禮盒組合', '選擇規格，自由搭配內容'],
  search: ['訂單管理', '查詢進度、付款與交貨資訊'],
  settings: ['商品管理', '新增、編輯與管理商品'],
};
const panels = {
  products: '商品管理',
  capacity: '供應量設定',
  demand: '需求統計',
  reports: '營業報表',
  device: '裝置資訊',
};
const panelSubtitles = {
  products: '新增、編輯與管理商品',
  capacity: '設定每日供應量與指定日期上限',
  demand: '依交貨日期彙整商品需求',
  reports: '依交貨日期區間查看營收與商品銷售',
  device: '查看目前使用的裝置與瀏覽器',
};
let restoring = false;

function navigateFromUrl() {
  const [section, panel] = location.hash.slice(1).split('/');
  if (!sections[section]) return;
  restoring = true;
  if (section === 'settings') showSettingsSection(panels[panel] ? panel : 'products');
  else showSection(section);
  restoring = false;
}

export function refreshWorkspace() {
  const customer = document.getElementById('workspaceCustomer');
  if (!customer) return;
  customer.textContent = state.currentCustomer.name || state.currentCustomer.contactValue || state.currentCustomer.phone || '尚未填寫客戶';
  document.getElementById('workspaceDate').textContent = state.currentDeliveryDate || '尚未選擇日期';
  const items = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  document.getElementById('workspaceQuantity').textContent = `${quantity} 件商品`;
  document.getElementById('workspaceCart').setAttribute('aria-label', `檢視訂單，${quantity} 件商品`);
  document.getElementById('workspaceMode').textContent = state.isEditingOrder ? '編輯訂單' : '新訂單';
}

export function initializeWorkspace() {
  document.getElementById('workspaceCart').addEventListener('click', toggleCartModal);
  const managementToggle = document.getElementById('managementToggle');
  const managementLinks = document.getElementById('managementLinks');
  function positionManagement() {
    if (!window.matchMedia('(min-width: 900px) and (max-width: 1366px)').matches) {
      managementLinks.style.removeProperty('left');
      managementLinks.style.removeProperty('top');
      return;
    }
    const toggleRect = managementToggle.getBoundingClientRect();
    const navRect = managementToggle.closest('.app-navigation').getBoundingClientRect();
    managementLinks.style.left = `${navRect.right + 8}px`;
    managementLinks.style.top = `${Math.max(12, Math.min(toggleRect.top, window.innerHeight - managementLinks.offsetHeight - 12))}px`;
  }
  function closeManagement(returnFocus = false) {
    managementToggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) managementToggle.focus();
  }
  managementToggle.addEventListener('click', () => {
    const expanded = managementToggle.getAttribute('aria-expanded') === 'true';
    managementToggle.setAttribute('aria-expanded', String(!expanded));
    if (!expanded) {
      positionManagement();
      (
        managementLinks.querySelector('[aria-current="page"]') || managementLinks.querySelector('button')
      ).focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!managementLinks.contains(event.target) && !managementToggle.contains(event.target))
      closeManagement();
  });
  document.addEventListener('focusin', (event) => {
    if (!managementLinks.contains(event.target) && !managementToggle.contains(event.target))
      closeManagement();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && managementToggle.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      closeManagement(true);
    }
  });
  window.matchMedia('(max-width: 899px)').addEventListener('change', () => closeManagement());
  window.matchMedia('(max-width: 1366px)').addEventListener('change', () => closeManagement());
  window.addEventListener('resize', positionManagement);
  managementToggle.closest('.app-navigation').addEventListener('scroll', positionManagement);
  document
    .querySelectorAll('[data-panel]')
    .forEach((button) => button.addEventListener('click', () => showSettingsSection(button.dataset.panel)));
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
    document.getElementById('workspaceSubtitle').textContent = panelSubtitles[panel] || subtitle;
    document.getElementById('orderContext').hidden = ['search', 'settings'].includes(section);
    document.body.dataset.section = section;
    document.body.dataset.panel = panel || '';
    document.title = `${panels[panel] || title} · WebPOS`;
    const hash = `#${section}${panel ? '/' + panel : ''}`;
    if (!restoring && location.hash !== hash) history.pushState(null, '', hash);
    closeManagement();
    managementToggle.classList.toggle('current-group', section === 'settings');
    const heading = document.getElementById('workspaceTitle');
    if (heading && !restoring) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
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
