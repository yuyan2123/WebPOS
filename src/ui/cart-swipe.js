const actionWidth = 88;
const snapDuration = 180;
const exitDuration = 160;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initializeCartSwipe(body, onDelete) {
  const states = new Map();
  let opened = null;
  let drag = null;
  let suppressClick = false;
  const status = document.getElementById('cartSwipeStatus');
  const announce = (message) => {
    if (status) status.textContent = message;
  };
  const rowFor = (target) => {
    const row = target instanceof Element ? target.closest('[data-cart-item-key]') : null;
    return row && body.contains(row) ? row : null;
  };
  function stateFor(row) {
    if (!states.has(row))
      states.set(row, {
        row,
        front: row.querySelector('.cart-item-card'),
        actions: row.querySelector('.cart-swipe-actions'),
        button: row.querySelector('.cart-swipe-delete'),
        opener: row.querySelector('.cart-delete-btn'),
        offset: 0,
        width: 0,
        base: null,
        snap: null,
        armed: false,
      });
    return states.get(row);
  }
  function paint(state, offset) {
    if (!state.base) {
      state.width = state.row.getBoundingClientRect().width;
      // A paused transform animation avoids style mutations and the app-wide
      // accessibility/scrollbar observers on every pointer movement.
      state.base = state.front.animate(
        [{ transform: 'translateX(0)' }, { transform: `translateX(-${state.width + 1}px)` }],
        { duration: state.width + 1, iterations: Infinity, fill: 'both', easing: 'linear' },
      );
      state.base.pause();
    }
    state.offset = Math.max(0, Math.min(state.width, offset));
    state.base.currentTime = state.offset;
  }
  function disarm(state) {
    if (!state.armed) return;
    state.armed = false;
    state.row.classList.remove('is-swipe-armed');
    state.button.querySelector('span').textContent = '刪除';
  }
  function snap(state, offset) {
    const from = state.base ? Math.max(0, -new DOMMatrix(getComputedStyle(state.front).transform).m41) : 0;
    state.snap?.cancel();
    paint(state, offset);
    const finish = () => {
      if (state.offset === 0) {
        state.base?.cancel();
        state.base = null;
        state.actions.hidden = true;
      }
    };
    if (reducedMotion() || Math.abs(from - offset) < 1) {
      finish();
      return;
    }
    const animation = state.front.animate(
      [{ transform: `translateX(-${from}px)` }, { transform: `translateX(-${offset}px)` }],
      { duration: snapDuration, easing: 'cubic-bezier(.2,0,0,1)' },
    );
    state.snap = animation;
    animation.finished
      .then(() => {
        if (state.snap !== animation) return;
        state.snap = null;
        finish();
      })
      .catch(() => {});
  }
  function close(state, focus = false, animate = true) {
    if (!state) return;
    disarm(state);
    state.row.classList.remove('is-swipe-open', 'is-swiping');
    state.opener.setAttribute('aria-expanded', 'false');
    state.front.inert = false;
    state.actions.inert = true;
    if (animate) snap(state, 0);
    else {
      state.snap?.cancel();
      state.base?.cancel();
      state.snap = state.base = null;
      state.offset = 0;
      state.actions.hidden = true;
    }
    if (opened === state) opened = null;
    if (focus && state.opener.isConnected) state.opener.focus({ preventScroll: true });
  }
  function open(state, focus = false) {
    if (opened && opened !== state) close(opened);
    disarm(state);
    opened = state;
    state.row.classList.remove('is-swiping');
    state.row.classList.add('is-swipe-open');
    state.actions.hidden = false;
    state.actions.inert = false;
    state.front.inert = true;
    state.opener.setAttribute('aria-expanded', 'true');
    snap(state, actionWidth);
    if (focus) state.button.focus({ preventScroll: true });
    announce(`已顯示 ${state.row.dataset.cartItemName} 的刪除按鈕，可按 Escape 收起。`);
  }
  function cancelDrag() {
    if (!drag) return;
    const current = drag;
    drag = null;
    if (current.state.row.hasPointerCapture?.(current.id))
      current.state.row.releasePointerCapture(current.id);
    close(current.state, false, false);
  }
  function down(event) {
    suppressClick = false;
    if (drag && event.pointerId !== drag.id) {
      cancelDrag();
      return;
    }
    const row = rowFor(event.target);
    if (opened && opened.row !== row) close(opened);
    if (
      !row ||
      event.isPrimary === false ||
      event.button !== 0 ||
      event.target.closest('button,a,input,select,textarea')
    )
      return;
    const state = stateFor(row);
    const initial = state.base ? Math.max(0, -new DOMMatrix(getComputedStyle(state.front).transform).m41) : 0;
    state.snap?.cancel();
    state.snap = null;
    paint(state, initial);
    drag = { state, id: event.pointerId, x: event.clientX, y: event.clientY, initial, axis: null };
    if (event.pointerType === 'mouse') event.preventDefault();
  }
  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.state.row.isConnected) {
      cancelDrag();
      return;
    }
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (!drag.axis) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        cancelDrag();
        return;
      }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      drag.axis = 'x';
      drag.state.actions.hidden = false;
      drag.state.actions.inert = true;
      drag.state.row.classList.add('is-swiping');
      try {
        drag.state.row.setPointerCapture(event.pointerId);
      } catch {
        /* Synthetic/ended pointer. */
      }
    }
    event.preventDefault();
    const state = drag.state;
    paint(state, drag.initial - dx);
    const armed = state.offset >= Math.max(actionWidth + 72, state.width * 0.65);
    if (armed !== state.armed) {
      state.armed = armed;
      state.row.classList.toggle('is-swipe-armed', armed);
      state.button.querySelector('span').textContent = armed ? '放開刪除' : '刪除';
      if (armed) announce(`放開即可刪除 ${state.row.dataset.cartItemName}，往右滑回可取消。`);
    }
  }
  function up(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.axis) move(event);
    const current = drag;
    drag = null;
    if (current.state.row.hasPointerCapture?.(current.id))
      current.state.row.releasePointerCapture(current.id);
    if (!current.axis) {
      if (!current.state.offset) close(current.state, false, false);
      return;
    }
    suppressClick = true;
    if (current.state.armed && current.state.row.isConnected) {
      opened = null;
      announce(`已刪除 ${current.state.row.dataset.cartItemName}。`);
      onDelete(current.state.row);
    } else if (current.state.offset >= actionWidth / 2) open(current.state);
    else close(current.state);
  }
  function cancelled(event) {
    if (drag?.id === event.pointerId) cancelDrag();
  }
  function lostCapture(event) {
    // Touch starts with implicit capture on the touched child. Transferring it
    // to the row emits a loss on that child; only losing the row is cancellation.
    if (
      drag?.id === event.pointerId &&
      event.target === drag.state.row &&
      !drag.state.row.hasPointerCapture(event.pointerId)
    )
      cancelDrag();
  }
  function click(event) {
    if (suppressClick && event.detail > 0 && body.contains(event.target)) {
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const row = rowFor(event.target);
    if (!row) return;
    const state = stateFor(row);
    if (event.target.closest('.cart-delete-btn')) {
      event.preventDefault();
      open(state, true);
    } else if (event.target.closest('.cart-swipe-delete') && opened === state) {
      opened = null;
      announce(`已刪除 ${row.dataset.cartItemName}。`);
      onDelete(row);
    } else if (opened === state) close(state, true);
  }
  function keydown(event) {
    if (event.key === 'ArrowLeft' && event.target.closest('.cart-delete-btn')) {
      event.preventDefault();
      open(stateFor(rowFor(event.target)), true);
    } else if (event.key === 'ArrowRight' && opened && opened.row.contains(event.target)) {
      event.preventDefault();
      close(opened, true);
    }
  }
  function reset() {
    cancelDrag();
    states.forEach((state) => close(state, false, false));
    opened = null;
    suppressClick = false;
  }
  document.addEventListener('pointerdown', down, { capture: true });
  document.addEventListener('pointermove', move, { capture: true, passive: false });
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', cancelled, true);
  body.addEventListener('lostpointercapture', lostCapture, true);
  document.addEventListener('click', click, true);
  body.addEventListener('keydown', keydown);
  window.addEventListener('resize', reset);
  return {
    closeOpen() {
      if (!opened && !drag) return false;
      const state = opened || drag.state;
      cancelDrag();
      close(state, true);
      return true;
    },
    reset,
    destroy() {
      reset();
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancelled, true);
      body.removeEventListener('lostpointercapture', lostCapture, true);
      document.removeEventListener('click', click, true);
      body.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', reset);
    },
  };
}

