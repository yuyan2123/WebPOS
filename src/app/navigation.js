import { state } from './state.js';
import { resetGiftboxState } from './giftboxes.js';
import { renderCalendar } from './calendar.js';
import { initSearchDatepicker, initDemandDatepicker, initOverrideDatepicker } from './date-pickers.js';
import { initReportDatepicker } from './reports.js';
import { loadCapacitySettings } from './capacity.js';

// ==========================================
//        導航和區塊切換 (新UI)
// ==========================================
export function showSection(sectionName, navElement, panel) {
  if (sectionName === 'settings' && !panel) {
    const active = document.querySelector('.settings-section.active');
    return showSettingsSection(active?.id.replace('settings', '').toLowerCase() || 'products');
  }
  const section = document.getElementById(sectionName);
  if (!section?.classList.contains('content-section')) return;
  navElement ||= document.getElementById('nav-' + sectionName);
  document.querySelectorAll('.content-section').forEach((s) => s.classList.remove('active'));
  section.classList.add('active');
  // 主捲動容器改為 main，切換頁面時捲回頂端
  const mainScroller = document.querySelector('main');
  if (mainScroller) mainScroller.scrollTop = 0;
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.remove('bg-blue-100', 'text-blue-700');
    item.classList.add('text-gray-600');
    item.removeAttribute('aria-current');
  });
  if (navElement) {
    navElement.classList.remove('text-gray-600');
    navElement.classList.add('bg-blue-100', 'text-blue-700');
    navElement.setAttribute('aria-current', 'page');
  }
  const floatingCart = document.querySelector('.floating-cart');
  if (floatingCart) {
    if (sectionName === 'search' || sectionName === 'settings') {
      floatingCart.style.display = 'none';
    } else {
      floatingCart.style.display = 'flex';
    }
  }
  // 如果離開禮盒頁，重置禮盒編輯狀態
  if (sectionName !== 'giftbox' && state.editingGiftboxIndex >= 0) {
    resetGiftboxState();
  }
  // 如果切換到日期頁，渲染日曆
  if (sectionName === 'date') {
    setTimeout(() => renderCalendar(), 100);
  }
  // 如果切換到搜尋頁，初始化日期選擇器
  if (sectionName === 'search') {
    initSearchDatepicker();
  }
  document.dispatchEvent(new CustomEvent('pos:navigate', { detail: { section: sectionName, panel } }));
}

export function showSettingsSection(sectionName, navElement) {
  const target = document.getElementById(
    'settings' + sectionName.charAt(0).toUpperCase() + sectionName.slice(1),
  );
  if (!target?.classList.contains('settings-section')) return;
  document.querySelectorAll('.settings-section').forEach((s) => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  target.classList.add('active');
  target.style.display = '';
  showSection('settings', navElement || document.getElementById('nav-' + sectionName), sectionName);
  if (sectionName === 'demand') {
    initDemandDatepicker();
  }
  if (sectionName === 'reports') {
    initReportDatepicker();
  }
  if (sectionName === 'capacity') {
    initOverrideDatepicker();
    loadCapacitySettings();
  }
}
