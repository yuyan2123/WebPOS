import { validatePrinterUrl } from './printer-client.js';

// No auth, print commands, credentials or automatic fallback. Compare the same
// TLS endpoint through HTTPS and WebSocket inside the failing browser context.
export async function diagnosePrinter(value, { signal, report, timeoutMs = 8000 } = {}) {
  const current = new URL(validatePrinterUrl(value));
  const urls = [current.href];
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(current.hostname)) {
    const named = new URL(current);
    named.hostname = 'xprinter.local';
    urls.push(named.href);
  }
  const lines = [
    `模式：${navigator.standalone || matchMedia('(display-mode: standalone)').matches ? 'PWA' : '瀏覽器'}`,
    `版本：${document.querySelector('meta[name="app-version"]')?.content || '未知'}`,
    `來源：${location.origin}`,
    `安全環境：${window.isSecureContext ? '是' : '否'}`,
    '僅測 TLS／WebSocket 握手，不傳金鑰或列印內容。',
  ];
  const output = (line) => {
    lines.push(line);
    report?.(lines.join('\n'));
  };
  report?.(lines.join('\n'));
  async function probe(label, operation) {
    if (signal?.aborted) throw new Error('診斷已取消');
    const started = performance.now();
    output(`${label}：測試中…`);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    let result;
    try {
      result = await operation(controller.signal);
    } catch {
      result = timedOut ? '逾時' : controller.signal.aborted ? '取消' : '失敗（瀏覽器未提供底層原因）';
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    lines.pop();
    output(`${label}：${result}；${Math.round(performance.now() - started)} ms`);
  }
  for (const url of urls) {
    const https = new URL(url);
    https.protocol = 'https:';
    https.pathname = '/health';
    await probe(`HTTPS ${https.host}`, async (probeSignal) => {
      // Opaque success proves TLS + an HTTP response, not the response status/body.
      await fetch(https.href, {
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        signal: probeSignal,
      });
      return '收到 HTTP 回應（TLS 已通過）';
    });
    await probe(
      `WSS ${https.host}`,
      (probeSignal) =>
        new Promise((resolve, reject) => {
          const ws = new WebSocket(url);
          const finish = (error, result) => {
            ws.onopen = ws.onerror = ws.onclose = null;
            probeSignal.removeEventListener('abort', abort);
            ws.close();
            error ? reject(error) : resolve(result);
          };
          const abort = () => finish(new Error('取消'));
          probeSignal.addEventListener('abort', abort, { once: true });
          ws.onopen = () => finish(null, '握手成功');
          ws.onerror = () => finish(new Error('連線失敗'));
          ws.onclose = (event) => finish(null, `連線關閉 ${event.code}`);
          if (probeSignal.aborted) abort();
        }),
    );
  }
  output('診斷完成。');
  return lines.join('\n');
}
