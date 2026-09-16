import { state } from './state.js';
import { preventDoubleClick } from './feedback.js';
import { closeCartModal } from './cart.js';
import { closeProductModal } from './product-detail.js';
import { closeProductEditModal } from './products.js';
import { closeConfirmModal } from './dialogs.js';
import { showSection } from './navigation.js';

export function initAccessibleDialogs() {
  document.querySelectorAll('.modal').forEach(function (modal) {
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
  });
  document.querySelectorAll('label:not([for])').forEach(function (label) {
    const control = label.parentElement?.querySelector('input[id], select[id], textarea[id]');
    if (control) label.htmlFor = control.id;
  });
  document
    .querySelectorAll('input:not([aria-label]), select:not([aria-label]), textarea:not([aria-label])')
    .forEach(function (control) {
      if (!control.labels?.length)
        control.setAttribute('aria-label', control.placeholder || control.id || '輸入欄位');
    });
  document.querySelectorAll('button').forEach(function (button) {
    if (!button.getAttribute('aria-label') && !button.textContent.trim()) {
      const icon = button.querySelector('i');
      if (icon?.classList.contains('fa-plus')) button.setAttribute('aria-label', '增加數量');
      else if (icon?.classList.contains('fa-minus')) button.setAttribute('aria-label', '減少數量');
      else if (icon?.classList.contains('fa-trash-alt')) button.setAttribute('aria-label', '刪除');
      else if (icon?.classList.contains('fa-times')) button.setAttribute('aria-label', '關閉');
      else if (icon?.classList.contains('fa-chevron-left')) button.setAttribute('aria-label', '上一個月');
      else if (icon?.classList.contains('fa-chevron-right')) button.setAttribute('aria-label', '下一個月');
      else if (button.textContent.trim() === '×') button.setAttribute('aria-label', '關閉');
    }
  });
}

export function initVisibleViewportFit() {
  const probe = document.getElementById('viewportProbe');
  if (!probe || typeof IntersectionObserver === 'undefined') return;
  // 密集 threshold，外層網頁捲動造成的可視範圍變化才會即時回報
  const thresholds = [];
  for (let i = 0; i <= 100; i++) thresholds.push(i / 100);
  state.viewportProbeObserver = new IntersectionObserver(
    function (entries) {
      applyVisibleViewport(entries[entries.length - 1]);
    },
    { threshold: thresholds },
  );
  state.viewportProbeObserver.observe(probe);
  window.addEventListener('resize', scheduleViewportRemeasure);
  window.addEventListener('orientationchange', scheduleViewportRemeasure);
  document.addEventListener('visibilitychange', scheduleViewportRemeasure);
  // iOS 捲動外層網頁時 observer 不一定會即時觸發，觸控結束後補量一次
  window.addEventListener('touchend', scheduleViewportRemeasure, { passive: true });
  // 外層網頁（Google Sites）版面可能較晚才確定 iframe 尺寸
  setTimeout(scheduleViewportRemeasure, 300);
  setTimeout(scheduleViewportRemeasure, 1500);
}

/**
 * 重新觀察一次探針，強制 IntersectionObserver 回報最新結果
 */
export function scheduleViewportRemeasure() {
  if (!state.viewportProbeObserver) return;
  clearTimeout(state.viewportRemeasureTimer);
  state.viewportRemeasureTimer = setTimeout(function () {
    const probe = document.getElementById('viewportProbe');
    if (!probe) return;
    state.viewportProbeObserver.unobserve(probe);
    state.viewportProbeObserver.observe(probe);
  }, 150);
}

export function applyVisibleViewport(entry) {
  if (!entry || !entry.intersectionRect) return;
  const frameHeight = window.innerHeight;
  const rect = entry.intersectionRect;
  // 完全不可見（切到其他分頁、外層捲離畫面）時不調整，避免版面被壓成 0
  if (!frameHeight || rect.height <= 0) return;
  let top = Math.max(0, Math.round(rect.top));
  let bottom = Math.max(0, Math.round(frameHeight - rect.bottom));
  if (!isFinite(top) || !isFinite(bottom)) return;
  // 誤差在幾個 px 內視為沒被裁切
  if (top + bottom < 8) {
    top = 0;
    bottom = 0;
  }
  // 安全下限：可用高度過小就不套用，寧可維持原樣也不要把介面壓扁
  if (frameHeight - top - bottom < 320) return;
  const root = document.documentElement;
  if (
    root.style.getPropertyValue('--vp-top') === top + 'px' &&
    root.style.getPropertyValue('--vp-bottom') === bottom + 'px'
  ) {
    return;
  }
  root.style.setProperty('--vp-top', top + 'px');
  root.style.setProperty('--vp-bottom', bottom + 'px');
}

