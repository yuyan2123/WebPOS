import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { showAlert } from './feedback.js';
import { escapeHtml, escapeAttr } from './customers.js';
import { applyRoleCapabilities } from './drafts.js';

export function loadCapacitySettings(forceReload) {
  if (state.capacitySettingsLoaded && !forceReload) {
    renderCapacitySettingsUI();
    return;
  }
  if (isConnected()) {
    rpc
      .withSuccessHandler(function (result) {
        state.capacitySettings = result;
        state.capacitySettingsLoaded = true;
        renderCapacitySettingsUI();
      })
      .withFailureHandler(function (error) {
        console.warn('載入產能設定失敗', error);
        state.capacitySettings = { weekday: {}, dateOverrides: [] };
        state.capacitySettingsLoaded = true;
        renderCapacitySettingsUI();
        showAlert('產能設定載入失敗，請重新整理後再試', 'error');
      })
      .getCapacitySettings();
  } else {
    state.capacitySettings = { weekday: {}, dateOverrides: [] };
    state.capacitySettingsLoaded = true;
    renderCapacitySettingsUI();
  }
}

export function renderCapacitySettingsUI() {
  var grid = document.getElementById('capacityWeekdayGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (var i = 0; i < 7; i++) {
    var setting = state.capacitySettings.weekday[i.toString()] || {
      dayOfWeek: i,
      maxQuantity: '',
      enabled: false,
    };
    var isActive = setting.enabled;
    var col = document.createElement('div');
    col.className = 'capacity-day-col' + (isActive ? ' active' : '');
    var val = setting.maxQuantity === '' || setting.maxQuantity === null ? '' : setting.maxQuantity;
    col.innerHTML =
      '<div class="day-name">' +
      escapeHtml(state.weekdayNames[i]) +
      '</div>' +
      '<input type="number" inputmode="numeric" step="1" min="0" placeholder="0" aria-label="星期' +
      escapeAttr(state.weekdayNames[i]) +
      '供應量上限" value="' +
      val +
      '" data-day="' +
      i +
      '" id="capDay' +
      i +
      '">' +
      '<label class="day-toggle" for="capDayEnabled' +
      i +
      '">' +
      '<input type="checkbox" aria-label="啟用星期' +
      escapeAttr(state.weekdayNames[i]) +
      '供應量限制" ' +
      (isActive ? 'checked' : '') +
      ' data-day="' +
      i +
      '" id="capDayEnabled' +
      i +
      '">' +
      '<span class="slider" aria-hidden="true"></span>' +
      '</label>';
    grid.appendChild(col);
  }
  grid.querySelectorAll('input[type="number"], input[type="checkbox"]').forEach(function (el) {
    el.addEventListener('change', function () {
      var checkbox = this;
      if (checkbox.type === 'checkbox') {
        var col = checkbox.closest('.capacity-day-col');
        if (col) {
          col.classList.toggle('active', checkbox.checked);
        }
      }
      debouncedSaveWeekdayCapacity();
    });
  });
  renderOverrideTable();
  applyRoleCapabilities();
}

export function renderOverrideTable() {
  const tbody = document.getElementById('overrideTableBody');
  if (!tbody) return;
  if (!state.capacitySettings.dateOverrides || state.capacitySettings.dateOverrides.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align: center; color: #9ca3af; padding: 24px;">尚無日期覆寫設定</td></tr>';
    return;
  }
  var todayStr = new Date().toISOString().slice(0, 10);
  var upcoming = [];
  var expired = [];
  state.capacitySettings.dateOverrides.forEach(function (o) {
    if (o.date >= todayStr) {
      upcoming.push(o);
    } else {
      expired.push(o);
    }
  });
  upcoming.sort(function (a, b) {
    return a.date.localeCompare(b.date);
  });
  expired.sort(function (a, b) {
    return a.date.localeCompare(b.date);
  });
  var sorted = upcoming.concat(expired);
  tbody.innerHTML = sorted
    .map(function (o) {
      var isExpired = o.date < todayStr;
      var d = new Date(o.date);
      var dayStr = isNaN(d.getTime()) ? '-' : '週' + state.weekdayNames[d.getDay()];
      var maxStr =
        o.maxQuantity === '' || o.maxQuantity === null || o.maxQuantity === 0 ? '不限制' : o.maxQuantity;
      var statusBadge;
      if (isExpired) {
        statusBadge = '<span style="color: #9ca3af;">已過期</span>';
      } else if (o.enabled) {
        statusBadge = '<span style="color: #16a34a; font-weight: 600;">啟用</span>';
      } else {
        statusBadge = '<span style="color: #9ca3af;">停用</span>';
      }
      var rowStyle = isExpired ? ' style="opacity: 0.5;"' : '';
      var deleteButton =
        document.body.dataset.shopRole === 'viewer'
          ? ''
          : '<button class="requires-editor" aria-label="刪除 ' +
            escapeAttr(o.date) +
            ' 日期覆寫" data-override-id="' +
            escapeAttr(o.id) +
            '" onclick="deleteDateOverrideById(this.dataset.overrideId)" style="padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 0.8rem; cursor: pointer;">' +
            '<i class="fas fa-trash-alt" aria-hidden="true"></i>' +
            '</button>';
      return (
        '<tr' +
        rowStyle +
        '>' +
        '<td>' +
        escapeHtml(o.date) +
        '</td>' +
        '<td>' +
        dayStr +
        '</td>' +
        '<td style="font-weight: 600;">' +
        maxStr +
        '</td>' +
        '<td>' +
        statusBadge +
        '</td>' +
        '<td style="text-align: center;">' +
        deleteButton +
        '</td></tr>'
      );
    })
    .join('');
}

