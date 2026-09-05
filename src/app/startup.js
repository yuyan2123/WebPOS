import { state } from './state.js';
import {
  draftStorageKey,
  captureOrderDraft,
  hasMeaningfulDraft,
  localDbPut,
  initOrderDraftPersistence,
} from './drafts.js';
import {
  initContactMethodToggle,
  initSearchContactMethodToggle,
  initCustomerAutocomplete,
  toggleShippingField,
} from './customers.js';
import {
  initVisibleViewportFit,
  setDefaultDate,
  detectDevice,
  initializeButtonStates,
  initializeModalCloseHandlers,
  initEscapeToClose,
  initAccessibleDialogs,
  showSectionById,
} from './platform.js';
import { showSection } from './navigation.js';
import { updateCartDisplay } from './cart.js';
import { renderCalendar } from './calendar.js';
import { loadInitialShopData } from './catalog.js';
import { initializeDomain } from '../platform/domain.js';
import { initializeWorkspace } from '../ui/workspace.js';
import { initializeAccessibility } from '../ui/accessibility.js';

window.saveOrderDraftNow = async function () {
  clearTimeout(state.draftSaveTimer);
  const key = draftStorageKey();
  const draft = captureOrderDraft();
  if (key && hasMeaningfulDraft(draft)) await localDbPut('drafts', key, draft);
};

// 頁面載入時初始化
export async function startApplication() {
  const main = document.querySelector('main');
  main.inert = true;
  main.setAttribute('aria-busy', 'true');
  try {
    await initializeDomain();
  } catch (error) {
    const alert = document.getElementById('startupStatus');
    alert.hidden = false;
    alert.replaceChildren(document.createTextNode('無法載入應用程式，請檢查連線後重試。'));
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重新載入';
    retry.onclick = () => location.reload();
    alert.append(retry);
    console.error('domain_initialization_failed', error);
    return;
  }
  main.inert = false;
  main.removeAttribute('aria-busy');
  initContactMethodToggle();
  initSearchContactMethodToggle();
  initVisibleViewportFit();
  showSection('customer', document.querySelector('.nav-item'));
  setDefaultDate();
  updateCartDisplay();
  detectDevice();
  initializeButtonStates();
  initializeModalCloseHandlers();
  initCustomerAutocomplete();
  initEscapeToClose();
  initAccessibleDialogs();
  initOrderDraftPersistence();
  initializeAccessibility();
  initializeWorkspace();
  // 初始化配送方式相關欄位顯示
  toggleShippingField();
  // 初始化日曆 (新UI)
  renderCalendar(true);
  // 商品與目前月份產能合併載入；客戶只在使用者輸入時查詢。
  loadInitialShopData();
  const requestedSection = !location.hash && new URLSearchParams(location.search).get('section');
  if (requestedSection && document.getElementById(requestedSection)) showSectionById(requestedSection);
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', startApplication, { once: true });
else startApplication();
