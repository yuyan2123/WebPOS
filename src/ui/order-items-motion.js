const detailSelector = '.order-items-row';

function listRows(container) {
  const table = container.querySelector(':scope > .table-responsive > table');
  return table ? [...(table.tHead?.rows || []), ...table.tBodies[0].rows] : [];
}

// Read the current visual positions before cancelling an interrupted animation.
export function captureOrderItemsFrame(container) {
  const wrapper = container.querySelector(':scope > .table-responsive');
  const rows = new Map();
  const panels = new Map();
  for (const row of listRows(container)) {
    if (!row.matches(detailSelector)) {
      rows.set(row, row.getBoundingClientRect());
      continue;
    }
    const panel = row.querySelector('.order-items-expand');
    panels.set(panel, {
      rect: panel.getBoundingClientRect(),
      opacity: Number(getComputedStyle(panel).opacity),
      height: panel.querySelector('.order-items-scroll').getBoundingClientRect().height,
    });
  }
  return {
    rows,
    panels,
    wrapper: wrapper.getBoundingClientRect(),
    scrollTop: container.closest('main')?.scrollTop,
  };
}

const milliseconds = (value, fallback) => {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number * (value.trim().endsWith('ms') ? 1 : 1000) : fallback;
};

export function animateOrderItemsFrame(container, before, openingRow) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const style = getComputedStyle(container);
  const duration = reduced
    ? 0
    : milliseconds(
        style.getPropertyValue(openingRow ? '--gj-order-items-enter' : '--gj-order-items-exit'),
        openingRow ? 280 : 220,
      );
  const easing = openingRow ? 'cubic-bezier(0.2, 0, 0, 1)' : 'cubic-bezier(0.4, 0, 1, 1)';
  const plans = [];
  const viewport = innerHeight;
  const main = container.closest('main');
  const wrapper = container.querySelector(':scope > .table-responsive');
  const wrapperRect = wrapper.getBoundingClientRect();

  // Keep the item table at its final layout; content playback uses transform/opacity.
  for (const row of listRows(container)) {
    if (!row.matches(detailSelector)) {
      const previous = before.rows.get(row);
      const rect = row.getBoundingClientRect();
      const offset = previous ? previous.top - before.wrapper.top - (rect.top - wrapperRect.top) : 0;
      if (
        Math.abs(offset) > 0.5 &&
        ((previous.bottom >= -160 && previous.top <= viewport + 160) ||
          (rect.bottom >= -160 && rect.top <= viewport + 160))
      ) {
        plans.push({
          element: row,
          id: 'order-list-move',
          from: { transform: `translateY(${offset}px)` },
          to: { transform: 'translateY(0)' },
        });
      }
      continue;
    }
    const panel = row.querySelector('.order-items-expand');
    const closing = row.classList.contains('is-collapsing');
    const previous = before.panels.get(panel);
    const rect = panel.getBoundingClientRect();
    const endY = closing ? -8 : 0;
    const summary = row.previousElementSibling;
    const summaryOffset = before.rows.has(summary)
      ? before.rows.get(summary).top -
        before.wrapper.top -
        (summary.getBoundingClientRect().top - wrapperRect.top)
      : 0;
    const startY = previous
      ? previous.rect.top - before.wrapper.top - (rect.top - wrapperRect.top - endY)
      : summaryOffset - 8;
    plans.push({
      element: panel,
      id: closing ? 'order-items-collapse' : 'order-items-expand',
      from: { transform: `translateY(${startY}px)`, opacity: previous?.opacity ?? 0 },
      to: { transform: `translateY(${endY}px)`, opacity: closing ? 0 : 1 },
    });
  }

  const effects = [];
  let cancelled = false;
  const clear = () => {
    plans.forEach(({ element }) => element.classList.remove('is-order-moving'));
    wrapper.classList.remove('is-order-morphing');
    wrapper.style.height = '';
  };
  const transition = {
    cancel() {
      cancelled = true;
      effects.forEach((effect) => effect.cancel());
      clear();
    },
    finished: null,
  };
  if (duration) {
    const bottomVisible = [before.wrapper.bottom, wrapperRect.bottom].some(
      (bottom) => bottom >= -160 && bottom <= viewport + 160,
    );
    const scrollClamped = main && Math.abs(main.scrollTop - before.scrollTop) > 0.5;
    if (Math.abs(before.wrapper.height - wrapperRect.height) > 0.5 && (bottomVisible || scrollClamped)) {
      // Only this empty flow box resizes; the measured table stays independent
      // of its height while its rows move. Offscreen edges need no per-frame layout.
      // Keeping a visible edge moving also preserves the last row's exit.
      wrapper.style.height = `${wrapperRect.height}px`;
      wrapper.classList.add('is-order-morphing');
      plans.unshift({
        element: wrapper,
        id: 'order-list-resize',
        from: { height: `${before.wrapper.height}px` },
        to: { height: `${wrapperRect.height}px` },
      });
    }
    for (const { element, id, from, to } of plans) {
      if (id !== 'order-list-resize') element.classList.add('is-order-moving');
      effects.push(element.animate([from, to], { id, duration, easing, fill: 'both' }));
    }
    if (main && before.scrollTop !== undefined) main.scrollTop = before.scrollTop;
  }
  transition.finished = Promise.allSettled(effects.map((effect) => effect.finished)).then(() => !cancelled);
  return transition;
}
