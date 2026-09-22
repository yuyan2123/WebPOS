import { state } from './state.js';
import { call } from '../platform/rpc.js';
import { handleProductsLoaded } from './catalog.js';
import { showAlert } from './feedback.js';

let dismiss = null;
export function closeProductOrder() {
  dismiss?.();
}

export function showProductOrder() {
  if (document.body.dataset.shopRole === 'viewer' || document.getElementById('productOrderModal')) return;
  const shopId = document.body.dataset.shopId;
  let draft = [...state.allProducts];
  let expected = draft.map((p) => p.productId);
  let busy = false;
  let drag = null;
  let frame = 0;
  let backdropPressed = false;
  let finishDrop = null;
  const motions = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const modal = document.createElement('div');
  modal.id = 'productOrderModal';
  modal.className = 'modal active';
  modal.setAttribute('aria-labelledby', 'productOrderTitle');
  modal.innerHTML = `<div class="modal-content product-order-content">
    <div class="product-order-heading"><h3 id="productOrderTitle">調整商品順序</h3><button type="button" data-close aria-label="關閉排序視窗">×</button></div>
    <ol class="product-order-list" aria-label="商品排序"></ol>
    <span class="sr-only" data-announcement aria-live="polite"></span>
    <p class="product-order-error" role="status" hidden></p>
    <div class="product-order-footer"><button type="button" data-reload>重新載入（捨棄調整）</button><div><button type="button" data-cancel>取消</button><button type="button" data-save>儲存順序</button></div></div>
  </div>`;
  const list = modal.querySelector('ol');
  const message = modal.querySelector('[role="status"]');
  const announcement = modal.querySelector('[data-announcement]');
  const save = modal.querySelector('[data-save]');
  const rows = new Map();
  const sameShop = () => document.body.dataset.shopId === shopId;
  const changed = () => draft.some((p, index) => p.productId !== expected[index]);

  function controls() {
    modal.querySelectorAll('.product-order-content button').forEach((button) => {
      button.disabled = busy;
    });
    draft.forEach((p, index) => {
      const row = rows.get(p.productId);
      row.querySelector('[data-up]').disabled = busy || index === 0;
      row.querySelector('[data-down]').disabled = busy || index === draft.length - 1;
      row.querySelector('.product-order-position').textContent = String(index + 1);
      if (drag?.id === p.productId) {
        drag.overlay.querySelector('.product-order-position').textContent = String(index + 1);
      }
    });
    save.disabled = busy || !changed();
    save.textContent = busy ? '處理中…' : '儲存順序';
    modal.setAttribute('aria-busy', String(busy));
  }

  function move(from, to) {
    if (from === to || to < 0 || to >= draft.length) return;
    const before = new Map([...rows.values()].map((row) => [row, row.getBoundingClientRect().top]));
    motions.forEach((animation) => animation.cancel());
    motions.clear();
    const [product] = draft.splice(from, 1);
    draft.splice(to, 0, product);
    const row = rows.get(product.productId);
    list.insertBefore(row, from < to ? list.children[to].nextSibling : list.children[to]);
    controls();
    if (!reducedMotion.matches) {
      for (const [item, top] of before) {
        if (item.dataset.productId === drag?.id) continue;
        const distance = top - item.getBoundingClientRect().top;
        if (Math.abs(distance) < 1) continue;
        const animation = item.animate(
          [{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0)' }],
          { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        );
        motions.set(item, animation);
        animation.finished
          .then(() => {
            if (motions.get(item) === animation) motions.delete(item);
          })
          .catch(() => {});
      }
    }
    announcement.textContent = `${product.productName} 已移至第 ${to + 1} 項，尚未儲存。`;
  }

  function render() {
    rows.clear();
    list.replaceChildren();
    draft.forEach((p) => {
      const row = document.createElement('li');
      row.dataset.productId = p.productId;
      row.innerHTML = `<button type="button" class="product-order-handle"><i class="fas fa-grip-vertical" aria-hidden="true"></i></button><span class="product-order-position"></span><div class="product-order-info"><strong></strong><span></span></div><div class="product-order-actions"><button type="button" data-up>↑</button><button type="button" data-down>↓</button></div>`;
      row.querySelector('strong').textContent = p.productName;
      row.querySelector('.product-order-info span').textContent = `${p.category || '未分類'} · ${p.status}`;
      row
        .querySelector('.product-order-handle')
        .setAttribute('aria-label', `拖曳排序 ${p.productName}（鍵盤可用上下方向鍵）`);
      row.querySelector('[data-up]').setAttribute('aria-label', `上移 ${p.productName}`);
      row.querySelector('[data-down]').setAttribute('aria-label', `下移 ${p.productName}`);
      row.addEventListener('click', (event) => {
        const button = event.target.closest('[data-up],[data-down]');
        if (!button || busy || drag) return;
        finishDrop?.();
        const index = draft.findIndex((item) => item.productId === p.productId);
        move(index, index + (button.hasAttribute('data-up') ? -1 : 1));
        (button.disabled ? row.querySelector('.product-order-handle') : button).focus({
          preventScroll: true,
        });
        row.scrollIntoView({ block: 'nearest' });
      });
      row.querySelector('.product-order-handle').addEventListener('keydown', (event) => {
        if (busy || drag || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        finishDrop?.();
        event.preventDefault();
        const index = draft.findIndex((item) => item.productId === p.productId);
        move(index, index + (event.key === 'ArrowUp' ? -1 : 1));
        row.querySelector('.product-order-handle').focus({ preventScroll: true });
        row.scrollIntoView({ block: 'nearest' });
      });
      rows.set(p.productId, row);
      list.append(row);
    });
    message.hidden = true;
    message.textContent = '';
    if (!draft.length) {
      const empty = document.createElement('li');
      empty.textContent = '尚無商品可排序。';
      list.append(empty);
    }
    controls();
  }

  function stopDrag(animateDrop = false) {
    cancelAnimationFrame(frame);
    finishDrop?.();
    if (!drag) return;
    const ended = drag;
    drag = null;
    if (modal.hasPointerCapture(ended.pointerId)) modal.releasePointerCapture(ended.pointerId);
    const row = rows.get(ended.id);
    const overlay = ended.overlay;
    let animation;
    const clean = () => {
      animation?.cancel();
      overlay.remove();
      row?.classList.remove('is-dragging');
      if (finishDrop === clean) finishDrop = null;
    };
    finishDrop = clean;
    if (!animateDrop || reducedMotion.matches || !row?.isConnected) {
      clean();
      return;
    }
    const start = overlay.getBoundingClientRect();
    const target = row.getBoundingClientRect();
    const x = ended.x - ended.startX;
    const y = ended.y - ended.startY;
    animation = overlay.animate(
      [
        { transform: `translate(${x}px, ${y}px) scale(1.02)` },
        {
          transform: `translate(${x + target.left - start.left}px, ${y + target.top - start.top}px) scale(1)`,
        },
      ],
      { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' },
    );
    animation.finished
      .then(() => {
        clean();
        if (row.isConnected)
          row.animate(
            [
              { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
              { backgroundColor: '#fafaf9', borderColor: '#e7e5e4' },
            ],
            { duration: 450, easing: 'ease-out' },
          );
      })
      .catch(() => {});
  }
  function dragFrame() {
    if (!drag) return;
    const bounds = list.getBoundingClientRect();
    drag.overlay.style.transform = `translate(${drag.x - drag.startX}px, ${drag.y - drag.startY}px) scale(1.02)`;
    if (drag.y < bounds.top + 45) list.scrollTop -= 9;
    else if (drag.y > bounds.bottom - 45) list.scrollTop += 9;
    const index = draft.findIndex((p) => p.productId === drag.id);
    let target = index;
    for (let i = 0; i < draft.length; i++) {
      // Hit-test final layout positions, not animated positions, to avoid swapping back mid-animation.
      const row = rows.get(draft[i].productId);
      const center = bounds.top + row.offsetTop - list.scrollTop + row.offsetHeight / 2;
      if (i < index && drag.y < center) {
        target = i;
        break;
      }
      if (i > index && drag.y > center) target = i;
    }
    move(index, target);
    frame = requestAnimationFrame(dragFrame);
  }
  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.product-order-handle');
    if (!handle || busy || drag || event.button !== 0) return;
    finishDrop?.();
    motions.forEach((animation) => animation.cancel());
    motions.clear();
    event.preventDefault();
    handle.focus();
    const row = handle.closest('li');
    const rect = row.getBoundingClientRect();
    const modalRect = modal.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'product-order-floating';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    overlay.innerHTML = row.innerHTML;
    overlay.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
      button.tabIndex = -1;
    });
    Object.assign(overlay.style, {
      left: `${rect.left - modalRect.left}px`,
      top: `${rect.top - modalRect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    modal.append(overlay);
    drag = {
      id: row.dataset.productId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      overlay,
    };
    row.classList.add('is-dragging');
    modal.setPointerCapture(event.pointerId);
    frame = requestAnimationFrame(dragFrame);
  });
  modal.addEventListener('pointermove', (event) => {
    if (drag?.pointerId === event.pointerId) {
      drag.x = event.clientX;
      drag.y = event.clientY;
    }
  });
  modal.addEventListener('pointerup', (event) => {
    if (drag?.pointerId === event.pointerId) stopDrag(true);
  });
  modal.addEventListener('pointercancel', () => stopDrag());
  modal.addEventListener('lostpointercapture', () => {
    if (drag) stopDrag();
  });
  modal.addEventListener('pointerdown', (event) => {
    backdropPressed = event.target === modal;
  });

  dismiss = () => {
    if (busy) return;
    stopDrag();
    motions.forEach((animation) => animation.cancel());
    modal.classList.remove('active');
    modal.remove();
    dismiss = null;
  };
  modal.onclick = (event) => {
    if ((event.target === modal && backdropPressed) || event.target.closest('[data-close],[data-cancel]'))
      closeProductOrder();
  };
  modal.querySelector('[data-reload]').onclick = async () => {
    if (busy) return;
    if (!sameShop()) {
      closeProductOrder();
      return;
    }
    stopDrag();
    busy = true;
    controls();
    try {
      const products = await call('getProducts');
      if (!sameShop()) return;
      if (!Array.isArray(products)) throw new Error('商品資料不完整，請重試。');
      draft = [...products];
      expected = draft.map((p) => p.productId);
      handleProductsLoaded(products, { skipDraft: true });
      render();
    } catch (error) {
      message.textContent = `重新載入失敗，已保留調整：${error.message}`;
      message.hidden = false;
    } finally {
      busy = false;
      controls();
      if (!sameShop()) closeProductOrder();
    }
  };
  save.onclick = async () => {
    if (busy || !changed()) return;
    if (!sameShop()) {
      closeProductOrder();
      return;
    }
    stopDrag();
    busy = true;
    controls();
    try {
      const result = await call('saveProductOrder', {
        productIds: draft.map((p) => p.productId),
        expectedProductIds: expected,
      });
      if (!result?.success || !Array.isArray(result.products))
        throw new Error('儲存結果不完整，請重新載入確認。');
      if (sameShop()) {
        handleProductsLoaded(result.products, { skipDraft: true });
        showAlert('商品順序已儲存，商品管理與 POS 已同步', 'success');
      }
      busy = false;
      closeProductOrder();
    } catch (error) {
      message.textContent = `未能確認儲存，已保留調整：${error.message}`;
      message.hidden = false;
    } finally {
      busy = false;
      if (modal.isConnected) controls();
      if (!sameShop()) closeProductOrder();
    }
  };
  render();
  document.body.append(modal);
}
