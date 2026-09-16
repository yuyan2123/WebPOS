import { printerRequest, validatePrinterUrl } from '../platform/printer-client.js';
import { call } from '../platform/rpc.js';
import { currentLocalScope } from './drafts.js';
import { renderReceipt } from './receipt.js';
import { state } from './state.js';
import { showAlert } from './feedback.js';

const defaults = {
  enabled: false,
  url: 'wss://xiao-printer.local/ws',
  title: '',
  width: 512,
  cut: false,
  token: '',
  remember: false,
};
let scope = '';
let role = '';
let active = null;
let generation = 0;
const key = () => `ginJiaPos.printer.${scope}`;
const canPrint = () =>
  Boolean(currentLocalScope()) && ['owner', 'editor'].includes(document.body.dataset.shopRole);
const element = (id) => document.getElementById(id);

function readConfig() {
  try {
    const config = { ...defaults, ...JSON.parse(localStorage.getItem(key()) || '{}') };
    config.token = config.remember ? config.token : sessionStorage.getItem(key()) || '';
    return config;
  } catch {
    return { ...defaults };
  }
}

function loadSettings() {
  const config = readConfig();
  for (const field of ['enabled', 'url', 'title', 'width', 'cut', 'token', 'remember']) {
    const input = element('printer-' + field);
    if (input.type === 'checkbox') input.checked = Boolean(config[field]);
    else input.value = config[field];
  }
  element('printer-status').textContent = canPrint() ? '尚未檢查連線' : '僅 owner／editor 可設定及操作列印';
  updateControls();
}

function updateControls() {
  document
    .querySelectorAll(
      '#printer-settings input, #printer-settings select, #printer-settings button, [data-printer-order], #printer-send',
    )
    .forEach((control) => {
      control.disabled =
        !canPrint() || Boolean(active) || (control.id === 'printer-send' && control.dataset.ready !== 'true');
    });
}

function saveSettings() {
  if (!canPrint() || active) throw new Error('目前無法變更印表機設定');
  const config = {};
  for (const field of ['enabled', 'url', 'title', 'width', 'cut', 'token', 'remember']) {
    const input = element('printer-' + field);
    config[field] = input.type === 'checkbox' ? input.checked : input.value.trim();
  }
  config.url = validatePrinterUrl(config.url);
  config.width = Number(config.width);
  if (config.enabled && !config.token) throw new Error('請輸入裝置存取金鑰');
  // Remove any previously remembered secret before writing the chosen persistence mode.
  localStorage.removeItem(key());
  sessionStorage.removeItem(key());
  localStorage.setItem(key(), JSON.stringify({ ...config, token: config.remember ? config.token : '' }));
  if (!config.remember && config.token) sessionStorage.setItem(key(), config.token);
  return config;
}

function assertContext(expectedScope, expectedGeneration) {
  if (!canPrint() || currentLocalScope() !== expectedScope || generation !== expectedGeneration)
    throw new Error('帳號或店鋪已變更，請重新操作');
}

async function runOperation(config, data, output, expectedScope = scope, expectedGeneration = generation) {
  if (active) {
    output.textContent = '已有印表機操作進行中，請稍候';
    return false;
  }
  const controller = new AbortController();
  try {
    assertContext(expectedScope, expectedGeneration);
    if (!config.enabled) throw new Error('請先到「管理 → 印表機」啟用並儲存設定');
    active = controller;
    updateControls();
    output.textContent = data ? '正在傳送，請勿關閉頁面…' : '正在查詢印表機…';
    const result = await printerRequest({ ...config, data, signal: controller.signal });
    assertContext(expectedScope, expectedGeneration);
    output.textContent = data
      ? `已傳送 ${result.bytes.toLocaleString()} bytes 至印表機，請確認實際出紙。`
      : `印表機${result.offline ? '離線' : '已連線'}（狀態 0x${result.raw.toString(16).padStart(2, '0')}）`;
    return true;
  } catch (error) {
    if (currentLocalScope() === expectedScope && generation === expectedGeneration)
      output.textContent = error.message;
    return false;
  } finally {
    if (active === controller) active = null;
    updateControls();
  }
}

function createPreview() {
  document.querySelector('#printer-preview')?.remove();
  const modal = document.createElement('div');
  modal.id = 'printer-preview';
  modal.className = 'modal active';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '列印預覽');
  // Keep background clicks from discarding a preview or hiding an in-flight job.
  modal.onclick = () => {};
  modal.innerHTML = `<div class="modal-content printer-dialog">
    <div class="modal-header"><h3>列印預覽</h3><button type="button" class="close-btn" aria-label="關閉列印預覽">×</button></div>
    <div class="modal-body"><p>每次列印一份。送出後無法撤回；補印前請先確認紙張。</p>
      <div class="receipt-preview" aria-label="單據預覽"></div>
      <div class="printer-actions receipt-pages" hidden><button type="button" class="btn receipt-previous">上一頁</button><span class="receipt-page-label" role="status"></span><button type="button" class="btn receipt-next">下一頁</button></div>
      <details><summary>單據文字內容</summary><pre class="receipt-text"></pre></details>
      <p id="printer-result" role="status" aria-live="polite">正在讀取訂單…</p></div>
    <div class="modal-footer"><button type="button" class="btn" id="printer-send" disabled>列印一份</button><button type="button" class="btn printer-close">關閉</button></div>
  </div>`;
  modal
    .querySelectorAll('.close-btn, .printer-close')
    .forEach((button) => button.addEventListener('click', () => modal.remove()));
  document.body.append(modal);
  return modal;
}