// 檢測設備類型
export function detectDevice() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isIPad = /iPad/i.test(userAgent) || (/Macintosh|MacIntel/i.test(userAgent + ' ' + navigator.platform) && navigator.maxTouchPoints > 1);
  const isMobile = isIPad || /android|iPhone|iPod/i.test(userAgent);
  const body = document.body;
  if (isMobile) {
    body.classList.add('mobile-device');
  } else {
    body.classList.add('desktop-device');
  }
  // 填入裝置資訊
  const deviceOsEl = document.getElementById('deviceOs');
  const layoutModeEl = document.getElementById('layoutMode');
  const fullUserAgentEl = document.getElementById('fullUserAgent');
  if (deviceOsEl) {
    // 解析作業系統
    let os = '未知';
    if (isIPad) os = 'iPadOS';
    else if (/iPhone|iPod/i.test(userAgent)) os = 'iOS';
    else if (userAgent.indexOf('Win') !== -1) os = 'Windows';
    else if (userAgent.indexOf('Mac') !== -1) os = 'macOS';
    else if (userAgent.indexOf('Android') !== -1) os = 'Android';
    else if (userAgent.indexOf('Linux') !== -1) os = 'Linux';
    deviceOsEl.value = os;
  }
  if (layoutModeEl) {
    layoutModeEl.value = isMobile ? '行動裝置模式' : '桌面模式';
  }
  if (fullUserAgentEl) {
    fullUserAgentEl.value = userAgent;
  }
}

// 初始化按鈕狀態
export function initializeButtonStates() {
  // 為重要按鈕添加防重複點擊保護
  const importantButtons = ['proceedStep3'];
  importantButtons.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn && !btn.dataset.protectedClick) {
      const originalOnclick = btn.onclick;
      if (originalOnclick) {
        btn.onclick = preventDoubleClick(btnId, originalOnclick, 2000);
        btn.dataset.protectedClick = 'true';
      }
    }
  });
}

// Escape 鍵關閉最上層視窗（含動態建立的視窗與購物車側欄）
export function initEscapeToClose() {
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const activeModals = document.querySelectorAll('.modal.active');
    if (activeModals.length > 0) {
      const top = activeModals[activeModals.length - 1];
      top.classList.remove('active');
      if (!top.id) top.remove(); // 動態建立的視窗直接移除
      return;
    }
    const cartModal = document.getElementById('cartModal');
    if (cartModal && cartModal.classList.contains('active')) {
      closeCartModal();
    }
  });
}

// 初始化modal點擊外部關閉功能
export function initializeModalCloseHandlers() {
  // 為所有modal添加統一的點擊外部關閉功能
  const modals = document.querySelectorAll('.modal');
  modals.forEach((modal) => {
    // 如果modal還沒有onclick事件，添加一個
    if (!modal.onclick) {
      const modalId = modal.id;
      // 根據modal ID設定對應的關閉函數
      switch (modalId) {
        case 'cartModal':
          modal.onclick = closeCartModal;
          break;
        case 'productModal':
          modal.onclick = closeProductModal;
          break;
        case 'productEditModal':
          modal.onclick = closeProductEditModal;
          break;
        case 'confirmModal':
          modal.onclick = closeConfirmModal;
          break;
        default:
          // 對於動態創建的modal，使用通用關閉方法
          modal.onclick = function () {
            this.classList.remove('active');
            // 如果是動態創建的modal，直接移除
            if (!document.getElementById(modalId)) {
              this.remove();
            }
          };
      }
    }
    // 確保modal內容區域有stopPropagation
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent && !modalContent.onclick) {
      modalContent.onclick = function (event) {
        event.stopPropagation();
      };
    }
  });
}

// 注意：showSection 函數在文件後面的新 UI 適配層中定義
// 程式控制顯示指定區塊
export function showSectionById(sectionName) {
  showSection(sectionName, document.getElementById('nav-' + sectionName));
}

// 注意：showSettingsSection 函數在文件後面的新 UI 適配層中定義
// 舊的 JS 邏輯...
export function setDefaultDate() {
  const today = getTaipeiDate();
  document.getElementById('deliveryDate').value = today;
  // reportDatePicker 由 AirDatepicker 管理，不需預設值
  // 搜尋日期不設預設值
  // document.getElementById('searchDate').value = today;
}

export function getTaipeiDate() {
  const now = new Date();
  const taipeiTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return taipeiTime.toISOString().split('T')[0];
}
