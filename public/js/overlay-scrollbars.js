"use strict";
(() => {
  // src/ui/overlay-scrollbars.js
  function initializeOverlayScrollbars() {
    if (document.getElementById("overlayScrollbars")) return;
    const layer = document.createElement("div");
    layer.id = "overlayScrollbars";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    document.documentElement.classList.add("overlay-scrollbars-ready");
    const entries = /* @__PURE__ */ new Map();
    const observed = /* @__PURE__ */ new Set();
    const scanRoots = /* @__PURE__ */ new Map();
    const motions = /* @__PURE__ */ new Map();
    let pending = 0;
    let scanTimer = 0;
    let hideTimer = 0;
    let hovered = null;
    let drag = null;
    const touchDevice = window.matchMedia("(any-pointer: coarse)");
    function syncDevice() {
      layer.classList.toggle("is-touch-device", touchDevice.matches);
      schedule();
    }
    touchDevice.addEventListener("change", syncDevice);
    syncDevice();
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const isRoot = (target) => target === document.scrollingElement;
    const resize = new ResizeObserver(() => invalidate());
    function schedule() {
      if (!pending) pending = requestAnimationFrame(update);
    }
    function invalidate(target = null, descendantsOnly = false) {
      for (const entry of entries.values()) {
        if (!target || target.contains(entry.target) || !descendantsOnly && entry.target.contains(target))
          entry.dirty = true;
      }
      schedule();
    }
    function requestScan(target = document.body, subtree = true) {
      if (!(target instanceof HTMLElement) || !target.isConnected || layer.contains(target)) return;
      scanRoots.set(target, subtree || scanRoots.get(target) || false);
      invalidate();
      if (!scanTimer) scanTimer = setTimeout(scan, 80);
    }
    function writeStyles(target, styles) {
      for (const [name, value] of Object.entries(styles))
        if (target.style[name] !== value) target.style[name] = value;
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
        left: axis === "x" ? value : target.scrollLeft,
        top: axis === "y" ? value : target.scrollTop,
        behavior: "instant"
      });
      activate(entry);
    }
    function finishDrag() {
      if (!drag) return;
      const ended = drag;
      drag = null;
      ended.track.classList.remove("is-dragging");
      if (ended.track.hasPointerCapture(ended.pointerId)) ended.track.releasePointerCapture(ended.pointerId);
      activate(ended.entry);
    }
    function createTrack(entry, axis) {
      const track = document.createElement("div");
      track.className = `overlay-scrollbar overlay-scrollbar-${axis}`;
      track.dataset.axis = axis;
      track.dataset.scrollTarget = entry.target.id || entry.target.tagName.toLowerCase();
      const thumb = document.createElement("div");
      thumb.className = "overlay-scrollbar-thumb";
      track.append(thumb);
      track.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || !entry.geometry[axis]) return;
        event.preventDefault();
        event.stopPropagation();
        finishDrag();
        const geometry = entry.geometry[axis];
        const position = axis === "y" ? event.clientY : event.clientX;
        if (event.target !== thumb) {
          scroll(
            entry,
            axis,
            clamp((position - geometry.start - geometry.thumb / 2) / geometry.travel, 0, 1) * geometry.max
          );
        }
        drag = {
          entry,
          axis,
          track,
          pointerId: event.pointerId,
          position,
          value: axis === "y" ? entry.target.scrollTop : entry.target.scrollLeft
        };
        track.classList.add("is-dragging");
        track.setPointerCapture(event.pointerId);
        activate(entry);
      });
      track.addEventListener("pointermove", (event) => {
        if (drag?.track !== track || drag.pointerId !== event.pointerId) return;
        const geometry = entry.geometry[axis];
        if (!geometry) return finishDrag();
        const position = axis === "y" ? event.clientY : event.clientX;
        scroll(
          entry,
          axis,
          clamp(drag.value + (position - drag.position) * geometry.max / geometry.travel, 0, geometry.max)
        );
      });
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
        track.addEventListener(name, (event) => {
          if (drag?.pointerId === event.pointerId) finishDrag();
        });
      }
      track.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? entry.target.clientHeight : 1;
          const delta = axis === "x" ? event.deltaX || event.deltaY : event.deltaY;
          scroll(entry, axis, (axis === "x" ? entry.target.scrollLeft : entry.target.scrollTop) + delta * unit);
        },
        { passive: false }
      );
      layer.append(track);
      return { track, thumb };
    }
    function scan() {
      clearTimeout(scanTimer);
      scanTimer = 0;
      function inspect(target) {
        if (!(target instanceof HTMLElement) || layer.contains(target) || target.tagName === "SELECT") return;
        const style = getComputedStyle(target);
        const scrollable = isRoot(target) || /(auto|scroll)/.test(style.overflowX + style.overflowY);
        const existing = entries.get(target);
        if (scrollable && !existing) {
          const entry = { target, geometry: {}, activeUntil: 0, tabIndexAdded: false, dirty: true };
          entry.x = createTrack(entry, "x");
          entry.y = createTrack(entry, "y");
          entries.set(target, entry);
        } else if (!scrollable && existing) remove(existing);
      }
      function remove(entry) {
        if (drag?.entry === entry) finishDrag();
        entry.x.track.remove();
        entry.y.track.remove();
        if (entry.tabIndexAdded && entry.target.getAttribute("tabindex") === "0")
          entry.target.removeAttribute("tabindex");
        entries.delete(entry.target);
      }
      inspect(document.scrollingElement);
      for (const [root, subtree] of scanRoots) {
        if (!root.isConnected) continue;
        let covered = false;
        for (let parent = root.parentElement; parent; parent = parent.parentElement) {
          if (scanRoots.get(parent)) {
            covered = true;
            break;
          }
        }
        if (covered) continue;
        inspect(root);
        if (subtree) for (const target of root.querySelectorAll("*")) inspect(target);
      }
      scanRoots.clear();
      for (const [target, entry] of entries) {
        if (!target.isConnected) remove(entry);
      }
      const nextObserved = /* @__PURE__ */ new Set();
      for (const target of entries.keys()) {
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
      if (!target.getClientRects().length || target.closest("[inert]") || getComputedStyle(target).visibility === "hidden")
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
      const writes = [];
      let moving = false;
      for (const target of motions.keys()) if (!target.isConnected) motions.delete(target);
      for (const entry of entries.values()) {
        const { target } = entry;
        for (const animated of motions.keys()) {
          if (animated === target || animated.contains(target)) {
            entry.dirty = true;
            moving = true;
            break;
          }
        }
        if (entry.dirty) measure(entry, writes);
        for (const axis of ["x", "y"]) {
          const { track, thumb } = entry[axis];
          const geometry = entry.geometry[axis];
          const active = Boolean(
            geometry && (entry.activeUntil > now || !touchDevice.matches && (target.contains(hovered) || !isRoot(target) && target.contains(document.activeElement)) || drag?.entry === entry)
          );
          const position = geometry && clamp(axis === "y" ? target.scrollTop : target.scrollLeft, 0, geometry.max);
          writes.push(() => {
            if (geometry)
              writeStyles(thumb, {
                transform: `translate${axis === "y" ? "Y" : "X"}(${position / geometry.max * geometry.travel}px)`
              });
            if (track.hidden !== !geometry) track.hidden = !geometry;
            if (track.classList.contains("is-visible") !== active) track.classList.toggle("is-visible", active);
          });
        }
      }
      writes.forEach((write) => write());
      if (moving) schedule();
    }
    function measure(entry, writes) {
      const { target } = entry;
      entry.dirty = false;
      const bounds = visibleBounds(target);
      const style = getComputedStyle(target);
      const axes = {
        x: (isRoot(target) || /(auto|scroll)/.test(style.overflowX)) && target.scrollWidth > target.clientWidth + 1,
        y: (isRoot(target) || /(auto|scroll)/.test(style.overflowY)) && target.scrollHeight > target.clientHeight + 1
      };
      entry.overflowing = axes.x || axes.y;
      if (bounds && (axes.x || axes.y) && !isRoot(target) && target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
        writes.push(() => {
          target.tabIndex = 0;
        });
        entry.tabIndexAdded = true;
      } else if (!axes.x && !axes.y && entry.tabIndexAdded && target.getAttribute("tabindex") === "0") {
        writes.push(() => target.removeAttribute("tabindex"));
        entry.tabIndexAdded = false;
      }
      for (const axis of ["x", "y"]) {
        const { track, thumb } = entry[axis];
        let visible = bounds && axes[axis];
        if (visible) {
          const vertical = axis === "y";
          const length = (vertical ? bounds.bottom - bounds.top : bounds.right - bounds.left) - 8 - (axes[vertical ? "x" : "y"] ? 12 : 0);
          const client = vertical ? target.clientHeight : target.clientWidth;
          const total = vertical ? target.scrollHeight : target.scrollWidth;
          const thumbLength = Math.min(length, Math.max(28, length * client / total));
          const max = total - client;
          const travel = length - thumbLength;
          const left = vertical ? bounds.right - 13 : bounds.left + 4;
          const top = vertical ? bounds.top + 4 : bounds.bottom - 13;
          visible = travel > 0 && unobstructed(target, left + (vertical ? 5 : length / 2), top + (vertical ? length / 2 : 5));
          if (visible) {
            writes.push(() => {
              writeStyles(track, {
                left: `${left}px`,
                top: `${top}px`,
                width: `${vertical ? 12 : length}px`,
                height: `${vertical ? length : 12}px`
              });
              writeStyles(thumb, {
                width: vertical ? "" : `${thumbLength}px`,
                height: vertical ? `${thumbLength}px` : ""
              });
            });
            entry.geometry[axis] = { start: vertical ? top : left, thumb: thumbLength, travel, max };
          }
        }
        if (!visible) {
          delete entry.geometry[axis];
          if (drag?.entry === entry && drag.axis === axis) finishDrag();
        }
      }
    }
    new MutationObserver((records) => {
      for (const record of records) {
        if (!(record.target instanceof Element) || record.target.closest("#overlayScrollbars,.product-order-floating,.cart-removal-layer"))
          continue;
        invalidate();
        if (record.type === "attributes") requestScan(record.target, false);
        else for (const node of record.addedNodes) if (node instanceof HTMLElement) requestScan(node);
      }
      if (!scanTimer && [...entries.keys()].some((target) => !target.isConnected))
        scanTimer = setTimeout(scan, 80);
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "inert", "open"]
    });
    document.addEventListener(
      "scroll",
      (event) => {
        const entry = entries.get(event.target === document ? document.scrollingElement : event.target);
        if (entry) activate(entry);
        for (const child of entries.values())
          if (child !== entry && child.overflowing && entry?.target.contains(child.target)) child.dirty = true;
        schedule();
      },
      true
    );
    document.addEventListener(
      "pointermove",
      (event) => {
        if (layer.contains(event.target)) return;
        let target = event.pointerType === "touch" ? null : event.target;
        while (target && !entries.has(target)) target = target.parentElement;
        if (hovered === target) return;
        hovered = target;
        schedule();
      },
      { passive: true }
    );
    document.addEventListener("pointerleave", () => {
      hovered = null;
      schedule();
    });
    document.addEventListener(
      "click",
      (event) => {
        if (layer.contains(event.target)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true
    );
    for (const name of ["focusin", "focusout"]) document.addEventListener(name, schedule, true);
    document.addEventListener("input", (event) => invalidate(event.target), true);
    document.addEventListener("load", () => invalidate(), true);
    for (const name of [
      "transitionstart",
      "animationstart",
      "transitionend",
      "animationend",
      "transitioncancel",
      "animationcancel"
    ]) {
      document.addEventListener(
        name,
        (event) => {
          if (layer.contains(event.target)) return;
          const target = event.target;
          const key = event.type.startsWith("transition") ? `transition:${event.propertyName}` : `animation:${event.animationName}`;
          if (event.type.endsWith("start")) {
            if (event.propertyName === "opacity" || /color|shadow/.test(event.propertyName || "")) return;
            if (!motions.has(target)) motions.set(target, /* @__PURE__ */ new Set());
            motions.get(target).add(key);
          } else {
            motions.get(target)?.delete(key);
            if (!motions.get(target)?.size) motions.delete(target);
          }
          invalidate(target, true);
        },
        true
      );
    }
    window.addEventListener("resize", () => requestScan());
    window.visualViewport?.addEventListener("resize", () => requestScan());
    window.visualViewport?.addEventListener("scroll", () => invalidate());
    document.fonts?.ready.then(() => requestScan());
    scanRoots.set(document.body, true);
    scan();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initializeOverlayScrollbars, { once: true });
  else initializeOverlayScrollbars();
})();
