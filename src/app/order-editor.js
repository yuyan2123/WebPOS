import { rpc } from '../platform/rpc.js';
import { state } from './state.js';
import { handleError, showAlert } from './feedback.js';
import { selectContactMethod, selectDeliveryType, selectShippingFee } from './customers.js';
import { generateUniqueId } from './pricing.js';
import { updateCartDisplay } from './cart.js';
import { showSectionById } from './platform.js';

export function editOrder(orderId) {
  rpc
    .withSuccessHandler(function (orderDetails) {
      loadOrderForEditing(orderDetails);
    })
    .withFailureHandler(function (error) {
      handleError(error);
    })
    .getOrderDetails(orderId);
}

export function loadOrderForEditing(orderDetails) {
  document.getElementById('recipientDetails').open = Boolean(
    orderDetails.recipientName || orderDetails.recipientPhone,
  );
  // 設定編輯模式
  state.isEditingOrder = true;
  state.editingOrderId = orderDetails.orderId;
  // 清空現有購物車
  state.giftCart = [];
  state.cakeCart = [];
  state.giftboxCart = [];
  // 載入客戶資訊
  // 還原企業客戶狀態
  state.isCompanyCustomer = !!orderDetails.isCompanyCustomer;
  if (state.isCompanyCustomer) {
    document.getElementById('customerCompany').classList.add('active');
    document.getElementById('customerNormal').classList.remove('active');
  } else {
    document.getElementById('customerNormal').classList.add('active');
    document.getElementById('customerCompany').classList.remove('active');
  }
  state.currentCustomer = {
    name: orderDetails.customerName,
    contactType: orderDetails.customerContactType || (orderDetails.customerLineId ? 'line' : 'phone'),
    contactValue:
      orderDetails.customerContactValue || orderDetails.customerLineId || orderDetails.customerPhone || '',
    phone: orderDetails.customerPhone || '',
    lineId: orderDetails.customerLineId || '',
    address: orderDetails.customerAddress || '',
    recipientName: orderDetails.recipientName || '',
    recipientPhone: orderDetails.recipientPhone || '',
    deliveryType: orderDetails.deliveryType || '外送',
    isCompanyCustomer: state.isCompanyCustomer,
  };
  // 拆分姓名與稱謂
  let loadedName = state.currentCustomer.name || '';
  document.querySelectorAll('#nameTitleGroup .name-title-btn').forEach((b) => b.classList.remove('active'));
  if (loadedName.endsWith('先生') || loadedName.endsWith('小姐')) {
    const title = loadedName.slice(-2);
    loadedName = loadedName.slice(0, -2);
    const btn = document.querySelector(`#nameTitleGroup .name-title-btn[data-title="${title}"]`);
    if (btn) btn.classList.add('active');
  }
  document.getElementById('customerName').value = loadedName;
  selectContactMethod(state.currentCustomer.contactType, false);
  document.getElementById('customerPhone').value =
    state.currentCustomer.contactType === 'line' ? 'LINE' : state.currentCustomer.contactValue;
  document.getElementById('customerAddress').value = state.currentCustomer.address;
  document.getElementById('recipientName').value = state.currentCustomer.recipientName;
  document.getElementById('recipientPhone').value = state.currentCustomer.recipientPhone;
  // 設定配送方式（同步 grove 按鈕與 hidden input，並套用欄位顯示邏輯）
  const deliveryType = orderDetails.deliveryType || '外送';
  const deliveryBtnMap = { 外送: 'deliveryHome', 寄貨: 'deliveryShipping', 自取: 'deliveryPickup' };
  const deliveryBtn = document.getElementById(deliveryBtnMap[deliveryType] || 'deliveryHome');
  selectDeliveryType(deliveryBtn, deliveryType);
  // 載入運費資訊（同步 grove 按鈕與 hidden input）
  const shippingFee = orderDetails.shippingFee || 0;
  if (shippingFee > 0) {
    // 有收運費
    selectShippingFee(document.getElementById('chargeShipping'), 'charge');
    document.getElementById('shippingFee').value = shippingFee;
  } else {
    // 免運
    selectShippingFee(document.getElementById('freeShipping'), 'free');
  }
  // 載入交貨日期
  state.currentDeliveryDate = orderDetails.deliveryDate;
  // 處理日期格式 - 確保正確顯示
  if (state.currentDeliveryDate) {
    try {
      let dateValue;
      if (state.currentDeliveryDate instanceof Date) {
        dateValue = state.currentDeliveryDate.toISOString().split('T')[0];
      } else if (typeof state.currentDeliveryDate === 'string') {
        const parsedDate = new Date(state.currentDeliveryDate);
        if (!isNaN(parsedDate.getTime())) {
          dateValue = parsedDate.toISOString().split('T')[0];
        } else {
          dateValue = state.currentDeliveryDate;
        }
      } else {
        dateValue = state.currentDeliveryDate;
      }
      document.getElementById('deliveryDate').value = dateValue;
    } catch (error) {
      console.log('日期格式轉換錯誤:', error);
      document.getElementById('deliveryDate').value = state.currentDeliveryDate;
    }
  }
  // 載入訂單項目到購物車
  orderDetails.items.forEach((item) => {
    if (item.isGiftBox && item.giftBoxDetails) {
      // 禮盒項目 - 修復數量計算問題
      const giftboxItem = {
        type: 'giftbox',
        id: generateUniqueId('GB'),
        name: item.productName,
        size: Object.values(item.giftBoxDetails.products || {}).reduce(
          (sum, qty) => sum + parseInt(qty || 0),
          0,
        ),
        products: item.giftBoxDetails.products || {},
        price: parseFloat(item.unitPrice) || 0,
        quantity: parseInt(item.quantity) || 1, // 確保數量為整數
      };
      state.giftboxCart.push(giftboxItem);
    } else {
      // 一般商品項目 - 優化產品匹配邏輯
      let product = state.allProducts.find((p) => p.productId === item.productId);
      if (!product) {
        // 如果找不到產品ID，嘗試用名稱匹配
        product = state.allProducts.find((p) => p.productName === item.productName);
      }
      if (product) {
        const cartItem = {
          ...product,
          quantity: parseInt(item.quantity) || 1, // 確保數量為整數
          price: parseFloat(item.unitPrice) || product.price, // 使用訂單中的實際價格
          originalPrice: item.originalPrice || product.price, // 使用訂單中記錄的原價
          isSpecialPrice: item.isSpecialPrice || false, // 使用訂單中記錄的特價狀態
        };
        if (product.category === '伴手禮') {
          state.giftCart.push(cartItem);
        } else if (product.category === '喜餅') {
          state.cakeCart.push(cartItem);
        }
      } else {
        // 如果找不到對應產品，創建一個臨時產品項目
        const tempProduct = {
          productId: item.productId || generateUniqueId('TEMP'),
          productName: item.productName,
          category: '伴手禮', // 預設類別
          price: parseFloat(item.unitPrice) || 0,
          originalPrice: item.originalPrice || parseFloat(item.unitPrice) || 0,
          isSpecialPrice: item.isSpecialPrice || false,
          quantity: parseInt(item.quantity) || 1,
          status: '啟用',
          description: '從訂單載入的商品',
          giftBoxEnabled: '是',
        };
        state.giftCart.push(tempProduct);
      }
    }
  });
  // 確保購物車顯示正確更新
  updateCartDisplay();
  showAlert(`已載入訂單 ${orderDetails.orderId} 進行編輯`, 'success');
  showSectionById('customer');
}
