import { printerRequest, validatePrinterUrl } from '../platform/printer-client.js';
import { diagnosePrinter } from '../platform/printer-diagnostics.js';
import { call } from '../platform/rpc.js';
import { currentLocalScope } from './drafts.js';
import { renderReceipt } from './receipt.js';
import { state } from './state.js';
import { showAlert } from './feedback.js';

const defaults = {
  enabled: false,
  url: 'wss://xprinter.local/ws',
  title: '',
  width: 576,
  fontSize: 28,
  cut: false,
  token: '',
  remember: false,
};
let scope = '';
let role = '';
let active = null;
let generation = 0;
let bridgeConfig = null;
let statusController = null;
let connectionState = 'unknown';
const automaticOrders = new Set();
const bridgeFields = [
  'printer-target-ip',
  'printer-target-port',
  'printer-device-save',
  'printer-wifi-ssid',
  'printer-wifi-password',
  'printer-wifi-save',
];
const key = () => `ginJiaPos.printer.${scope}`;
const canPrint = () =>
  Boolean(currentLocalScope()) && ['owner', 'editor'].includes(document.body.dataset.shopRole);
const element = (id) => document.getElementById(id);

function updatePrinterBadge(nextState = connectionState) {
  connectionState = nextState;
  const badge = element('firebasePrinterStatus');
  if (!badge) return;
  badge.hidden = !canPrint() || !readConfig().enabled;
  const labels = {
    unknown: '印表機：尚未確認連線',
    checking: '印表機：檢查連線中',
    online: '印表機：已連線',
    offline: '印表機：離線或無法連線',
  };
  badge.dataset.state = nextState;
  badge.disabled = nextState === 'checking';
  badge.title = labels[nextState] + '；點擊檢查狀態';
  badge.querySelector('.sr-only').textContent = badge.title;
}

async function refreshPrinterBadge() {
  updatePrinterBadge();
  if (
    !element('firebasePrinterStatus') ||
    !canPrint() ||
    !readConfig().enabled ||
    document.hidden ||
    active ||
    statusController ||
    element('printer-preview')
  )
    return;
  const expectedGeneration = generation;
  const controller = new AbortController();
  statusController = controller;
  updatePrinterBadge('checking');
  try {
    const result = await printerRequest({ ...readConfig(), signal: controller.signal });
    if (!controller.signal.aborted && generation === expectedGeneration)
      updatePrinterBadge(result.offline ? 'offline' : 'online');
  } catch {
    if (!controller.signal.aborted && generation === expectedGeneration) updatePrinterBadge('offline');
  } finally {
    if (statusController === controller) statusController = null;
  }
}

function selectPrinterPage(name) {
  for (const page of ['print', 'device']) {
    element('printer-page-' + page).hidden = page !== name;
    element('printer-tab-' + page).setAttribute('aria-pressed', String(page === name));
  }
}

function readConfig() {
  try {
    const config = { ...defaults, ...JSON.parse(localStorage.getItem(key()) || '{}') };
    if (config.url === 'wss://xiao-printer.local/ws') config.url = defaults.url;
    config.token = config.remember ? config.token : sessionStorage.getItem(key()) || '';
    return config;
  } catch {
    return { ...defaults };
  }
}

function loadSettings() {
  clearBridgeConfig();
  const config = readConfig();
  for (const field of ['enabled', 'url', 'title', 'width', 'fontSize', 'cut', 'token', 'remember']) {
    const input = element('printer-' + field);
    if (input.type === 'checkbox') input.checked = Boolean(config[field]);
    else input.value = config[field];
  }
  element('printer-status').textContent = canPrint() ? '尚未檢查連線' : '僅 owner／editor 可設定及操作列印';
  updateControls();
  updatePrinterBadge('unknown');
}

function updateControls() {
  if (active && statusController) {
    statusController.abort();
    statusController = null;
    updatePrinterBadge('unknown');
  }
  document
    .querySelectorAll(
      '#printer-settings input, #printer-settings select, #printer-settings button, [data-printer-order], #printer-send',
    )
    .forEach((control) => {
      control.disabled =
        !canPrint() ||
        Boolean(active) ||
        (control.id === 'printer-send' && control.dataset.ready !== 'true') ||
        (bridgeFields.includes(control.id) && (!bridgeConfig || bridgeConfig.wifiState === 'testing'));
    });
}

function clearBridgeConfig() {
  bridgeConfig = null;
  for (const id of ['printer-target-ip', 'printer-target-port', 'printer-wifi-ssid', 'printer-wifi-password'])
    element(id).value = '';
  element('printer-device-info').textContent = '';
  element('printer-device-status').textContent = '尚未讀取裝置設定';
}

