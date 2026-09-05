import { showSection, showSettingsSection, settingsBack } from './navigation.js';
import {
  toggleNameTitle,
  selectCustomerType,
  selectDeliveryType,
  selectShippingFee,
  clearCustomerForm,
  saveCustomer,
  escapeAttr,
} from './customers.js';
import { updateOrderTotal, toggleCartModal, addToCartFromModal } from './cart.js';
import { changeMonth, confirmDateSelection } from './calendar.js';
import {
  selectGiftboxSize,
  backToStep1,
  proceedToStep3,
  updateGiftboxPrice,
  backToStep2,
  addGiftboxToCart,
  editGiftboxItem,
  adjustGiftboxQty,
  setGiftboxQty,
} from './giftboxes.js';
import {
  searchOrders,
  clearSearch,
  searchOverdueOrders,
  toggleOrderItems,
  loadMoreOrders,
} from './search.js';
import {
  showAddProduct,
  closeProductEditModal,
  selectProductOption,
  saveProduct,
  editProduct,
  deleteProduct,
} from './products.js';
import { addDateOverride, deleteDateOverrideById } from './capacity.js';
import { generateDemandStats, generateReport } from './reports.js';
import { submitOrder, closeCapacityWarningModal, confirmCapacityOverride } from './checkout.js';
import {
  closeProductModal,
  changeModalQuantity,
  validateModalQuantity,
  toggleSpecialPrice,
  activateSpecialPrice,
  updateModalPrice,
  showProductDetail,
} from './product-detail.js';
import { closeConfirmModal, executeConfirmCallback } from './dialogs.js';
import {
  closeStatusConfirmModal,
  closeDeleteConfirmModal,
  updateDepositCalculation,
  closeDepositModal,
  confirmDepositUpdate,
  showStatusConfirm,
  showDepositModal,
  showDeleteConfirm,
} from './payments.js';
import { updateCartItemQuantity, removeFromCartModal } from './cart-detail.js';
import { loadProducts, addToCartDirectly } from './catalog.js';
import { editOrder } from './order-editor.js';
import { viewOrderDetails } from './order-detail.js';

// Compatibility boundary for existing static and dynamically rendered HTML handlers.
Object.assign(window, {
  showSection,
  toggleNameTitle,
  selectCustomerType,
  selectDeliveryType,
  selectShippingFee,
  updateOrderTotal,
  clearCustomerForm,
  saveCustomer,
  changeMonth,
  confirmDateSelection,
  selectGiftboxSize,
  backToStep1,
  proceedToStep3,
  updateGiftboxPrice,
  backToStep2,
  addGiftboxToCart,
  searchOrders,
  clearSearch,
  searchOverdueOrders,
  showSettingsSection,
  settingsBack,
  showAddProduct,
  addDateOverride,
  generateDemandStats,
  generateReport,
  toggleCartModal,
  submitOrder,
  closeProductModal,
  changeModalQuantity,
  validateModalQuantity,
  toggleSpecialPrice,
  activateSpecialPrice,
  updateModalPrice,
  addToCartFromModal,
  closeProductEditModal,
  selectProductOption,
  saveProduct,
  closeConfirmModal,
  executeConfirmCallback,
  closeStatusConfirmModal,
  closeDeleteConfirmModal,
  updateDepositCalculation,
  closeDepositModal,
  confirmDepositUpdate,
  closeCapacityWarningModal,
  confirmCapacityOverride,
  deleteDateOverrideById,
  escapeAttr,
  updateCartItemQuantity,
  editGiftboxItem,
  removeFromCartModal,
  loadProducts,
  showProductDetail,
  addToCartDirectly,
  adjustGiftboxQty,
  setGiftboxQty,
  showStatusConfirm,
  showDepositModal,
  editOrder,
  editProduct,
  deleteProduct,
  viewOrderDetails,
  showDeleteConfirm,
  toggleOrderItems,
  loadMoreOrders,
});
