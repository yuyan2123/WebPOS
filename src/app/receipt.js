import { MAX_PRINT_BYTES } from '../platform/printer-client.js';
const PAGE_BANDS = 4;
const clean = (value) =>
  Array.from(String(value ?? ''), (char) =>
    char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char,
  )
    .join('')
    .trim();
const money = (value) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new Error('訂單金額格式不正確');
  return `NT$ ${number.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
};

/** GS v 0, normal resolution; MSB is the leftmost pixel (XP-80 manual §62). */
export function rasterBand(canvas) {
  const context = canvas.getContext('2d');
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const rowBytes = canvas.width / 8;
  const data = new Uint8Array(8 + rowBytes * canvas.height);
  data.set([0x1d, 0x76, 0x30, 0, rowBytes & 255, rowBytes >> 8, canvas.height & 255, canvas.height >> 8]);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      const black =
        pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114 < 160;
      if (black) data[8 + y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = black ? 0 : 255;
      pixels.data[index + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return data;
}

export async function renderReceipt(order, config, products = []) {
  if (!Array.isArray(order.items)) throw new Error('訂單明細不完整，請重新載入');
  const width = Number(config.width);
  if (![384, 512, 576].includes(width)) throw new Error('列印寬度不正確');
  const fontSize = Number(config.fontSize ?? 32);
  if (![24, 28, 32, 40].includes(fontSize)) throw new Error('列印字體大小不正確');
  const lineHeight = Math.ceil(fontSize * 1.4);
  const topTrim = 4;
  const extraBottomFeed = Math.ceil(lineHeight / 2);
  const bandLines = Math.max(1, Math.floor(238 / lineHeight));
  await document.fonts.ready;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${fontSize}px system-ui, sans-serif`;
  const lines = [];
  // Manual §52: the default vertical motion unit is one print dot.
  const ending = config.cut
    ? new Uint8Array([0x1d, 0x56, 66, 16 + extraBottomFeed])
    : new Uint8Array([0x1b, 0x4a, extraBottomFeed, 0x1b, 0x64, 4]);
  const byteLengthFor = (count) =>
    5 + (count * lineHeight - topTrim) * (width / 8) + Math.ceil(count / bandLines) * 8 + ending.length;
  function pushLine(line) {
    if (byteLengthFor(lines.length + 1) > MAX_PRINT_BYTES) throw new Error('單據超過 8 MiB，請縮短內容');
    lines.push(line);
  }
  function add(value = '') {
    const text = clean(value);
    let line = '';
    for (const char of text) {
      if (measure.measureText(line + char).width > width - 32 && line) {
        pushLine(line);
        line = '';
      }
      line += char;
    }
    pushLine(line);
  }
  if (config.title) add(config.title);
  add('訂單明細單');
  add(`訂單：${order.orderId || order.id || '測試單'}`);
  add(`列印：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`);
  add(`客戶：${order.customerName || '-'}`);
  if (order.customerContactType === 'line' || order.customerLineId) add('聯絡方式：LINE');
  else if (order.customerContactValue || order.customerPhone)
    add(`電話：${order.customerContactValue || order.customerPhone}`);
  add(`交貨：${order.deliveryDate || '-'} / ${order.deliveryType || '-'}`);
  if (order.deliveryType !== '自取') {
    if (order.recipientName || order.recipientPhone)
      add(`收件人：${order.recipientName || ''} ${order.recipientPhone || ''}`);
    if (order.customerAddress) add(`地址：${order.customerAddress}`);
  }
  add(`狀態：${order.status || '-'}`);
  pushLine(null); // A graphical rule occupies one row regardless of platform font.
  order.items.forEach((item) => {
    add(item.productName || '未命名商品');
    add(`${item.quantity} × ${money(item.unitPrice)} = ${money(item.subtotal)}`);
    if (item.isGiftBox && item.giftBoxDetails) {
      for (const [id, quantity] of Object.entries(item.giftBoxDetails.products || {})) {
        const name = products.find((product) => product.productId === id)?.productName || `商品 ${id}`;
        add(`  ${name}：每盒 ${quantity} 個`);
      }
      if (item.giftBoxDetails.notes) add(`備註：${item.giftBoxDetails.notes}`);
    }
    if (item.notes) add(`備註：${item.notes}`);
  });
  pushLine(null); // A graphical rule occupies one row regardless of platform font.
  add(`運費：${money(order.shippingFee)}`);
  if (order.shippingNotes) add(order.shippingNotes);
  add(`總金額：${money(order.totalAmount)}`);
  add(`已付訂金：${money(order.depositAmount)}`);
  add(`剩餘金額：${money(order.remainingAmount ?? order.totalAmount)}`);
  if (order.notes) add(`備註：${order.notes}`);
  add('此單為訂單明細，非統一發票');
  function drawBand(start) {
    const group = lines.slice(start, start + bandLines);
    const trim = start === 0 ? topTrim : 0;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = group.length * lineHeight - trim;
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = measure.font;
    ctx.textBaseline = 'top';
    group.forEach((line, index) => {
      if (line === null)
        ctx.fillRect(16, index * lineHeight + Math.floor(lineHeight / 2) - trim, width - 32, 2);
      else ctx.fillText(line, 16, index * lineHeight + 4 - trim);
    });
    return { canvas, bytes: rasterBand(canvas) };
  }
  return {
    byteLength: byteLengthFor(lines.length),
    text: lines.map((line) => line ?? '────────').join('\n'),
    pageCount: Math.ceil(lines.length / (bandLines * PAGE_BANDS)),
    previewPage(page) {
      const start = page * bandLines * PAGE_BANDS;
      const bands = [];
      for (
        let offset = start;
        offset < Math.min(lines.length, start + bandLines * PAGE_BANDS);
        offset += bandLines
      ) {
        bands.push(drawBand(offset).canvas);
      }
      return bands;
    },
    *chunks() {
      yield new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 0]);
      for (let start = 0; start < lines.length; start += bandLines) {
        yield drawBand(start).bytes;
      }
      // Manual §53: feed to cutter plus n units, then partial cut.
      yield ending;
    },
  };
}