async function configureBridge(type) {
  if (!canPrint() || active) return;
  const output = element('printer-device-status');
  if (element('printer-preview')) {
    output.textContent = '請先關閉列印預覽，再變更或讀取裝置設定';
    return;
  }
  const expectedScope = scope;
  const expectedGeneration = generation;
  const controller = new AbortController();
  try {
    if (type !== 'get_config' && !bridgeConfig) throw new Error('請先讀取 ESP32 設定');
    const command =
      type === 'set_config'
        ? {
            type,
            printerIp: element('printer-target-ip').value.trim(),
            printerPort: Number(element('printer-target-port').value),
            revision: bridgeConfig.revision,
          }
        : type === 'set_wifi'
          ? {
              type,
              ssid: element('printer-wifi-ssid').value,
              password: element('printer-wifi-password').value,
              wifiRevision: bridgeConfig.wifiRevision,
            }
          : { type };
    const url = validatePrinterUrl(element('printer-url').value.trim());
    const token = element('printer-token').value.trim();
    active = controller;
    updateControls();
    output.textContent = type === 'get_config' ? '正在讀取裝置…' : '正在傳送裝置設定…';
    const result = await printerRequest({ url, token, command, signal: controller.signal });
    assertContext(expectedScope, expectedGeneration);
    if (type === 'set_wifi') {
      clearBridgeConfig();
      output.textContent =
        '正在切換 Wi-Fi，尚未確認成功。請等候 30–60 秒，連到新網路後重新讀取設定。失敗會退回原網路。';
    } else {
      bridgeConfig = result;
      element('printer-target-ip').value = result.printerIp;
      element('printer-target-port').value = result.printerPort;
      element('printer-wifi-ssid').value = result.wifiSsid;
      element('printer-device-info').textContent =
        `${result.bridgeHost} · ${result.bridgeIp} · ${result.wifiSsid}`;
      const wifiStates = {
        testing: '正在試連 Wi-Fi，請稍後重新讀取。',
        saved: '新 Wi-Fi 已連線並保存。',
        rolled_back: '新 Wi-Fi 試連失敗，已退回原設定。',
        save_failed: 'Wi-Fi 保存失敗，已退回原設定。',
      };
      output.textContent =
        (type === 'set_config' ? '已儲存網路設定，請再檢查連線。' : '已讀取裝置設定。') +
        (wifiStates[result.wifiState] || '');
    }
  } catch (error) {
    if (currentLocalScope() === expectedScope && generation === expectedGeneration) {
      // A write acknowledgement may be lost. Require a fresh read before another attempt.
      bridgeConfig = null;
      output.textContent = error.message;
    }
  } finally {
    element('printer-wifi-password').value = '';
    if (active === controller) active = null;
    updateControls();
  }
}

function saveSettings() {
  if (!canPrint() || active) throw new Error('目前無法變更印表機設定');
  const config = {};
  for (const field of ['enabled', 'url', 'title', 'width', 'fontSize', 'cut', 'token', 'remember']) {
    const input = element('printer-' + field);
    config[field] = input.type === 'checkbox' ? input.checked : input.value.trim();
  }
  config.url = validatePrinterUrl(config.url);
  config.width = Number(config.width);
  config.fontSize = Number(config.fontSize);
  if (config.enabled && !config.token) {
    selectPrinterPage('device');
    element('printer-token').focus();
    throw new Error('請先輸入裝置金鑰，再儲存設定');
  }
  // Remove any previously remembered secret before writing the chosen persistence mode.
  localStorage.removeItem(key());
  sessionStorage.removeItem(key());
  localStorage.setItem(key(), JSON.stringify({ ...config, token: config.remember ? config.token : '' }));
  if (!config.remember && config.token) sessionStorage.setItem(key(), config.token);
  statusController?.abort();
  statusController = null;
  updatePrinterBadge('unknown');
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
    if (!config.enabled) throw new Error('請先到「管理 → 出單機」啟用並儲存設定');
    active = controller;
    updateControls();
    updatePrinterBadge('checking');
    output.textContent = data ? '正在傳送，請勿關閉頁面…' : '正在查詢印表機…';
    const result = await printerRequest({ ...config, data, signal: controller.signal });
    assertContext(expectedScope, expectedGeneration);
    updatePrinterBadge(result.offline ? 'offline' : 'online');
    output.textContent = data
      ? `已傳送 ${result.bytes.toLocaleString()} bytes 至印表機，請確認實際出紙。`
      : `印表機${result.offline ? '離線' : '已連線'}（狀態 0x${result.raw.toString(16).padStart(2, '0')}）`;
    return true;
  } catch (error) {
    if (currentLocalScope() === expectedScope && generation === expectedGeneration) {
      updatePrinterBadge('offline');
      output.textContent = error.message;
    }
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
      ? `字體 ${config.fontSize} 點，寬度 ${config.width} 點，${config.cut ? '進紙半切' : '僅進紙，不切紙'}。請確認內容。`
      : '請先到「管理 → 出單機」啟用並儲存設定';
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
  if (readConfig().enabled) void autoPrintOrder(orderId, banner);
}

