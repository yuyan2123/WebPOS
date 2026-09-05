import { state } from './state.js';
import { getCapacityIndicatorHtml, loadMonthCapacity } from './capacity.js';
import { setDeliveryDate } from './catalog.js';

export function renderCalendar(skipCapacityLoad) {
  const grid = document.getElementById('calendar-grid');
  const monthYearLabel = document.getElementById('calendar-month-year');
  if (!grid || !monthYearLabel) return;
  grid.innerHTML = '';
  monthYearLabel.innerText = `${state.calendarState.currYear}年 ${state.monthNames[state.calendarState.currMonth]}`;
  const firstDay = new Date(state.calendarState.currYear, state.calendarState.currMonth, 1).getDay();
  const daysInMonth = new Date(state.calendarState.currYear, state.calendarState.currMonth + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    grid.appendChild(emptyCell);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const dayBtn = document.createElement('button');
    dayBtn.type = 'button';
    dayBtn.className = 'calendar-day';
    const thisDateStr = `${state.calendarState.currYear}-${String(state.calendarState.currMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const dayNum = document.createElement('span');
    dayNum.textContent = i;
    dayBtn.appendChild(dayNum);
    dayBtn.dataset.date = thisDateStr;
    dayBtn.setAttribute('aria-label', thisDateStr);
    dayBtn.setAttribute('aria-pressed', String(thisDateStr === state.calendarState.selectedDateStr));
    if (thisDateStr === state.calendarState.selectedDateStr) {
      dayBtn.classList.add('selected');
    }
    const checkDate = new Date(state.calendarState.currYear, state.calendarState.currMonth, i);
    checkDate.setHours(23, 59, 59);
    if (checkDate < new Date().setHours(0, 0, 0, 0)) {
      dayBtn.classList.add('disabled');
      dayBtn.disabled = true;
    } else {
      dayBtn.onclick = () => selectCalendarDate(i);
    }
    grid.appendChild(dayBtn);
  }
  // 將產能指標套用到已渲染的日曆格子
  function applyCapacityIndicators(capData) {
    if (!capData) return;
    const cells = grid.querySelectorAll('.calendar-day');
    cells.forEach(function (cell) {
      const dateStr = cell.dataset.date;
      if (dateStr && capData[dateStr]) {
        const indicator = getCapacityIndicatorHtml(capData[dateStr]);
        const info = capData[dateStr];
        cell.setAttribute(
          'aria-label',
          dateStr +
            (info.hasLimit ? `，已排定 ${info.currentQuantity} 件，上限 ${info.limit} 件` : '，不限供應量'),
        );
        if (indicator) {
          const existing = cell.querySelector('.cap-indicator');
          if (existing) existing.remove();
          cell.insertAdjacentHTML('beforeend', indicator);
        }
      }
    });
  }
  // 快取已有 → 同步套用；否則背景載入後再套用
  const capKey = state.calendarState.currYear + '-' + (state.calendarState.currMonth + 1);
  if (state.monthCapacityCache[capKey]) {
    applyCapacityIndicators(state.monthCapacityCache[capKey]);
  } else if (!skipCapacityLoad) {
    loadMonthCapacity(
      state.calendarState.currYear,
      state.calendarState.currMonth + 1,
      applyCapacityIndicators,
    );
  }
}

export function changeMonth(offset) {
  state.calendarState.currMonth += offset;
  if (state.calendarState.currMonth > 11) {
    state.calendarState.currMonth = 0;
    state.calendarState.currYear++;
  } else if (state.calendarState.currMonth < 0) {
    state.calendarState.currMonth = 11;
    state.calendarState.currYear--;
  }
  renderCalendar();
  document
    .querySelector(`[data-date="${state.calendarState.selectedDateStr}"]`)
    ?.focus({ preventScroll: true });
}

export function selectCalendarDate(day) {
  state.calendarState.selectedDateStr = `${state.calendarState.currYear}-${String(state.calendarState.currMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  renderCalendar();
  const weekDay = new Date(state.calendarState.currYear, state.calendarState.currMonth, day).getDay();
  const weekStr = ['日', '一', '二', '三', '四', '五', '六'][weekDay];
  document.getElementById('selected-date-display').innerHTML =
    `已選擇：<span class="text-blue-600 font-bold text-xl">${state.calendarState.currYear}/${state.calendarState.currMonth + 1}/${day} (週${weekStr})</span>`;
  // 同步到隱藏的原生日期選擇器
  document.getElementById('deliveryDate').value = state.calendarState.selectedDateStr;
  const btn = document.getElementById('btn-confirm-date');
  btn.disabled = false;
  btn.classList.remove('bg-gray-300', 'cursor-not-allowed');
  btn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'shadow-lg');
  btn.innerHTML = `確認日期 <i class="fas fa-check ml-2"></i>`;
}

export function confirmDateSelection() {
  if (!state.calendarState.selectedDateStr) return;
  setDeliveryDate();
}