const removalMotions = new WeakMap();
export function cartMotionLayer(body) {
  return removalMotions.get(body)?.layer;
}
export function clearCartRemovalMotion(body) {
  const motion = removalMotions.get(body);
  if (!motion) return;
  motion.animations.forEach((animation) => animation.cancel());
  motion.layer.remove();
  removalMotions.delete(body);
}

export function animateCartRemoval(body, row, remove) {
  if (reducedMotion()) {
    remove();
    return;
  }
  const rows = [...body.querySelectorAll('[data-cart-item-key]')];
  // Read every position before changing the DOM. Subsequent frames animate
  // transforms/opacity only; never animate height, width, padding or margins.
  const before = new Map(rows.map((item) => [item.dataset.cartItemKey, item.getBoundingClientRect().top]));
  const bounds = row.getBoundingClientRect(),
    bodyBounds = body.getBoundingClientRect();
  const frontTransform = getComputedStyle(row.querySelector('.cart-item-card')).transform;
  let motion = removalMotions.get(body);
  if (!motion) {
    const layer = document.createElement('div');
    layer.className = 'cart-removal-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    motion = { layer, animations: new Set() };
    removalMotions.set(body, motion);
  }
  const ghost = row.cloneNode(true);
  ghost.removeAttribute('data-cart-item-key');
  ghost.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  ghost.classList.add('cart-removal-ghost');
  Object.assign(ghost.style, {
    top: `${bounds.top - bodyBounds.top + body.scrollTop}px`,
    left: `${bounds.left - bodyBounds.left + body.scrollLeft}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  });
  ghost.querySelector('.cart-item-card').style.transform = frontTransform;
  remove(); // Counts, pricing and the persisted draft change immediately.
  ghost.style.top = `${bounds.top - bodyBounds.top + body.scrollTop}px`;
  motion.layer.append(ghost);
  if (!motion.layer.isConnected) body.append(motion.layer);
  const after = [...body.querySelectorAll('[data-cart-item-key]')].map((item) => ({
    item,
    delta:
      (before.get(item.dataset.cartItemKey) ?? item.getBoundingClientRect().top) -
      item.getBoundingClientRect().top,
  }));
  function track(animation, done = () => {}) {
    motion.animations.add(animation);
    animation.finished
      .catch(() => {})
      .then(() => {
        motion.animations.delete(animation);
        done();
      });
  }
  track(
    ghost.animate(
      [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: `translateX(-${bounds.width}px)`, opacity: 0 },
      ],
      { duration: exitDuration, easing: 'ease-out', fill: 'forwards' },
    ),
    () => ghost.remove(),
  );
  for (const { item, delta } of after) {
    if (Math.abs(delta) < 1) continue;
    track(
      item.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
        duration: snapDuration,
        easing: 'cubic-bezier(.2,0,0,1)',
      }),
    );
  }
}