async function autoPrintOrder(orderId, banner) {
  const identity = `${generation}:${orderId}`;
  if (automaticOrders.has(identity)) return;
  automaticOrders.add(identity);
  const output = document.createElement('span');
  output.setAttribute('role', 'status');
  banner.append(output);
  if (active || element('printer-preview')) {
    output.textContent = '目前有列印操作，請稍後手動列印此訂單。';
    return;
  }
  const expectedScope = scope;
  const expectedGeneration = generation;
  const config = readConfig();
  const controller = new AbortController();
  active = controller;
  updateControls();
  output.textContent = '正在準備出單…';
  try {
    const order = await call('getOrderDetails', orderId);
    assertContext(expectedScope, expectedGeneration);
    if (controller.signal.aborted) return;
    const receipt = await renderReceipt(order, config, state.allProducts);
    assertContext(expectedScope, expectedGeneration);
    if (controller.signal.aborted) return;
    active = null;
    await runOperation(config, receipt, output, expectedScope, expectedGeneration);
  } catch (error) {
    if (currentLocalScope() === expectedScope && generation === expectedGeneration)
      output.textContent = `訂單已成立，列印未完成：${error.message}`;
  } finally {
    if (active === controller) active = null;
    if (currentLocalScope() === expectedScope && generation === expectedGeneration) {
      element('printer-status').textContent = output.textContent;
      if (!banner.isConnected || banner.hidden) showAlert(output.textContent, 'info', 8000);
    }
    updateControls();
  }
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
    statusController?.abort();
    statusController = null;
    updatePrinterBadge('unknown');
    automaticOrders.clear();
    active?.abort();
    element('printer-preview')?.remove();
    element('printer-last-order').hidden = true;
    clearBridgeConfig();
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
  document.addEventListener('click', (event) => {
    if (event.target.closest('#firebasePrinterStatus')) void refreshPrinterBadge();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      statusController?.abort();
      statusController = null;
      updatePrinterBadge('unknown');
    }
  });
  window.addEventListener('offline', () => {
    statusController?.abort();
    statusController = null;
    updatePrinterBadge('offline');
  });
  for (const name of ['print', 'device'])
    element('printer-tab-' + name).addEventListener('click', () => selectPrinterPage(name));
  new MutationObserver(syncContext).observe(document.body, {
    attributes: true,
    attributeFilter: ['data-user-id', 'data-shop-id', 'data-shop-role'],
  });
  window.addEventListener('pos:shop-changed', syncContext);
  window.addEventListener('pos:session-ending', () => {
    clearSession();
    if (element('firebasePrinterStatus')) element('firebasePrinterStatus').hidden = true;
    element('printer-token').value = '';
  });
  window.addEventListener('pagehide', () => {
    active?.abort();
    statusController?.abort();
    statusController = null;
    updatePrinterBadge('unknown');
  });
  for (const id of ['printer-url', 'printer-token'])
    element(id).addEventListener('input', () => {
      clearBridgeConfig();
      updateControls();
    });
  element('printer-use-name').addEventListener('click', () => {
    element('printer-url').value = defaults.url;
    clearBridgeConfig();
    updateControls();
    element('printer-status').textContent = '已填入固定名稱，請檢查連線並儲存';
  });
  element('printer-device-read').addEventListener('click', () => void configureBridge('get_config'));
  element('printer-device-save').addEventListener('click', () => void configureBridge('set_config'));
  element('printer-wifi-save').addEventListener('click', () => void configureBridge('set_wifi'));
  element('printer-settings').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      saveSettings();
      element('printer-status').textContent = '已儲存此裝置的出單設定';
    } catch (error) {
      element('printer-status').textContent = error.message;
    }
  });
  element('printer-check').addEventListener('click', () => {
    try {
      const config = saveSettings();
      void runOperation({ ...config, enabled: true }, undefined, element('printer-status'));
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
  element('printer-diagnose').addEventListener('click', async () => {
    if (active || !canPrint()) return;
    const expectedGeneration = generation;
    const controller = new AbortController();
    const output = element('printer-diagnostic-result');
    active = controller;
    updateControls();
    output.hidden = false;
    try {
      await diagnosePrinter(element('printer-url').value.trim(), {
        signal: controller.signal,
        report: (text) => {
          if (generation === expectedGeneration) output.textContent = text;
        },
      });
    } catch (error) {
      if (generation === expectedGeneration) output.textContent = error.message;
    } finally {
      if (active === controller) active = null;
      updateControls();
    }
  });
}