export async function previewOrder(orderId, test = false) {
  if (!canPrint() || active || element('printer-preview')) return;
  const expectedScope = scope;
  const expectedGeneration = generation;
  const config = readConfig();
  const modal = createPreview();
  const output = modal.querySelector('#printer-result');
  try {
    const order = test
      ? {
          orderId: '中文測試',
          customerName: '繁體中文測試',
          deliveryType: '自取',
          deliveryDate: '測試日期',
          items: [
            { productName: '原味餅・禮盒（長品名換行測試）', quantity: 2, unitPrice: 50, subtotal: 100 },
          ],
          totalAmount: 100,
          depositAmount: 30,
          remainingAmount: 70,
          status: '測試單',
        }
      : await call('getOrderDetails', orderId);
    assertContext(expectedScope, expectedGeneration);
    if (!modal.isConnected) return;
    const receipt = await renderReceipt(order, config, state.allProducts);
    assertContext(expectedScope, expectedGeneration);
    if (!modal.isConnected) return;
    let page = 0;
    function showPage() {
      modal.querySelector('.receipt-preview').replaceChildren(...receipt.previewPage(page));
      modal.querySelector('.receipt-page-label').textContent =
        `${page + 1} / ${receipt.pageCount} 頁（列印會連續輸出整張單）`;
      modal.querySelector('.receipt-previous').disabled = page === 0;
      modal.querySelector('.receipt-next').disabled = page === receipt.pageCount - 1;
    }
    modal.querySelector('.receipt-pages').hidden = receipt.pageCount === 1;
    modal.querySelector('.receipt-previous').onclick = () => {
      page--;
      showPage();
    };
    modal.querySelector('.receipt-next').onclick = () => {
      page++;
      showPage();
    };
    showPage();
    modal.querySelector('.receipt-text').textContent = receipt.text;
    output.textContent = config.enabled
      ? `寬度 ${config.width} 點，${config.cut ? '進紙半切' : '僅進紙，不切紙'}。請確認內容。`
      : '請先到「管理 → 印表機」啟用並儲存設定';
    const send = modal.querySelector('#printer-send');
    send.dataset.ready = String(Boolean(config.enabled));
    send.disabled = !config.enabled || Boolean(active);
    send.addEventListener(
      'click',
      async () => {
        if (send.disabled || active) return;
        // Each preview authorizes one attempt only. Reopen to deliberately reprint.
        send.disabled = true;
        send.dataset.ready = 'false';
        const success = await runOperation(config, receipt, output, expectedScope, expectedGeneration);
        send.disabled = true;
        send.textContent = success ? '已傳送' : '請關閉並確認紙張後重試';
        // Also retain the outcome if this dialog was closed while the operation ran.
        if (currentLocalScope() === expectedScope && generation === expectedGeneration)
          element('printer-status').textContent = output.textContent;
        if (!modal.isConnected && currentLocalScope() === expectedScope && generation === expectedGeneration)
          showAlert(output.textContent, success ? 'success' : 'warning', 8000);
      },
      { once: true },
    );
  } catch (error) {
    output.textContent = error.message;
  }
}

export function addOrderPrintButton(container, orderId) {
  if (!canPrint()) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.textContent = '列印訂單';
  button.dataset.printerOrder = orderId;
  button.disabled = Boolean(active);
  button.addEventListener('click', () => previewOrder(orderId));
  container.prepend(button);
}

export function offerOrderPrint(orderId) {
  const banner = element('printer-last-order');
  if (!orderId || !canPrint()) return;
  banner.replaceChildren();
  const message = document.createElement('span');
  message.textContent = `訂單 ${orderId} 已建立`;
  banner.append(message);
  addOrderPrintButton(banner, orderId);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn';
  close.textContent = '關閉';
  close.onclick = () => {
    banner.hidden = true;
  };
  banner.append(close);
  banner.hidden = false;
}

export function initializePrinter() {
  function clearSession() {
    if (scope) {
      try {
        sessionStorage.removeItem(key());
      } catch {
        /* Storage may be unavailable. */
      }
    }
    generation++;
    active?.abort();
    element('printer-preview')?.remove();
    element('printer-last-order').hidden = true;
  }
  function syncContext() {
    const nextScope = currentLocalScope();
    const nextRole = document.body.dataset.shopRole || '';
    if (nextScope === scope && nextRole === role) return;
    clearSession();
    scope = nextScope;
    role = nextRole;
    loadSettings();
  }
  scope = currentLocalScope();
  role = document.body.dataset.shopRole || '';
  loadSettings();
  new MutationObserver(syncContext).observe(document.body, {
    attributes: true,
    attributeFilter: ['data-user-id', 'data-shop-id', 'data-shop-role'],
  });
  window.addEventListener('pos:shop-changed', syncContext);
  window.addEventListener('pos:session-ending', () => {
    clearSession();
    element('printer-token').value = '';
  });
  window.addEventListener('pagehide', () => active?.abort());
  element('printer-settings').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      saveSettings();
      element('printer-status').textContent = '已儲存此帳號、店鋪在本機的印表機設定';
    } catch (error) {
      element('printer-status').textContent = error.message;
    }
  });
  element('printer-check').addEventListener('click', () => {
    try {
      const config = saveSettings();
      void runOperation(config, undefined, element('printer-status'));
    } catch (error) {
      element('printer-status').textContent = error.message;
    }
  });
  element('printer-test').addEventListener('click', () => {
    try {
      saveSettings();
      void previewOrder('', true);
    } catch (error) {
      element('printer-status').textContent = error.message;
    }
  });
}