export function debouncedSaveWeekdayCapacity() {
  clearTimeout(state._weekdayCapacityDebounceTimer);
  var statusEl = document.getElementById('weekdayAutoSaveStatus');
  if (statusEl) statusEl.textContent = '儲存中...';
  state._weekdayCapacityDebounceTimer = setTimeout(function () {
    saveWeekdayCapacitySettings();
  }, 600);
}

export function saveWeekdayCapacitySettings() {
  if (document.body.dataset.shopRole === 'viewer') {
    showAlert('此帳號只有檢視權限', 'error');
    return;
  }
  var statusEl = document.getElementById('weekdayAutoSaveStatus');
  var settings = [];
  for (var i = 0; i < 7; i++) {
    var input = document.getElementById('capDay' + i);
    var checkbox = document.getElementById('capDayEnabled' + i);
    var val = input ? input.value.trim() : '';
    settings.push({
      dayOfWeek: i,
      maxQuantity: val === '' ? '' : parseInt(val) || 0,
      enabled: checkbox ? checkbox.checked : false,
    });
  }
  if (isConnected()) {
    rpc
      .withSuccessHandler(function () {
        if (statusEl) statusEl.textContent = '已自動儲存';
        setTimeout(function () {
          if (statusEl) statusEl.textContent = '';
        }, 2000);
        settings.forEach(function (s) {
          state.capacitySettings.weekday[s.dayOfWeek.toString()] = s;
        });
        invalidateCapacityCache();
      })
      .withFailureHandler(function (error) {
        if (statusEl) {
          statusEl.style.color = '#dc2626';
          statusEl.textContent = '儲存失敗: ' + error.message;
        }
        setTimeout(function () {
          if (statusEl) {
            statusEl.style.color = '#9ca3af';
            statusEl.textContent = '';
          }
        }, 3000);
      })
      .saveWeekdayCapacity(settings);
  } else {
    if (statusEl) {
      statusEl.style.color = '#dc2626';
      statusEl.textContent = '尚未連接 Firebase，未儲存';
    }
  }
}

