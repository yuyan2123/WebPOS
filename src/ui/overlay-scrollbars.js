// Draw controls above the existing scrollers; never wrap or resize application content.
function initializeOverlayScrollbars() {
  if (document.getElementById('overlayScrollbars')) return;
  const layer = document.createElement('div');
  layer.id = 'overlayScrollbars';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  document.documentElement.classList.add('overlay-scrollbars-ready');
  const entries = new Map();
  const observed = new Set();
  let pending = 0;
  let scanTimer = 0;
  let hideTimer = 0;
  let movingUntil = 0;
  let hovered = null;
  let drag = null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const isRoot = (target) => target === document.scrollingElement;
  const resize = new ResizeObserver(() => schedule());

  function schedule() {
    if (!pending) pending = requestAnimationFrame(update);
  }
  function requestScan() {
    schedule();
    if (!scanTimer) scanTimer = setTimeout(scan, 80);
  }
  function activate(entry) {
    entry.activeUntil = performance.now() + 1100;
    schedule();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(schedule, 1150);
  }
  function scroll(entry, axis, value) {
    const target = entry.target;
    target.scrollTo({
      left: axis === 'x' ? value : target.scrollLeft,
      top: axis === 'y' ? value : target.scrollTop,
      behavior: 'instant',
    });
    activate(entry);
  }
  function finishDrag() {
    if (!drag) return;
    const ended = drag;
    drag = null;
    ended.track.classList.remove('is-dragging');
    if (ended.track.hasPointerCapture(ended.pointerId)) ended.track.releasePointerCapture(ended.pointerId);
    activate(ended.entry);
  }
  function createTrack(entry, axis) {
    const track = document.createElement('div');
    track.className = `overlay-scrollbar overlay-scrollbar-${axis}`;
    track.dataset.axis = axis;
    // Diagnostic association only; no new IDs or wrappers on application elements.
    track.dataset.scrollTarget = entry.target.id || entry.target.tagName.toLowerCase();
    const thumb = document.createElement('div');
    thumb.className = 'overlay-scrollbar-thumb';
    track.append(thumb);
    track.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !entry.geometry[axis]) return;
      event.preventDefault();
      event.stopPropagation();
      finishDrag();
      const geometry = entry.geometry[axis];
      const position = axis === 'y' ? event.clientY : event.clientX;
      if (event.target !== thumb) {
        scroll(
          entry,
          axis,
          clamp((position - geometry.start - geometry.thumb / 2) / geometry.travel, 0, 1) * geometry.max,
        );
      }
      drag = {
        entry,
        axis,
        track,
        pointerId: event.pointerId,
        position,
        value: axis === 'y' ? entry.target.scrollTop : entry.target.scrollLeft,
      };
      track.classList.add('is-dragging');
      track.setPointerCapture(event.pointerId);
      activate(entry);
    });
    track.addEventListener('pointermove', (event) => {
      if (drag?.track !== track || drag.pointerId !== event.pointerId) return;
      const geometry = entry.geometry[axis];
      if (!geometry) return finishDrag();
      const position = axis === 'y' ? event.clientY : event.clientX;
      scroll(
        entry,
        axis,
        clamp(drag.value + ((position - drag.position) * geometry.max) / geometry.travel, 0, geometry.max),
      );
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      track.addEventListener(name, (event) => {
        if (drag?.pointerId === event.pointerId) finishDrag();
      });
    }
    track.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? entry.target.clientHeight : 1;
        const delta = axis === 'x' ? event.deltaX || event.deltaY : event.deltaY;
        scroll(entry, axis, (axis === 'x' ? entry.target.scrollLeft : entry.target.scrollTop) + delta * unit);
      },
      { passive: false },
    );
    layer.append(track);
    return { track, thumb };
  }

  function scan() {
    clearTimeout(scanTimer);
    scanTimer = 0;
    const candidates = new Set([document.scrollingElement]);
    for (const target of document.body.querySelectorAll('*')) {
      if (!(target instanceof HTMLElement) || layer.contains(target) || target.tagName === 'SELECT') continue;
      const style = getComputedStyle(target);
      if (/(auto|scroll)/.test(style.overflowX + style.overflowY)) candidates.add(target);
    }
    for (const [target, entry] of entries) {
      if (candidates.has(target) && target.isConnected) continue;
      if (drag?.entry === entry) finishDrag();
      entry.x.track.remove();
      entry.y.track.remove();
      if (entry.tabIndexAdded && target.getAttribute('tabindex') === '0') target.removeAttribute('tabindex');
      entries.delete(target);
    }
    for (const target of candidates) {
      if (!target || entries.has(target)) continue;
      const entry = { target, geometry: {}, activeUntil: 0, tabIndexAdded: false };
      entry.x = createTrack(entry, 'x');
      entry.y = createTrack(entry, 'y');
      entries.set(target, entry);
    }
    const nextObserved = new Set();
    for (const target of candidates) {
      if (!target) continue;
      nextObserved.add(target);
      for (const child of target.children) if (child !== layer) nextObserved.add(child);
    }
    for (const target of observed)
      if (!nextObserved.has(target)) {
        resize.unobserve(target);
        observed.delete(target);
      }
    for (const target of nextObserved)
      if (!observed.has(target)) {
        resize.observe(target);
        observed.add(target);
      }
    schedule();
  }

  function visibleBounds(target) {
    const viewport = window.visualViewport;
    let left = viewport?.offsetLeft || 0;
    let top = viewport?.offsetTop || 0;
    let right = left + (viewport?.width || innerWidth);
    let bottom = top + (viewport?.height || innerHeight);
    if (isRoot(target)) return { left, top, right, bottom };
    if (
      !target.getClientRects().length ||
      target.closest('[inert]') ||
      getComputedStyle(target).visibility === 'hidden'
    )
      return null;
    for (let node = target; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (node === target || /(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        left = Math.max(left, rect.left + node.clientLeft);
        right = Math.min(right, rect.left + node.clientLeft + node.clientWidth);
      }
      if (node === target || /(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        top = Math.max(top, rect.top + node.clientTop);
        bottom = Math.min(bottom, rect.top + node.clientTop + node.clientHeight);
      }
    }
    return right - left > 24 && bottom - top > 24 ? { left, top, right, bottom } : null;
  }
  function unobstructed(target, x, y) {
    const hit = document.elementsFromPoint(x, y).find((node) => !layer.contains(node));
    return hit && (target === hit || target.contains(hit));
  }
  function update() {
    pending = 0;
    const now = performance.now();
    for (const entry of entries.values()) {
      const { target } = entry;
      const bounds = visibleBounds(target);
      const style = getComputedStyle(target);
      const axes = {
        x:
          (isRoot(target) || /(auto|scroll)/.test(style.overflowX)) &&
          target.scrollWidth > target.clientWidth + 1,
        y:
          (isRoot(target) || /(auto|scroll)/.test(style.overflowY)) &&
          target.scrollHeight > target.clientHeight + 1,
      };
      if (
        bounds &&
        (axes.x || axes.y) &&
        !isRoot(target) &&
        target.tabIndex < 0 &&
        !target.hasAttribute('tabindex')
      ) {
        target.tabIndex = 0;
        entry.tabIndexAdded = true;
      } else if (!axes.x && !axes.y && entry.tabIndexAdded && target.getAttribute('tabindex') === '0') {
        target.removeAttribute('tabindex');
        entry.tabIndexAdded = false;
      }
      for (const axis of ['x', 'y']) {
        const { track, thumb } = entry[axis];
        let visible = bounds && axes[axis];
        if (visible) {
          const vertical = axis === 'y';
          const length =
            (vertical ? bounds.bottom - bounds.top : bounds.right - bounds.left) -
            8 -
            (axes[vertical ? 'x' : 'y'] ? 12 : 0);
          const client = vertical ? target.clientHeight : target.clientWidth;
          const total = vertical ? target.scrollHeight : target.scrollWidth;
          const thumbLength = Math.min(length, Math.max(28, (length * client) / total));
          const max = total - client;
          const travel = length - thumbLength;
          const position = clamp(vertical ? target.scrollTop : target.scrollLeft, 0, max);
          const left = vertical ? bounds.right - 13 : bounds.left + 4;
          const top = vertical ? bounds.top + 4 : bounds.bottom - 13;
          visible =
            travel > 0 &&
            unobstructed(target, left + (vertical ? 5 : length / 2), top + (vertical ? length / 2 : 5));
          if (visible) {
            Object.assign(track.style, {
              left: `${left}px`,
              top: `${top}px`,
              width: `${vertical ? 12 : length}px`,
              height: `${vertical ? length : 12}px`,
            });
            Object.assign(thumb.style, {
              width: vertical ? '' : `${thumbLength}px`,
              height: vertical ? `${thumbLength}px` : '',
              transform: `translate${vertical ? 'Y' : 'X'}(${(position / max) * travel}px)`,
            });
            entry.geometry[axis] = { start: vertical ? top : left, thumb: thumbLength, travel, max };
          }
        }
        track.hidden = !visible;
        if (!visible) {
          delete entry.geometry[axis];
          if (drag?.entry === entry && drag.axis === axis) finishDrag();
        }
        track.classList.toggle(
          'is-visible',
          Boolean(
            visible &&
            (entry.activeUntil > now ||
              target.contains(hovered) ||
              (!isRoot(target) && target.contains(document.activeElement)) ||
              drag?.entry === entry),
          ),
        );
      }
    }
    if (now < movingUntil) schedule();
  }

  new MutationObserver((records) => {
    if (records.some((record) => !layer.contains(record.target))) requestScan();
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'inert', 'open'],
  });
  document.addEventListener(
    'scroll',
    (event) => {
      const entry = entries.get(event.target === document ? document.scrollingElement : event.target);
      if (entry) activate(entry);
      schedule();
    },
    true,
  );
  document.addEventListener(
    'pointermove',
    (event) => {
      if (layer.contains(event.target)) return;
      hovered = event.pointerType === 'touch' ? null : event.target;
      schedule();
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => {
    hovered = null;
    schedule();
  });
  document.addEventListener(
    'click',
    (event) => {
      // A scrollbar belongs to its scroller, not to an outside-click dismissal area.
      if (layer.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  for (const name of ['input', 'focusin', 'focusout', 'load'])
    document.addEventListener(name, schedule, true);
  for (const name of ['transitionrun', 'animationstart', 'transitionend', 'animationend']) {
    document.addEventListener(
      name,
      (event) => {
        if (layer.contains(event.target)) return;
        movingUntil = performance.now() + 650;
        schedule();
      },
      true,
    );
  }
  window.addEventListener('resize', requestScan);
  window.visualViewport?.addEventListener('resize', requestScan);
  window.visualViewport?.addEventListener('scroll', schedule);
  document.fonts?.ready.then(requestScan);
  scan();
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', initializeOverlayScrollbars, { once: true });
else initializeOverlayScrollbars();
