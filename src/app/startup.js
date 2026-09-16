import { state } from './state.js';
import {
  draftStorageKey,
  captureOrderDraft,
  hasMeaningfulDraft,
  localDbPut,
  initOrderDraftPersistence,
  restoreOrderDraftOnce,
  applyRoleCapabilities,
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
import { initializePrinter } from './printer.js';
import { startupProgress, finishStartup, failStartup } from '../ui/startup-progress.js';

window.saveOrderDraftNow = async function () {
  clearTimeout(state.draftSaveTimer);
  const key = draftStorageKey();
  const draft = captureOrderDraft();
  if (key && hasMeaningfulDraft(draft)) await localDbPut('drafts', key, draft);
};

// 頁面載入時初始化
export async function startApplication() {
  let updating = false;
  try {
    updating = sessionStorage.getItem('ginJiaPos.updateReload') === '1';
    sessionStorage.removeItem('ginJiaPos.updateReload');
  } catch {
    /* Continue normal startup when session storage is unavailable. */
  }
  const main = document.querySelector('main');
  main.inert = true;
  document.querySelector('.fab-cart').inert = true;
  main.setAttribute('aria-busy', 'true');
  // Initial empty renders must not overwrite a saved draft while progress is held.
  state.suppressDraftSave = true;
  try {
    await initializeDomain();
    await startupProgress(1, updating ? '更新中...' : '取得資料中...');
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

    // 初始化配送方式相關欄位顯示
    toggleShippingField();
    // 初始化日曆 (新UI)
    renderCalendar(true);
    // 商品與目前月份產能合併載入；客戶只在使用者輸入時查詢。
    await loadInitialShopData();
    await startupProgress(2, '正在檢查與恢復本機未送出訂單…');
    await restoreOrderDraftOnce();
    state.suppressDraftSave = false;
    applyRoleCapabilities();
    initializePrinter();
    await startupProgress(3, '正在完成畫面渲染…');
    initializeWorkspace();
    const requestedSection = !location.hash && new URLSearchParams(location.search).get('section');
    if (requestedSection && document.getElementById(requestedSection)) showSectionById(requestedSection);
    await finishStartup();
  } catch (error) {
    failStartup(error);
  }
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', startApplication, { once: true });
else startApplication();
