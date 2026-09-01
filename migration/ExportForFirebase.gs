/**
 * One-time exporter for the original Google Sheets POS.
 * Add this file to the bound Apps Script project, run exportForFirebase(),
 * then download the JSON file linked in the execution log as migration/data.json.
 */
function exportForFirebase() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var timeZone = spreadsheet.getSpreadsheetTimeZone() || Session.getScriptTimeZone();

  function clean(value) {
    if (value instanceof Date) {
      return Utilities.formatDate(value, timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
    }
    if (typeof value === 'string' && value.charAt(0) === "'") return value.substring(1);
    return value;
  }

  function rows(name, width) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet || sheet.getLastRow() <= 1) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues().map(function(row) {
      return row.map(clean);
    });
  }

  function amount(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function yes(value) {
    return value === true || value === '是' || value === 'true';
  }

  var productRows = rows('Products', 10);
  var customerRows = rows('Customers', 6);
  var orderRows = rows('Orders', 18);
  var detailRows = rows('OrderDetails', 11);
  var capacityRows = rows('CapacitySettings', 8);
  var detailsByOrder = {};

  detailRows.forEach(function(row) {
    var orderId = String(row[1] || '');
    if (!detailsByOrder[orderId]) detailsByOrder[orderId] = [];
    var isGiftBox = row[7] === '是';
    var giftBoxDetails = null;
    if (isGiftBox && row[8]) {
      try { giftBoxDetails = JSON.parse(row[8]); } catch (_error) { giftBoxDetails = {}; }
    }
    detailsByOrder[orderId].push({
      detailId: row[0],
      productId: row[2],
      productName: row[3],
      quantity: amount(row[4]),
      unitPrice: amount(row[5]),
      subtotal: amount(row[6]),
      isGiftBox: isGiftBox,
      giftBoxDetails: giftBoxDetails,
      originalPrice: amount(row[9] || row[5]),
      isSpecialPrice: row[10] === '是'
    });
  });

  var payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    sourceSpreadsheetId: spreadsheet.getId(),
    products: productRows.map(function(row) {
      return {
        productId: row[0], productName: row[1], category: row[2], price: amount(row[3]),
        status: row[4], createTime: row[5], description: row[6] || '',
        giftBoxEnabled: row[7] || '是', specialPrice: row[8] === '' ? '' : amount(row[8]),
        companyPrice: row[9] === '' ? '' : amount(row[9])
      };
    }),
    customers: customerRows.map(function(row) {
      return {
        customerId: row[0], name: row[1], phone: row[2], address: row[3] || '',
        createTime: row[4], lastOrderDate: row[5]
      };
    }),
    orders: orderRows.map(function(row) {
      return {
        orderId: row[0], customerName: row[1], customerPhone: row[2],
        customerAddress: row[3] || '', deliveryType: row[4] || '外送',
        deliveryDate: String(row[5] || '').substring(0, 10), status: row[6], createTime: row[7],
        totalAmount: amount(row[8]), depositAmount: amount(row[9]),
        remainingAmount: amount(row[10] || row[8]), paymentNotes: row[11] || '',
        shippingFee: amount(row[12]), shippingNotes: row[13] || '', notes: row[14] || '',
        recipientName: row[15] || '', recipientPhone: row[16] || '',
        isCompanyCustomer: yes(row[17]), items: detailsByOrder[String(row[0])] || []
      };
    }),
    weekdayCapacity: capacityRows.filter(function(row) { return row[1] === 'weekday'; }).map(function(row) {
      return { dayOfWeek: amount(row[2]), maxQuantity: row[4] === '' ? '' : amount(row[4]), enabled: yes(row[5]) };
    }),
    capacityOverrides: capacityRows.filter(function(row) { return row[1] === 'dateOverride'; }).map(function(row) {
      return { date: String(row[3] || '').substring(0, 10), maxQuantity: row[4] === '' ? '' : amount(row[4]), enabled: yes(row[5]) };
    })
  };

  var name = 'gin-jia-pos-firebase-export-' + Utilities.formatDate(new Date(), timeZone, 'yyyyMMdd-HHmmss') + '.json';
  var file = DriveApp.createFile(name, JSON.stringify(payload, null, 2), MimeType.PLAIN_TEXT);
  Logger.log('Firebase migration export: ' + file.getUrl());
  return file.getUrl();
}
