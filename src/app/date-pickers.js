import { state } from './state.js';

export function initSearchDatepicker() {
  if (state.searchDatepickerInstance) return;
  const el = document.getElementById('searchDate');
  if (!el) return;
  state.searchDatepickerInstance = new AirDatepicker(el, {
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
  state.overrideDatepickerInstance = new AirDatepicker(el, {
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
  state.demandDatepickerInstance = new AirDatepicker(el, {
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
