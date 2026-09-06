import { escapeHtml } from './customers.js';
import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { showAlert, setButtonLoading, handleError } from './feedback.js';

export function initReportDatepicker() {
  if (state.reportDatepickerInstance) return;
  const el = document.getElementById('reportDatePicker');
  if (!el) return;
  state.reportDatepickerInstance = new AirDatepicker(el, {
    locale: state.demandDateLocaleZh,
    range: true,
    dateFormat: 'yyyy-MM-dd',
    multipleDatesSeparator: ' ~ ',
    autoClose: true,
    buttons: [
      {
        content: '今天',
        onClick: function (dp) {
          dp.clear();
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

export function generateReport() {
  const raw = document.getElementById('reportDatePicker').value.trim();
  if (!raw) {
    showAlert('請選擇報表日期區間', 'error');
    return;
  }
  const [startDate, selectedEnd] = raw.split('~').map((value) => value.trim());
  const endDate = selectedEnd || startDate;
  var btn = document.getElementById('btnReport');
  setButtonLoading(btn, true, '產生中...');
  rpc
    .withSuccessHandler(function (report) {
      setButtonLoading(btn, false);
      handleReportGenerated(report);
    })
    .withFailureHandler(function (error) {
      setButtonLoading(btn, false);
      handleError(error);
    })
    .generateDailyReport(startDate, endDate);
}

export function handleReportGenerated(report) {
  var container = document.getElementById('reportResults');
  var dateLabel = escapeHtml(report.date || '');
  if (report.totalOrders === 0) {
    container.innerHTML =
      '<div class="report-date-label">' +
      '<i class="fas fa-calendar-check" style="margin-right:6px;"></i>' +
      dateLabel +
      '</div>' +
      '<p style="padding:20px;text-align:center;color:#64748b;">此期間無營業記錄</p>';
    return;
  }
  var totalRevenue = Math.round(report.totalRevenue);
  var avgOrder = report.totalOrders > 0 ? Math.round(totalRevenue / report.totalOrders) : 0;
  var html = '';
  // 日期標示
  html +=
    '<div class="report-date-label"><i class="fas fa-calendar-check" style="margin-right:6px;"></i>' +
    dateLabel +
    '，共 ' +
    report.totalOrders +
    ' 筆訂單</div>';
  // 摘要卡片
  html += '<div class="report-summary-cards">';
  html +=
    '<div class="report-summary-card revenue">' +
    '<div class="card-label">總營業額</div>' +
    '<div class="card-value">$' +
    totalRevenue.toLocaleString() +
    '</div>' +
    '</div>';
  html +=
    '<div class="report-summary-card orders">' +
    '<div class="card-label">訂單數</div>' +
    '<div class="card-value">' +
    report.totalOrders +
    '</div>' +
    '</div>';
  html +=
    '<div class="report-summary-card items">' +
    '<div class="card-label">商品總數</div>' +
    '<div class="card-value">' +
    report.totalItems +
    '</div>' +
    '</div>';
  html +=
    '<div class="report-summary-card avg">' +
    '<div class="card-label">平均客單價</div>' +
    '<div class="card-value">$' +
    avgOrder.toLocaleString() +
    '</div>' +
    '</div>';
  html += '</div>';
  // 商品銷售明細
  if (report.productSales && report.productSales.length > 0) {
    html +=
      '<div class="demand-section-title"><i class="fas fa-chart-bar" style="margin-right:8px;"></i>商品銷售明細</div>';
    html +=
      '<table class="demand-stats-table"><thead><tr><th>商品名稱</th><th>數量</th><th>金額</th><th>佔比</th></tr></thead><tbody>';
    for (var i = 0; i < report.productSales.length; i++) {
      var p = report.productSales[i];
      var amount = Math.round(p.amount);
      var pct = totalRevenue > 0 ? ((amount / totalRevenue) * 100).toFixed(1) : '0.0';
      html +=
        '<tr>' +
        '<td>' +
        escapeHtml(p.productName) +
        '</td>' +
        '<td>' +
        p.quantity +
        '</td>' +
        '<td class="qty-cell">$' +
        amount.toLocaleString() +
        '</td>' +
        '<td>' +
        pct +
        '%</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
  } else {
    html += '<p style="padding:20px;text-align:center;color:#64748b;">此期間無商品銷售明細</p>';
  }
  container.innerHTML = html;
}

export function generateDemandStats() {
  const el = document.getElementById('demandDatePicker');
  const raw = el.value.trim();
  if (!raw) {
    showAlert('請先選擇日期', 'error');
    return;
  }
  let startDate, endDate;
  if (raw.includes('~')) {
    const parts = raw.split('~').map((s) => s.trim());
    startDate = parts[0];
    endDate = parts[1] || parts[0];
  } else {
    startDate = raw;
    endDate = raw;
  }
  const btn = document.getElementById('btnDemandStats');
  setButtonLoading(btn, true, '統計中...');
  if (isConnected()) {
    rpc
      .withSuccessHandler(function (result) {
        setButtonLoading(btn, false);
        renderDemandResults(result, startDate, endDate);
      })
      .withFailureHandler(function (error) {
        setButtonLoading(btn, false);
        handleError(error);
      })
      .getDemandStats(startDate, endDate);
  } else {
    setButtonLoading(btn, false);
    showAlert('尚未連接 Firebase，無法產生需求統計', 'error');
  }
}

export function renderDemandResults(result, startDate, endDate) {
  const container = document.getElementById('demandResults');
  if (!result || result.orderCount === 0) {
    container.innerHTML =
      '<p style="padding: 20px; text-align: center; color: #64748b;">此期間無訂單資料</p>';
    return;
  }
  const dateLabel = startDate === endDate ? startDate : startDate + ' ~ ' + endDate;
  let html = '';
  // 日期區間標示
  html += `<div class="demand-date-range-label"><i class="fas fa-calendar-check" style="margin-right:6px;"></i>${dateLabel}，共 ${result.orderCount} 筆訂單</div>`;
  // 各商品需求量
  if (result.productStats.length > 0) {
    html +=
      '<div class="demand-section-title"><i class="fas fa-boxes-stacked" style="margin-right:8px;"></i>各商品需求量</div>';
    html +=
      '<table class="demand-stats-table"><thead><tr><th>商品名稱</th><th>散裝</th><th>禮盒內</th><th>合計</th></tr></thead><tbody>';
    result.productStats.forEach((p) => {
      html += `<tr>
                        <td>${escapeHtml(p.name)}</td>
                        <td>${p.loose || 0}</td>
                        <td>${p.inbox || 0}</td>
                        <td class="qty-cell">${p.total}</td>
                    </tr>`;
    });
    html += '</tbody></table>';
  }
  // 禮盒規格統計
  if (result.giftboxStats.length > 0) {
    html +=
      '<div class="demand-section-title"><i class="fas fa-box" style="margin-right:8px;"></i>禮盒規格統計</div>';
    html += '<div class="demand-summary-cards">';
    result.giftboxStats.forEach((g) => {
      html += `<div class="demand-summary-card">
                        <div class="card-label">${escapeHtml(g.size)}</div>
                        <div class="card-value">${g.count}</div>
                        <div class="card-label">盒</div>
                    </div>`;
    });
    html += '</div>';
  }
  container.innerHTML = html;
}