export function parseOverrideDateRange(raw) {
  var dates = [];
  var startDate, endDate;
  if (raw.includes('~')) {
    var parts = raw.split('~').map(function (s) {
      return s.trim();
    });
    startDate = parts[0];
    endDate = parts[1] || parts[0];
  } else {
    startDate = raw.trim();
    endDate = startDate;
  }
  var cur = new Date(startDate + 'T00:00:00');
  var end = new Date(endDate + 'T00:00:00');
  if (isNaN(cur.getTime()) || isNaN(end.getTime())) return dates;
  while (cur <= end) {
    var y = cur.getFullYear();
    var m = String(cur.getMonth() + 1).padStart(2, '0');
    var d = String(cur.getDate()).padStart(2, '0');
    dates.push(y + '-' + m + '-' + d);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function addDateOverride() {
  if (document.body.dataset.shopRole === 'viewer') {
    showAlert('此帳號只有檢視權限', 'error');
    return;
  }
  var dateInput = document.getElementById('overrideDate');
  var qtyInput = document.getElementById('overrideMaxQty');
  var raw = dateInput.value.trim();
  var qty = qtyInput.value.trim();
  if (!raw) {
    showAlert('請選擇日期', 'error');
    return;
  }
  var dates = parseOverrideDateRange(raw);
  if (dates.length === 0) {
    showAlert('日期格式錯誤', 'error');
    return;
  }
  var maxQty = qty === '' ? '' : parseInt(qty) || 0;
  var settings = dates.map(function (d) {
    return { date: d, maxQuantity: maxQty, enabled: true };
  });
  if (isConnected()) {
    rpc
      .withSuccessHandler(function () {
        var msg = dates.length === 1 ? '日期覆寫設定已新增' : '已新增 ' + dates.length + ' 天覆寫設定';
        showAlert(msg, 'success');
        if (state.overrideDatepickerInstance) state.overrideDatepickerInstance.clear();
        qtyInput.value = '';
        settings.forEach(function (s) {
          state.capacitySettings.dateOverrides = state.capacitySettings.dateOverrides.filter(function (o) {
            return o.date !== s.date;
          });
          state.capacitySettings.dateOverrides.push({ ...s, id: s.date });
        });
        state.capacitySettings.dateOverrides.sort(function (a, b) {
          return a.date.localeCompare(b.date);
        });
        renderOverrideTable();
        invalidateCapacityCache();
      })
      .withFailureHandler(function (error) {
        showAlert('新增失敗: ' + error.message, 'error');
      })
      .saveDateOverrideCapacityBatch(settings);
  } else {
    showAlert('尚未連接 Firebase，設定未儲存', 'error');
  }
}

export function deleteDateOverrideById(id) {
  if (document.body.dataset.shopRole === 'viewer') {
    showAlert('此帳號只有檢視權限', 'error');
    return;
  }
  if (!confirm('確定要刪除此日期覆寫設定？')) return;
  if (isConnected()) {
    rpc
      .withSuccessHandler(function () {
        showAlert('已刪除日期覆寫設定', 'success');
        state.capacitySettings.dateOverrides = state.capacitySettings.dateOverrides.filter(function (o) {
          return o.id !== id && o.date !== id;
        });
        renderOverrideTable();
        invalidateCapacityCache();
      })
      .withFailureHandler(function (error) {
        showAlert('刪除失敗: ' + error.message, 'error');
      })
      .deleteDateOverrideCapacity(id);
  } else {
    showAlert('尚未連接 Firebase，設定未刪除', 'error');
  }
}

export function loadMonthCapacity(year, month, callback) {
  const key = year + '-' + month;
  // 已有快取，直接回傳
  if (state.monthCapacityCache[key]) {
    if (callback) callback(state.monthCapacityCache[key]);
    return;
  }
  // 已有同月份的請求正在進行中，把 callback 排入佇列
  if (state.capacityInflight[key]) {
    if (callback) state.capacityInflight[key].push(callback);
    return;
  }
  // 標記為進行中
  state.capacityInflight[key] = callback ? [callback] : [];
  function resolveCallbacks(data) {
    state.monthCapacityCache[key] = data;
    const cbs = state.capacityInflight[key] || [];
    delete state.capacityInflight[key];
    cbs.forEach(function (cb) {
      cb(data);
    });
  }
  if (isConnected()) {
    rpc
      .withSuccessHandler(function (result) {
        resolveCallbacks(result);
      })
      .withFailureHandler(function (error) {
        console.warn('載入月產能失敗', error);
        resolveCallbacks({});
      })
      .getMonthCapacityStatus(year, month);
  } else {
    resolveCallbacks({});
  }
}

/**
 * 清除產能快取（訂單送出成功或設定變更後呼叫）
 */
export function invalidateCapacityCache() {
  state.monthCapacityCache = {};
}

export function getCapacityIndicatorHtml(info) {
  if (!info || !info.hasLimit) {
    return '';
  }
  const used = info.currentQuantity || 0;
  const limit = info.limit || 0;
  let colorClass = 'cap-green';
  const rate = info.usageRate || 0;
  if (info.status === 'full' || rate >= 100) {
    colorClass = 'cap-red';
  } else if (info.status === 'nearFull' || rate >= 90) {
    colorClass = 'cap-orange';
  } else if (info.status === 'warning' || rate >= 70) {
    colorClass = 'cap-yellow';
  }
  return '<div class="cap-indicator ' + colorClass + '">' + used + '/' + limit + '</div>';
}
