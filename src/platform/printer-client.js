export const MAX_PRINT_BYTES = 8 * 1024 * 1024;
const messages = {
  unauthorized: '裝置金鑰不正確',
  busy: '印表機忙碌，請稍後手動重試',
  printer_unreachable: '橋接裝置無法連接印表機',
  status_timeout: '印表機狀態查詢逾時',
  job_too_large: '單據超過橋接裝置允許的大小',
  partial_send: '資料傳送中斷',
};

export function validatePrinterUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('請輸入有效的 WSS 位址');
  }
  if (
    url.protocol !== 'wss:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/ws'
  ) {
    throw new Error('請使用 wss://裝置位址/ws，勿包含帳密或查詢參數');
  }
  return url.href;
}

/** One connection per operation. Never replay bytes after a lost acknowledgement. */
export async function printerRequest({ url, token, data, signal, timeoutMs = 15000 }) {
  url = validatePrinterUrl(url);
  if (!token) throw new Error('請先設定裝置存取金鑰');
  const length = data?.byteLength;
  if (
    data !== undefined &&
    ((!(data instanceof Uint8Array) && typeof data?.chunks !== 'function') ||
      !Number.isInteger(length) ||
      length < 1 ||
      length > MAX_PRINT_BYTES)
  ) {
    throw new Error('列印資料必須為 1 byte 至 8 MiB');
  }
  const ws = new WebSocket(url);
  let outputAttempted = false;
  function wait(send) {
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        signal?.removeEventListener('abort', abort);
      };
      const finish = (error, result) => {
        cleanup();
        error ? reject(error) : resolve(result);
      };
      const abort = () => finish(new Error('操作已取消'));
      ws.onerror = () => finish(new Error('WSS 連線失敗，請確認位址、CA 信任及區域網路權限'));
      ws.onclose = () => finish(new Error('印表機連線已中斷'));
      timer = setTimeout(() => finish(new Error('印表機回應逾時')), timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      if (!send) ws.onopen = () => finish(null);
      else {
        ws.onmessage = (event) => {
          try {
            const result = JSON.parse(event.data);
            if (result.event === 'error') throw new Error(messages[result.code] || '印表機拒絕此操作');
            finish(null, result);
          } catch (error) {
            finish(error);
          }
        };
        try {
          send();
        } catch (error) {
          finish(error);
        }
      }
    });
  }
  async function exchange(payload, expected) {
    const result = await wait(() =>
      ws.send(payload instanceof Uint8Array ? payload : JSON.stringify(payload)),
    );
    if (result?.event !== expected) throw new Error('印表機回應格式不正確');
    return result;
  }
  try {
    await wait();
    const ready = await exchange({ type: 'auth', token }, 'ready');
    if (data === undefined) {
      const result = await exchange({ type: 'status' }, 'status');
      if (
        !Number.isInteger(result.raw) ||
        result.raw < 0 ||
        result.raw > 255 ||
        typeof result.offline !== 'boolean'
      ) {
        throw new Error('印表機狀態格式不正確');
      }
      return result;
    }
    if (!Number.isInteger(ready.maxChunk) || ready.maxChunk < 1) throw new Error('印表機分塊設定不正確');
    // Older bridge firmware advertises no maxJob and is limited to 1 MiB.
    const deviceLimit = ready.maxJob ?? 1024 * 1024;
    if (!Number.isInteger(deviceLimit) || deviceLimit < 1) throw new Error('印表機工作大小設定不正確');
    if (length > deviceLimit) throw new Error('此橋接韌體不支援這張長單，請更新至 8 MiB 版本');
    const chunkSize = Math.min(4096, ready.maxChunk);
    await exchange({ type: 'begin' }, 'started');
    let total = 0;
    // Generate only the next raster band after the previous band is acknowledged.
    const source = data instanceof Uint8Array ? [data] : data.chunks();
    for (const part of source) {
      if (signal?.aborted) throw new Error('操作已取消');
      if (!(part instanceof Uint8Array) || total + part.length > length) throw new Error('列印資料長度不符');
      for (let offset = 0; offset < part.length; offset += chunkSize) {
        const chunk = part.subarray(offset, offset + chunkSize);
        outputAttempted = true;
        const ack = await exchange(chunk, 'chunk');
        total += chunk.length;
        if (ack.bytes !== chunk.length || ack.total !== total) throw new Error('列印資料確認長度不符');
      }
    }
    if (total !== length) throw new Error('列印資料長度不符');
    const result = await exchange({ type: 'end' }, 'sent');
    if (result.bytes !== length) throw new Error('列印完成長度不符');
    return result;
  } catch (error) {
    if (outputAttempted) throw new Error(`${error.message}。可能已部分列印，請確認紙張；不會自動重送。`);
    throw error;
  } finally {
    ws.close();
  }
}
