import { state } from './state.js';

export function createDatepicker(el, options) {
  const mobile = window.matchMedia('(max-width: 899px), (pointer: coarse)');
  const picker = new AirDatepicker(el, {
    ...options,
    isMobile: mobile.matches,
    buttons: [...(options.buttons || []), { content: '關閉', onClick: (dp) => dp.hide() }],
  });
  // The library's mouseup handler refocuses the input after every calendar action.
  // Keep its pointer state without moving focus away from the user's chosen control.
  picker.$datepicker.removeEventListener('mouseup', picker._onMouseUp);
  picker._onMouseUp = () => {
    picker.inFocus = false;
  };
  picker.$datepicker.addEventListener('mouseup', picker._onMouseUp);
  mobile.addEventListener('change', () => picker.update({ isMobile: mobile.matches }));
  return picker;
}

export function initSearchDatepicker() {
  if (state.searchDatepickerInstance) return;
  const el = document.getElementById('searchDate');
  if (!el) return;
  state.searchDatepickerInstance = createDatepicker(el, {
    locale: state.demandDateLocaleZh,
    dateFormat: 'yyyy-MM-dd',
    autoClose: true,
    buttons: [
      {
        content: '今天',
        onClick: function (dp) {
          dp.selectDate(new Date());
        },
      },
      {
        content: '清除',
        onClick: function (dp) {
          dp.clear();
        },
      },
    ],
  });
}

export function initOverrideDatepicker() {
  if (state.overrideDatepickerInstance) return;
  var el = document.getElementById('overrideDate');
  if (!el) return;
  state.overrideDatepickerInstance = createDatepicker(el, {
    locale: state.demandDateLocaleZh,
    range: true,
    dateFormat: 'yyyy-MM-dd',
    multipleDatesSeparator: ' ~ ',
    autoClose: true,
    buttons: [
      {
        content: '今天',
        onClick: function (dp) {
          dp.selectDate(new Date());
          dp.selectDate(new Date());
        },
      },
      {
        content: '清除',
        onClick: function (dp) {
          dp.clear();
        },
      },
    ],
  });
}

export function initDemandDatepicker() {
  if (state.demandDatepickerInstance) return;
  const el = document.getElementById('demandDatePicker');
  if (!el) return;
  state.demandDatepickerInstance = createDatepicker(el, {
    locale: state.demandDateLocaleZh,
    range: true,
    dateFormat: 'yyyy-MM-dd',
    multipleDatesSeparator: ' ~ ',
    autoClose: true,
    buttons: [
      {
        content: '今天',
        onClick: (dp) => {
          dp.selectDate(new Date());
          dp.selectDate(new Date());
        },
      },
      {
        content: '清除',
        onClick: (dp) => {
          dp.clear();
        },
      },
    ],
  });
}
