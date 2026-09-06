// src/platform/gestures.js
var preventGesture = (event2) => {
  event2.preventDefault();
};
document.addEventListener("gesturestart", preventGesture, { passive: false, capture: true });
document.addEventListener("gesturechange", preventGesture, { passive: false, capture: true });
document.addEventListener("gestureend", preventGesture, { passive: false, capture: true });
var preventMultiTouch = (event2) => {
  if (event2.touches.length > 1) {
    event2.preventDefault();
  }
};
document.addEventListener("touchstart", preventMultiTouch, { passive: false, capture: true });
document.addEventListener("touchmove", preventMultiTouch, { passive: false, capture: true });

// public/wasm/pos_domain.js
function execute(request) {
  let deferred3_0;
  let deferred3_1;
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passStringToWasm0(request, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    wasm.execute(retptr, ptr0, len0);
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
    var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
    var ptr2 = r0;
    var len2 = r1;
    if (r3) {
      ptr2 = 0;
      len2 = 0;
      throw takeObject(r2);
    }
    deferred3_0 = ptr2;
    deferred3_1 = len2;
    return getStringFromWasm0(ptr2, len2);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
    wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
  }
}
function __wbg_get_imports() {
  const import0 = {
    __proto__: null,
    __wbindgen_generic_0000000000000001: function(arg0, arg1) {
      const ret = getStringFromWasm0(arg0, arg1);
      return addHeapObject(ret);
    }
  };
  return {
    __proto__: null,
    "./pos_domain_bg.js": import0
  };
}
function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}
function dropObject(idx) {
  if (idx < 1028) return;
  heap[idx] = heap_next;
  heap_next = idx;
}
var cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}
function getStringFromWasm0(ptr, len) {
  return decodeText(ptr >>> 0, len);
}
var cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
function getObject(idx) {
  return heap[idx];
}
var heap = new Array(1024).fill(void 0);
heap.push(void 0, null, true, false);
var heap_next = heap.length;
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = cachedTextEncoder.encodeInto(arg, view);
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
var cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
var MAX_SAFARI_DECODE_BYTES = 2146435072;
var numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
var cachedTextEncoder = new TextEncoder();
if (!("encodeInto" in cachedTextEncoder)) {
  cachedTextEncoder.encodeInto = function(arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length
    };
  };
}
var WASM_VECTOR_LEN = 0;
var wasmModule;
var wasmInstance;
var wasm;
function __wbg_finalize_init(instance, module) {
  wasmInstance = instance;
  wasm = instance.exports;
  wasmModule = module;
  cachedDataViewMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  return wasm;
}
async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (!module.ok) {
      throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
    }
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        const validResponse = expectedResponseType(module.type);
        if (validResponse && module.headers.get("Content-Type") !== "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
  function expectedResponseType(type) {
    switch (type) {
      case "basic":
      case "cors":
      case "default":
        return true;
    }
    return false;
  }
}
async function __wbg_init(module_or_path) {
  if (wasm !== void 0) return wasm;
  if (module_or_path !== void 0) {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (module_or_path === void 0) {
    module_or_path = new URL("pos_domain_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  const { instance, module } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance, module);
}

// src/platform/domain.ts
var ready;
function initializeDomain() {
  ready ||= __wbg_init({ module_or_path: "/wasm/pos_domain_bg.wasm" }).catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}
function domain(operation, input) {
  return JSON.parse(execute(JSON.stringify({ operation, input })));
}

// src/app/pricing.js
function generateUniqueId(prefix = "") {
  const timestamp = (/* @__PURE__ */ new Date()).getTime().toString().slice(-6);
  const random = Math.random().toString(36).substr(2, 3);
  return prefix + timestamp + random;
}
function getEffectivePrice(product) {
  return domain("price", {
    company: state.isCompanyCustomer,
    companyPrice: parseFloat(product.companyPrice) || 0,
    price: parseFloat(product.price) || 0
  });
}

// src/app/state.js
var state = {
  currentCustomer: {},
  currentDeliveryDate: "",
  giftCart: [],
  cakeCart: [],
  giftboxCart: [],
  allProducts: [],
  currentModalProduct: null,
  confirmCallback: null,
  isCompanyCustomer: false,
  isSubmittingOrder: false,
  currentGiftboxSize: 0,
  giftboxSelection: {},
  currentGiftboxCombo: null,
  editingGiftboxIndex: -1,
  isEditingOrder: false,
  editingOrderId: null,
  expandedSearchOrderId: null,
  collapsingSearchOrderId: null,
  orderItemsTransitionTimer: null,
  currentSearchOrders: [],
  currentOrderTableType: null,
  currentContactMethod: "phone",
  currentSearchContactMethod: "phone",
  searchNextCursor: null,
  lastSearchCriteria: null,
  isLoadingMoreOrders: false,
  draftSaveTimer: null,
  restoredDraftKey: null,
  suppressDraftSave: false,
  posLocalDbPromise: null,
  currentOrderRequestId: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : generateUniqueId("REQ"),
  viewportProbeObserver: null,
  viewportRemeasureTimer: null,
  acDebounceTimer: null,
  acResultsCache: [],
  customerSearchCache: /* @__PURE__ */ new Map(),
  currentProductFilter: "\u5168\u90E8",
  searchDatepickerInstance: null,
  reportDatepickerInstance: null,
  buttonClickStates: /* @__PURE__ */ new Set(),
  currentStatusOrderId: null,
  currentStatusValue: null,
  statusSliderCtrl: null,
  deleteSliderCtrl: null,
  calendarState: {
    currDate: /* @__PURE__ */ new Date(),
    currYear: (/* @__PURE__ */ new Date()).getFullYear(),
    currMonth: (/* @__PURE__ */ new Date()).getMonth(),
    selectedDateStr: null
  },
  monthNames: ["1\u6708", "2\u6708", "3\u6708", "4\u6708", "5\u6708", "6\u6708", "7\u6708", "8\u6708", "9\u6708", "10\u6708", "11\u6708", "12\u6708"],
  demandDateLocaleZh: {
    days: ["\u661F\u671F\u65E5", "\u661F\u671F\u4E00", "\u661F\u671F\u4E8C", "\u661F\u671F\u4E09", "\u661F\u671F\u56DB", "\u661F\u671F\u4E94", "\u661F\u671F\u516D"],
    daysShort: ["\u9031\u65E5", "\u9031\u4E00", "\u9031\u4E8C", "\u9031\u4E09", "\u9031\u56DB", "\u9031\u4E94", "\u9031\u516D"],
    daysMin: ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"],
    months: [
      "\u4E00\u6708",
      "\u4E8C\u6708",
      "\u4E09\u6708",
      "\u56DB\u6708",
      "\u4E94\u6708",
      "\u516D\u6708",
      "\u4E03\u6708",
      "\u516B\u6708",
      "\u4E5D\u6708",
      "\u5341\u6708",
      "\u5341\u4E00\u6708",
      "\u5341\u4E8C\u6708"
    ],
    monthsShort: ["1\u6708", "2\u6708", "3\u6708", "4\u6708", "5\u6708", "6\u6708", "7\u6708", "8\u6708", "9\u6708", "10\u6708", "11\u6708", "12\u6708"],
    today: "\u4ECA\u5929",
    clear: "\u6E05\u9664",
    dateFormat: "yyyy-MM-dd",
    timeFormat: "HH:mm",
    firstDay: 0
  },
  overrideDatepickerInstance: null,
  demandDatepickerInstance: null,
  weekdayNames: ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"],
  capacitySettings: { weekday: {}, dateOverrides: [] },
  capacitySettingsLoaded: false,
  monthCapacityCache: {},
  pendingOrderData: null,
  _weekdayCapacityDebounceTimer: null,
  capacityInflight: {},
  orderSubmitWatchdog: null,
  deleteOrderId: null,
  currentDepositOrderId: null,
  currentDepositTotalAmount: 0,
  currentDepositAmount: 0
};

// src/platform/markup.js
function escapeHandlerArgument(value) {
  return String(value ?? "").replace(
    /[\\'"<>&\r\n\u2028\u2029]/g,
    (character) => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

// src/platform/rpc.js
function call(method, ...args) {
  if (!window.posApi) return Promise.reject(new Error("\u5C1A\u672A\u9023\u63A5 Firebase"));
  return window.posApi.call(method, args);
}
function isConnected() {
  return Boolean(window.posApi);
}
function runner(success = () => {
}, failure = console.error) {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "withSuccessHandler") return (handler) => runner(handler, failure);
        if (property === "withFailureHandler") return (handler) => runner(success, handler);
        if (property === "then") return void 0;
        return (...args) => call(String(property), ...args).then(success).catch(failure);
      }
    }
  );
}
var rpc = runner();

// src/app/feedback.js
function handleError(error) {
  showAlert("\u767C\u751F\u932F\u8AA4: " + error.message, "error");
  console.error("Error:", error);
}
function showAlert(message, type = "success", duration = 0) {
  const alertContainer = document.getElementById("alertContainer");
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type}`;
  alertDiv.setAttribute("role", type === "error" ? "alert" : "status");
  const iconMap = {
    success: "fa-check",
    error: "fa-exclamation",
    warning: "fa-exclamation",
    info: "fa-info"
  };
  const icon = document.createElement("div");
  icon.className = "alert-icon";
  icon.innerHTML = `<i class="fas ${iconMap[type] || iconMap.info}"></i>`;
  const text = document.createElement("div");
  text.className = "alert-message";
  text.textContent = message;
  const close2 = document.createElement("button");
  close2.type = "button";
  close2.setAttribute("aria-label", "\u95DC\u9589\u901A\u77E5");
  close2.className = "alert-close";
  close2.innerHTML = '<i class="fas fa-times"></i>';
  alertDiv.appendChild(icon);
  alertDiv.appendChild(text);
  alertDiv.appendChild(close2);
  alertContainer.prepend(alertDiv);
  let removed = false;
  function dismiss() {
    if (removed) return;
    removed = true;
    alertDiv.style.opacity = "0";
    alertDiv.style.transform = "translateX(30%)";
    setTimeout(() => alertDiv.remove(), 300);
  }
  alertDiv.addEventListener("click", dismiss);
  const holdTime = duration > 0 ? duration : type === "error" || message.includes("\n") ? 6e3 : 3e3;
  setTimeout(dismiss, holdTime);
}
function setButtonLoading(button, isLoading = true, loadingText = "") {
  if (typeof button === "string") {
    button = document.getElementById(button);
  }
  if (!button) return;
  button.setAttribute("aria-busy", String(isLoading));
  const isGiftboxSizeBtn = button.closest("#giftboxStep1") !== null;
  if (isLoading) {
    if (!button.dataset.originalContent) {
      button.dataset.originalContent = button.innerHTML;
    }
    button.disabled = true;
    button.classList.add("loading");
    if (loadingText) {
      button.dataset.loadingText = loadingText;
      if (!isGiftboxSizeBtn) {
        button.innerHTML = `<span class="btn-text btn-text-hidden">${button.dataset.originalContent}</span>`;
      }
    }
  } else {
    button.disabled = false;
    button.classList.remove("loading");
    if (button.dataset.originalContent) {
      button.innerHTML = button.dataset.originalContent;
      delete button.dataset.originalContent;
    }
    if (button.dataset.loadingText) {
      delete button.dataset.loadingText;
    }
  }
}
function preventDoubleClick(buttonId, func, delay = 1e3) {
  return function(...args) {
    if (state.buttonClickStates.has(buttonId)) {
      return;
    }
    state.buttonClickStates.add(buttonId);
    try {
      const result = func.apply(this, args);
      if (result && typeof result.then === "function") {
        result.finally(() => {
          setTimeout(() => state.buttonClickStates.delete(buttonId), delay);
        });
      } else {
        setTimeout(() => state.buttonClickStates.delete(buttonId), delay);
      }
      return result;
    } catch (error) {
      setTimeout(() => state.buttonClickStates.delete(buttonId), delay);
      throw error;
    }
  };
}

// src/app/cart-detail.js
function updateCartModalDisplay() {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const cartBody = document.getElementById("cartModalBody");
  if (allItems.length === 0) {
    cartBody.innerHTML = '<p style="text-align: center;">\u8CFC\u7269\u8ECA\u662F\u7A7A\u7684</p>';
    return;
  }
  cartBody.innerHTML = allItems.map((item, index) => {
    if (item.type === "giftbox") {
      let priceHtml;
      if (item.isSpecialPrice && item.originalPrice) {
        priceHtml = `<span class="original">NT$ ${item.originalPrice}</span>NT$ ${item.price}`;
      } else {
        priceHtml = `NT$ ${item.price}`;
      }
      const giftboxDetails = generateGiftboxDetailsHtml(item);
      return `
                        <div class="cart-item-card">
                            <div class="cart-item-header">
                                <div class="cart-item-icon giftbox">
                                    <i class="fas fa-box-open"></i>
                                </div>
                                <div class="cart-item-details">
                                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                                    <div class="cart-item-price">${priceHtml}</div>
                                </div>
                            </div>
                            <div class="cart-item-controls">
                                <div class="cart-qty-group">
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, -1)">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <div class="cart-qty-value">${item.quantity}</div>
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, 1)">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                                <button class="cart-edit-btn" onclick="event.stopPropagation(); editGiftboxItem(${escapeHandlerArgument(index)})" title="\u7DE8\u8F2F\u79AE\u76D2\u5167\u5BB9">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="cart-delete-btn" onclick="event.stopPropagation(); removeFromCartModal(${escapeHandlerArgument(index)})">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            ${giftboxDetails ? `<div class="cart-giftbox-details">${giftboxDetails.replace(/<[^>]*>/g, "")}</div>` : ""}
                            ${item.notes ? `<div class="cart-giftbox-notes">${escapeHtml(item.notes)}</div>` : ""}
                        </div>`;
    } else {
      const iconClass = item.category === "\u4F34\u624B\u79AE" ? "gift" : "cake";
      const iconName = item.category === "\u4F34\u624B\u79AE" ? "fa-cookie-bite" : "fa-birthday-cake";
      let priceHtml = `NT$ ${item.price}`;
      if (item.isSpecialPrice && item.originalPrice !== item.price) {
        priceHtml = `<span class="original">NT$ ${item.originalPrice}</span>NT$ ${item.price}`;
      } else if (item.isCompanyPrice) {
        priceHtml = `NT$ ${item.price}<span class="company-price-tag">\u4F01\u696D\u50F9</span>`;
      }
      return `
                        <div class="cart-item-card">
                            <div class="cart-item-header">
                                <div class="cart-item-icon ${iconClass}">
                                    <i class="fas ${iconName}"></i>
                                </div>
                                <div class="cart-item-details">
                                    <div class="cart-item-name">${escapeHtml(item.productName)}</div>
                                    <div class="cart-item-price">${priceHtml}</div>
                                </div>
                            </div>
                            <div class="cart-item-controls">
                                <div class="cart-qty-group">
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, -1)">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <div class="cart-qty-value">${item.quantity}</div>
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${escapeHandlerArgument(index)}, 1)">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                                <button class="cart-delete-btn" onclick="event.stopPropagation(); removeFromCartModal(${escapeHandlerArgument(index)})">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>`;
    }
  }).join("");
}
function updateCartItemQuantity(index, change) {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const item = allItems[index];
  if (!item) return;
  if (item.type === "giftbox") {
    const originalItem = state.giftboxCart.find((i) => i.id === item.id);
    if (originalItem) {
      originalItem.quantity += change;
      if (originalItem.quantity < 1) removeFromCartModal(index);
      else updateCartDisplay();
    }
  } else {
    const cart = item.category === "\u4F34\u624B\u79AE" ? state.giftCart : state.cakeCart;
    const originalItem = cart.find((i) => i.productId === item.productId);
    if (originalItem) {
      originalItem.quantity += change;
      if (originalItem.quantity < 1) removeFromCartModal(index);
      else updateCartDisplay();
    }
  }
}
function removeFromCartModal(index) {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const item = allItems[index];
  if (!item) return;
  if (item.type === "giftbox") state.giftboxCart = state.giftboxCart.filter((i) => i.id !== item.id);
  else if (item.category === "\u4F34\u624B\u79AE")
    state.giftCart = state.giftCart.filter((i) => i.productId !== item.productId);
  else state.cakeCart = state.cakeCart.filter((i) => i.productId !== item.productId);
  updateCartDisplay();
}

// src/app/product-detail.js
function showProductDetail(productId) {
  const product = state.allProducts.find((p) => p.productId === productId);
  if (!product) return;
  state.currentModalProduct = product;
  const effectivePrice = getEffectivePrice(product);
  document.getElementById("modalProductName").textContent = product.productName;
  document.getElementById("modalProductPrice").innerHTML = state.isCompanyCustomer && effectivePrice !== parseFloat(product.price) ? '<span class="company-original-price">NT$ ' + product.price + "</span> NT$ " + effectivePrice + '<span class="company-price-tag">\u4F01\u696D\u50F9</span>' : "NT$ " + effectivePrice;
  document.getElementById("modalProductDescription").textContent = product.description || "\u7121\u5546\u54C1\u63CF\u8FF0";
  document.getElementById("modalQuantity").value = 1;
  const specialPriceInput = document.getElementById("specialPriceInput");
  const useSpecialPriceCheckbox = document.getElementById("useSpecialPrice");
  if (product.specialPrice && product.specialPrice !== "") {
    specialPriceInput.value = product.specialPrice;
    useSpecialPriceCheckbox.checked = false;
  } else {
    specialPriceInput.value = "";
    useSpecialPriceCheckbox.checked = false;
  }
  toggleSpecialPrice();
  document.getElementById("productModal").classList.add("active");
  setTimeout(() => initializeModalCloseHandlers(), 50);
}
function closeProductModal() {
  document.getElementById("productModal").classList.remove("active");
  state.currentModalProduct = null;
}
function toggleSpecialPrice() {
  const checkbox = document.getElementById("useSpecialPrice");
  const priceComparison = document.getElementById("priceComparison");
  const section = document.getElementById("specialPriceSection");
  if (checkbox.checked) {
    section.style.maxHeight = "200px";
    section.style.opacity = "1";
    priceComparison.style.display = "flex";
    updateModalPrice();
  } else {
    section.style.maxHeight = "0";
    section.style.opacity = "0";
    priceComparison.style.display = "none";
    if (state.currentModalProduct) {
      document.getElementById("modalProductPrice").textContent = `NT$ ${state.currentModalProduct.price}`;
    }
  }
}
function activateSpecialPrice() {
  const checkbox = document.getElementById("useSpecialPrice");
  if (!checkbox.checked) {
    checkbox.checked = true;
    toggleSpecialPrice();
  }
}
function updateModalPrice() {
  if (!state.currentModalProduct) return;
  const checkbox = document.getElementById("useSpecialPrice");
  const specialPriceInput = document.getElementById("specialPriceInput");
  const specialPrice = parseFloat(specialPriceInput.value) || 0;
  if (checkbox.checked && specialPrice > 0) {
    document.getElementById("modalProductPrice").textContent = `NT$ ${specialPrice}`;
    document.getElementById("originalPriceText").textContent = state.currentModalProduct.price;
    document.getElementById("specialPriceText").textContent = specialPrice;
    document.getElementById("priceComparison").style.display = "block";
  } else {
    document.getElementById("modalProductPrice").textContent = `NT$ ${state.currentModalProduct.price}`;
    document.getElementById("priceComparison").style.display = "none";
  }
}
function updateProductSpecialPrice(productId, specialPrice) {
  if (isConnected()) {
    rpc.withFailureHandler(function(error) {
      console.log("\u66F4\u65B0\u7279\u50F9\u5931\u6557:", error);
    }).updateProductSpecialPrice(productId, specialPrice);
  } else {
    showAlert("\u5C1A\u672A\u9023\u63A5 Firebase\uFF0C\u7279\u50F9\u672A\u5132\u5B58", "error");
  }
}
function changeModalQuantity(change) {
  const qtyInput = document.getElementById("modalQuantity");
  let val = parseInt(qtyInput.value) + change;
  if (val < 1) val = 1;
  qtyInput.value = val;
}
function validateModalQuantity(newQuantity) {
  const qty = parseInt(newQuantity) || 1;
  const qtyInput = document.getElementById("modalQuantity");
  if (qty < 1) {
    qtyInput.value = 1;
  } else {
    qtyInput.value = qty;
  }
}

// src/app/cart.js
function updateOrderTotal() {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const itemsTotal = allItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let shippingFee = 0;
  const isPickup = document.getElementById("deliveryTypeValue").value === "\u81EA\u53D6";
  const isChargeShipping = document.getElementById("shippingOption").value === "charge";
  if (!isPickup && isChargeShipping) {
    const shippingFeeInput = document.getElementById("shippingFee");
    shippingFee = parseFloat(shippingFeeInput.value) || 0;
  }
  const totalAmount = itemsTotal + shippingFee;
  const cartTotalEl = document.getElementById("cartTotalAmount");
  if (cartTotalEl) {
    cartTotalEl.textContent = totalAmount;
  }
  return {
    itemsTotal,
    shippingFee,
    totalAmount
  };
}
function addToCartFromModal() {
  if (!state.currentModalProduct) return;
  const addBtn = window.event?.currentTarget || window.event?.target;
  setButtonLoading(addBtn, true, "\u52A0\u5165\u4E2D...");
  const quantity = parseInt(document.getElementById("modalQuantity").value);
  const useSpecialPrice = document.getElementById("useSpecialPrice").checked;
  const specialPrice = parseFloat(document.getElementById("specialPriceInput").value) || 0;
  let finalPrice = getEffectivePrice(state.currentModalProduct);
  let isSpecialPrice = false;
  if (useSpecialPrice && specialPrice > 0) {
    finalPrice = specialPrice;
    isSpecialPrice = true;
  }
  const cart = state.currentModalProduct.category === "\u4F34\u624B\u79AE" ? state.giftCart : state.cakeCart;
  const existing = cart.find((i) => i.productId === state.currentModalProduct.productId);
  const cartItem = {
    ...state.currentModalProduct,
    price: finalPrice,
    originalPrice: state.currentModalProduct.price,
    isSpecialPrice,
    isCompanyPrice: !isSpecialPrice && state.isCompanyCustomer,
    quantity: existing ? existing.quantity + quantity : quantity
  };
  if (existing) {
    existing.quantity += quantity;
    existing.price = finalPrice;
    existing.originalPrice = state.currentModalProduct.price;
    existing.isSpecialPrice = isSpecialPrice;
  } else {
    cart.push(cartItem);
  }
  updateCartDisplay();
  const priceText = isSpecialPrice ? `\u7279\u50F9 NT$ ${finalPrice}` : `NT$ ${finalPrice}`;
  showAlert(
    `\u5DF2\u5C07 ${quantity} \u500B ${state.currentModalProduct.productName} (${priceText}) \u52A0\u5165\u8CFC\u7269\u8ECA`,
    "success"
  );
  if (useSpecialPrice && specialPrice > 0) {
    updateProductSpecialPrice(state.currentModalProduct.productId, specialPrice);
  }
  setButtonLoading(addBtn, false);
  closeProductModal();
}
function toggleCartModal() {
  const cartModal = document.getElementById("cartModal");
  const cartOverlay = document.getElementById("cartOverlay");
  cartModal.classList.toggle("active");
  cartOverlay.classList.toggle("active");
  document.body.classList.toggle("cart-open", cartModal.classList.contains("active"));
  if (cartModal.classList.contains("active")) {
    updateCartModalDisplay();
    setTimeout(() => initializeModalCloseHandlers(), 50);
  }
}
function closeCartModal() {
  document.getElementById("cartModal").classList.remove("active");
  document.getElementById("cartOverlay").classList.remove("active");
  document.body.classList.remove("cart-open");
}
function updateCartDisplay() {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const totalCount = allItems.reduce((sum, item) => sum + item.quantity, 0);
  const orderTotals = updateOrderTotal();
  const cartCountEl = document.getElementById("cartCount");
  cartCountEl.textContent = totalCount;
  cartCountEl.style.display = totalCount > 0 ? "flex" : "none";
  if (totalCount >= 10) {
    cartCountEl.classList.add("two-digits");
  } else {
    cartCountEl.classList.remove("two-digits");
  }
  document.getElementById("cartTotalAmount").textContent = orderTotals.totalAmount;
  const checkoutBtn = document.getElementById("checkoutBtn");
  const notReady = totalCount === 0 || !state.currentCustomer.name || !state.currentCustomer.contactValue && !state.currentCustomer.phone || !state.currentDeliveryDate || !navigator.onLine || document.body.dataset.shopRole === "viewer";
  checkoutBtn.classList.toggle("checkout-not-ready", notReady);
  if (state.isEditingOrder) {
    checkoutBtn.textContent = "\u66F4\u65B0\u8A02\u55AE";
  } else {
    checkoutBtn.textContent = "\u5EFA\u7ACB\u8A02\u55AE";
  }
  updateCartModalDisplay();
  scheduleDraftSave();
}
function generateGiftboxDetailsHtml(giftboxItem) {
  if (!giftboxItem.products || Object.keys(giftboxItem.products).length === 0) {
    return "";
  }
  const detailItems = [];
  for (const [productId, quantity] of Object.entries(giftboxItem.products)) {
    const product = state.allProducts.find((p) => p.productId === productId);
    if (product && quantity > 0) {
      detailItems.push(`${escapeHtml(product.productName)} \xD7 ${quantity}`);
    }
  }
  if (detailItems.length === 0) {
    return "";
  }
  return `
                <div class="giftbox-details">
                    <div class="giftbox-details-content">
                        ${detailItems.join(" | ")}
                    </div>
                </div>
            `;
}

// src/app/dialogs.js
function showConfirmModal(message, callback) {
  document.getElementById("confirmModalMessage").textContent = message;
  state.confirmCallback = callback;
  document.getElementById("confirmModal").classList.add("active");
}
function closeConfirmModal() {
  document.getElementById("confirmModal").classList.remove("active");
  state.confirmCallback = null;
}
function executeConfirmCallback() {
  if (state.confirmCallback) {
    state.confirmCallback();
  }
}

// src/app/platform.js
function initAccessibleDialogs() {
  document.querySelectorAll(".modal").forEach(function(modal) {
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
  });
  document.querySelectorAll("label:not([for])").forEach(function(label) {
    const control = label.parentElement?.querySelector("input[id], select[id], textarea[id]");
    if (control) label.htmlFor = control.id;
  });
  document.querySelectorAll("input:not([aria-label]), select:not([aria-label]), textarea:not([aria-label])").forEach(function(control) {
    if (!control.labels?.length)
      control.setAttribute("aria-label", control.placeholder || control.id || "\u8F38\u5165\u6B04\u4F4D");
  });
  document.querySelectorAll("button").forEach(function(button) {
    if (!button.getAttribute("aria-label") && !button.textContent.trim()) {
      const icon = button.querySelector("i");
      if (icon?.classList.contains("fa-plus")) button.setAttribute("aria-label", "\u589E\u52A0\u6578\u91CF");
      else if (icon?.classList.contains("fa-minus")) button.setAttribute("aria-label", "\u6E1B\u5C11\u6578\u91CF");
      else if (icon?.classList.contains("fa-trash-alt")) button.setAttribute("aria-label", "\u522A\u9664");
      else if (icon?.classList.contains("fa-times")) button.setAttribute("aria-label", "\u95DC\u9589");
      else if (icon?.classList.contains("fa-chevron-left")) button.setAttribute("aria-label", "\u4E0A\u4E00\u500B\u6708");
      else if (icon?.classList.contains("fa-chevron-right")) button.setAttribute("aria-label", "\u4E0B\u4E00\u500B\u6708");
      else if (button.textContent.trim() === "\xD7") button.setAttribute("aria-label", "\u95DC\u9589");
    }
  });
}
function initVisibleViewportFit() {
  const probe = document.getElementById("viewportProbe");
  if (!probe || typeof IntersectionObserver === "undefined") return;
  const thresholds = [];
  for (let i = 0; i <= 100; i++) thresholds.push(i / 100);
  state.viewportProbeObserver = new IntersectionObserver(
    function(entries) {
      applyVisibleViewport(entries[entries.length - 1]);
    },
    { threshold: thresholds }
  );
  state.viewportProbeObserver.observe(probe);
  window.addEventListener("resize", scheduleViewportRemeasure);
  window.addEventListener("orientationchange", scheduleViewportRemeasure);
  document.addEventListener("visibilitychange", scheduleViewportRemeasure);
  window.addEventListener("touchend", scheduleViewportRemeasure, { passive: true });
  setTimeout(scheduleViewportRemeasure, 300);
  setTimeout(scheduleViewportRemeasure, 1500);
}
function scheduleViewportRemeasure() {
  if (!state.viewportProbeObserver) return;
  clearTimeout(state.viewportRemeasureTimer);
  state.viewportRemeasureTimer = setTimeout(function() {
    const probe = document.getElementById("viewportProbe");
    if (!probe) return;
    state.viewportProbeObserver.unobserve(probe);
    state.viewportProbeObserver.observe(probe);
  }, 150);
}
function applyVisibleViewport(entry) {
  if (!entry || !entry.intersectionRect) return;
  const frameHeight = window.innerHeight;
  const rect = entry.intersectionRect;
  if (!frameHeight || rect.height <= 0) return;
  let top = Math.max(0, Math.round(rect.top));
  let bottom = Math.max(0, Math.round(frameHeight - rect.bottom));
  if (!isFinite(top) || !isFinite(bottom)) return;
  if (top + bottom < 8) {
    top = 0;
    bottom = 0;
  }
  if (frameHeight - top - bottom < 320) return;
  const root = document.documentElement;
  if (root.style.getPropertyValue("--vp-top") === top + "px" && root.style.getPropertyValue("--vp-bottom") === bottom + "px") {
    return;
  }
  root.style.setProperty("--vp-top", top + "px");
  root.style.setProperty("--vp-bottom", bottom + "px");
}
function detectDevice() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isMobile = /android|iPad|iPhone|iPod/i.test(userAgent);
  const body = document.body;
  if (isMobile) {
    body.classList.add("mobile-device");
  } else {
    body.classList.add("desktop-device");
  }
  const deviceOsEl = document.getElementById("deviceOs");
  const layoutModeEl = document.getElementById("layoutMode");
  const fullUserAgentEl = document.getElementById("fullUserAgent");
  if (deviceOsEl) {
    let os = "\u672A\u77E5";
    if (userAgent.indexOf("Win") !== -1) os = "Windows";
    else if (userAgent.indexOf("Mac") !== -1) os = "macOS";
    else if (userAgent.indexOf("Linux") !== -1) os = "Linux";
    else if (userAgent.indexOf("Android") !== -1) os = "Android";
    else if (userAgent.indexOf("iPhone") !== -1 || userAgent.indexOf("iPad") !== -1) os = "iOS";
    deviceOsEl.value = os;
  }
  if (layoutModeEl) {
    layoutModeEl.value = isMobile ? "\u884C\u52D5\u88DD\u7F6E\u6A21\u5F0F" : "\u684C\u9762\u6A21\u5F0F";
  }
  if (fullUserAgentEl) {
    fullUserAgentEl.value = userAgent;
  }
}
function initializeButtonStates() {
  const importantButtons = ["proceedStep3"];
  importantButtons.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn && !btn.dataset.protectedClick) {
      const originalOnclick = btn.onclick;
      if (originalOnclick) {
        btn.onclick = preventDoubleClick(btnId, originalOnclick, 2e3);
        btn.dataset.protectedClick = "true";
      }
    }
  });
}
function initEscapeToClose() {
  document.addEventListener("keydown", function(e) {
    if (e.key !== "Escape") return;
    const activeModals = document.querySelectorAll(".modal.active");
    if (activeModals.length > 0) {
      const top = activeModals[activeModals.length - 1];
      top.classList.remove("active");
      if (!top.id) top.remove();
      return;
    }
    const cartModal = document.getElementById("cartModal");
    if (cartModal && cartModal.classList.contains("active")) {
      closeCartModal();
    }
  });
}
function initializeModalCloseHandlers() {
  const modals = document.querySelectorAll(".modal");
  modals.forEach((modal) => {
    if (!modal.onclick) {
      const modalId = modal.id;
      switch (modalId) {
        case "cartModal":
          modal.onclick = closeCartModal;
          break;
        case "productModal":
          modal.onclick = closeProductModal;
          break;
        case "productEditModal":
          modal.onclick = closeProductEditModal;
          break;
        case "confirmModal":
          modal.onclick = closeConfirmModal;
          break;
        default:
          modal.onclick = function() {
            this.classList.remove("active");
            if (!document.getElementById(modalId)) {
              this.remove();
            }
          };
      }
    }
    const modalContent = modal.querySelector(".modal-content");
    if (modalContent && !modalContent.onclick) {
      modalContent.onclick = function(event2) {
        event2.stopPropagation();
      };
    }
  });
}
function showSectionById(sectionName) {
  showSection(sectionName, document.getElementById("nav-" + sectionName));
}
function setDefaultDate() {
  const today = getTaipeiDate();
  document.getElementById("deliveryDate").value = today;
}
function getTaipeiDate() {
  const now = /* @__PURE__ */ new Date();
  const taipeiTime = new Date(now.getTime() + 8 * 60 * 60 * 1e3);
  return taipeiTime.toISOString().split("T")[0];
}

// src/app/order-status.js
function updateOrderStatus(orderId, newStatus) {
  const updateBtn = window.event?.currentTarget?.tagName === "BUTTON" ? window.event.currentTarget : null;
  if (updateBtn) setButtonLoading(updateBtn, true, "\u66F4\u65B0\u4E2D...");
  if (isConnected()) {
    rpc.withSuccessHandler(function(result) {
      if (updateBtn) setButtonLoading(updateBtn, false);
      showAlert(`\u8A02\u55AE\u72C0\u614B\u5DF2\u66F4\u65B0\u70BA: ${newStatus}`, "success");
      refreshOrderDisplays(orderId, newStatus);
    }).withFailureHandler(function(error) {
      if (updateBtn) setButtonLoading(updateBtn, false);
      handleError(error);
    }).updateOrderStatus(orderId, newStatus);
  } else {
    if (updateBtn) setButtonLoading(updateBtn, false);
    showAlert("\u5C1A\u672A\u9023\u63A5 Firebase\uFF0C\u7121\u6CD5\u66F4\u65B0\u8A02\u55AE", "error");
  }
}
function refreshOrderDisplays(orderId, newStatus) {
  const cachedOrder = state.currentSearchOrders.find((order) => (order.id || order.orderId) === orderId);
  if (cachedOrder) cachedOrder.status = newStatus;
  const searchResults = document.getElementById("searchResults");
  if (searchResults) {
    searchResults.querySelectorAll("tbody tr").forEach((row) => {
      const detailBtn = row.querySelector(`button[data-oid="${orderId}"]`);
      if (detailBtn) {
        const pill = row.querySelector(".status-pill");
        if (pill) {
          pill.textContent = newStatus;
          pill.className = "status-pill " + getStatusPillClass(newStatus);
        }
      }
    });
  }
  const orderDetailModals = document.querySelectorAll(".modal.active");
  orderDetailModals.forEach((modal) => {
    const modalContent = modal.textContent;
    if (modalContent.includes(orderId)) {
      modal.querySelectorAll(".order-info-item").forEach((item) => {
        const label = item.querySelector(".order-info-label");
        const pill = item.querySelector(".status-pill");
        if (label && pill && label.textContent.includes("\u8A02\u55AE\u72C0\u614B")) {
          pill.textContent = newStatus;
          pill.className = "status-pill " + getStatusPillClass(newStatus);
        }
      });
      const modalFooter = modal.querySelector(".modal-footer");
      if (modalFooter) {
        updateModalButtons(modalFooter, orderId, newStatus);
      }
    }
  });
}
function getStatusPillClass(status) {
  switch (status) {
    case "\u5DF2\u78BA\u8A8D":
      return "pill-blue";
    case "\u5DF2\u4ED8\u8A02\u91D1":
      return "pill-amber";
    case "\u5DF2\u4ED8\u6E05":
      return "pill-green";
    case "\u5DF2\u4ED8\u6B3E":
      return "pill-green";
    // 向下相容
    case "\u5B8C\u6210":
      return "pill-deep-green";
    case "\u53D6\u6D88":
      return "pill-red";
    default:
      return "pill-gray";
  }
}
function updateModalButtons(modalFooter, orderId, newStatus) {
  const existingButtons = modalFooter.querySelectorAll(".btn-success");
  existingButtons.forEach((btn) => {
    if (btn.textContent.includes("\u5DF2\u4ED8\u6B3E") || btn.textContent.includes("\u5B8C\u6210")) {
      btn.remove();
    }
  });
  const editBtn = modalFooter.querySelector('button[onclick*="editOrder"]');
  if (editBtn && newStatus !== "\u5DF2\u4ED8\u6B3E" && newStatus !== "\u5B8C\u6210") {
    if (newStatus !== "\u5DF2\u4ED8\u6B3E") {
      const paymentBtn = document.createElement("button");
      paymentBtn.className = "btn btn-success";
      paymentBtn.textContent = "\u5DF2\u4ED8\u6B3E";
      paymentBtn.onclick = function() {
        updateOrderStatus(orderId, "\u5DF2\u4ED8\u6B3E");
        this.closest(".modal").remove();
      };
      modalFooter.insertBefore(paymentBtn, editBtn.nextSibling);
    }
  }
  if (newStatus !== "\u5B8C\u6210") {
    const completeBtn = document.createElement("button");
    completeBtn.className = "btn btn-success";
    completeBtn.textContent = "\u5B8C\u6210";
    completeBtn.onclick = function() {
      updateOrderStatus(orderId, "\u5B8C\u6210");
      this.closest(".modal").remove();
    };
    modalFooter.insertBefore(completeBtn, modalFooter.lastElementChild);
  }
}

// src/app/search.js
function searchOrders() {
  const searchBtn = document.querySelector(".btn-search");
  const rawContact = state.currentSearchContactMethod === "line" ? "LINE" : document.getElementById("searchPhone").value.trim();
  const criteria = {
    contact: rawContact,
    contactType: state.currentSearchContactMethod,
    name: document.getElementById("searchName").value.trim(),
    date: document.getElementById("searchDate").value,
    status: document.getElementById("searchStatus")?.value || "",
    pageSize: 30,
    cursor: null,
    paginated: true
  };
  if (!criteria.contact && !criteria.name && !criteria.date && !criteria.status) {
    showAlert("\u8ACB\u81F3\u5C11\u63D0\u4F9B\u4E00\u500B\u641C\u5C0B\u689D\u4EF6", "error");
    return;
  }
  state.lastSearchCriteria = criteria;
  state.searchNextCursor = null;
  setButtonLoading(searchBtn, true, "\u641C\u5C0B\u4E2D...");
  if (isConnected()) {
    rpc.withSuccessHandler(function(result) {
      setButtonLoading(searchBtn, false);
      const page = Array.isArray(result) ? { orders: result, pagination: {} } : result;
      state.searchNextCursor = page?.pagination?.nextCursor || null;
      handleSearchResults(page?.orders || []);
    }).withFailureHandler(function(error) {
      setButtonLoading(searchBtn, false);
      renderSearchError(error);
    }).searchOrders(criteria);
  } else {
    setButtonLoading(searchBtn, false);
    renderSearchError(new Error("\u5C1A\u672A\u9023\u63A5 Firebase"));
  }
}
function renderSearchError(error) {
  document.getElementById("searchResults").innerHTML = `<div class="search-error" role="alert"><i class="fas fa-wifi"></i><strong>\u7121\u6CD5\u53D6\u5F97\u8A02\u55AE</strong><span>${escapeHtml(error?.message || "\u8ACB\u6AA2\u67E5\u9023\u7DDA\u5F8C\u91CD\u8A66")}</span><button type="button" onclick="searchOrders()">\u91CD\u65B0\u641C\u5C0B</button></div>`;
}
function loadMoreOrders() {
  if (!state.lastSearchCriteria || !state.searchNextCursor || state.isLoadingMoreOrders) return;
  state.isLoadingMoreOrders = true;
  const button = document.getElementById("searchLoadMore");
  if (button) setButtonLoading(button, true, "\u8F09\u5165\u4E2D...");
  rpc.withSuccessHandler(function(result) {
    state.isLoadingMoreOrders = false;
    const page = Array.isArray(result) ? { orders: result, pagination: {} } : result;
    state.searchNextCursor = page?.pagination?.nextCursor || null;
    state.currentSearchOrders = state.currentSearchOrders.concat(page?.orders || []);
    displayOrderTable(state.currentSearchOrders, "searchResults", "search");
  }).withFailureHandler(function(error) {
    state.isLoadingMoreOrders = false;
    if (button) setButtonLoading(button, false);
    showAlert(error?.message || "\u8F09\u5165\u4E0B\u4E00\u9801\u5931\u6557", "error");
  }).searchOrders({ ...state.lastSearchCriteria, cursor: state.searchNextCursor });
}
function handleSearchResults(orders) {
  displayOrderTable(orders, "searchResults", "search");
}
function displayOrderTable(orders, containerId, type = "search") {
  const container = document.getElementById(containerId);
  state.currentOrderTableType = type;
  if (type === "search") {
    state.currentSearchOrders = orders || [];
    const stillExists = state.currentSearchOrders.some(
      (order) => (order.id || order.orderId) === state.expandedSearchOrderId
    );
    if (!stillExists) state.expandedSearchOrderId = null;
    const collapsingStillExists = state.currentSearchOrders.some(
      (order) => (order.id || order.orderId) === state.collapsingSearchOrderId
    );
    if (!collapsingStillExists) state.collapsingSearchOrderId = null;
  }
  if (!orders || orders.length === 0) {
    const message = type === "overdue" ? '<div class="result-banner success"><i class="fas fa-check-circle"></i><span>\u76EE\u524D\u6C92\u6709\u904E\u671F\u672A\u5B8C\u6210\u7684\u8A02\u55AE</span></div>' : '<div class="result-banner neutral"><i class="fas fa-inbox"></i><span>\u672A\u627E\u5230\u7B26\u5408\u689D\u4EF6\u7684\u8A02\u55AE</span></div>';
    container.innerHTML = message;
    return;
  }
  let headerContent = "";
  if (type === "overdue") {
    headerContent = `
                    <div class="result-banner danger"><i class="fas fa-exclamation-triangle"></i><span>\u767C\u73FE ${orders.length} \u7B46\u904E\u671F\u672A\u5B8C\u6210\u7684\u8A02\u55AE</span></div>
                    <h3 class="result-title">\u904E\u671F\u672A\u5B8C\u6210\u8A02\u55AE (${orders.length} \u7B46)</h3>`;
  } else {
    headerContent = `<h3 class="result-title">\u641C\u5C0B\u7D50\u679C (${orders.length} \u7B46)</h3>`;
  }
  let tableHeaders = "<th>\u59D3\u540D</th><th>\u806F\u7D61\u65B9\u5F0F</th><th>\u4EA4\u8CA8\u65E5</th>";
  if (type === "overdue") {
    tableHeaders += "<th>\u903E\u671F\u5929\u6578</th>";
  }
  tableHeaders += "<th>\u904B\u8CBB</th><th>\u7E3D\u91D1\u984D</th><th>\u5DF2\u4ED8\u8A02\u91D1</th><th>\u5269\u9918\u91D1\u984D</th><th>\u72C0\u614B</th><th>\u64CD\u4F5C</th>";
  const tableRows = orders.map((order) => {
    const isOverdue = type === "overdue";
    let overdueDays = 0;
    const rowClasses = [];
    if (isOverdue) {
      const deliveryDate = new Date(order.deliveryDate);
      const today = /* @__PURE__ */ new Date();
      overdueDays = Math.floor((today - deliveryDate) / (1e3 * 60 * 60 * 24));
      rowClasses.push(overdueDays > 7 ? "row-overdue-severe" : "row-overdue-mild");
    }
    const contactType = order.customerContactType || (order.customerLineId ? "line" : "phone");
    const contactValue = order.customerContactValue || order.customerLineId || order.customerPhone || "-";
    const contactDisplay = contactType === "line" ? "LINE" : contactValue;
    let cells = `
                    <td data-label="\u59D3\u540D">${escapeHtml(order.customerName)}</td>
                    <td data-label="\u806F\u7D61\u65B9\u5F0F">${escapeHtml(contactDisplay)}</td>
                    <td data-label="\u4EA4\u8CA8\u65E5">${formatDisplayDate(order.deliveryDate)}</td>`;
    if (isOverdue) {
      cells += `
                        <td style="text-align: center;">
                            <span class="overdue-badge ${overdueDays > 7 ? "severe" : "mild"}">${overdueDays} \u5929</span>
                        </td>`;
    }
    const orderId = order.id || order.orderId;
    const depositAmount = order.depositAmount || 0;
    const remainingAmount = order.remainingAmount || order.totalAmount;
    const canExpandItems = type === "search" && Array.isArray(order.items);
    const isExpanded = canExpandItems && state.expandedSearchOrderId === orderId;
    const isCollapsing = canExpandItems && state.collapsingSearchOrderId === orderId;
    if (canExpandItems) rowClasses.push("order-summary-row");
    if (isExpanded) rowClasses.push("is-expanded");
    const hasFee = order.shippingFee > 0;
    const shippingFeeDisplay = hasFee ? `NT$ ${order.shippingFee}` : order.shippingNotes === "\u514D\u904B" || order.deliveryType === "\u81EA\u53D6" ? "\u514D\u904B" : "-";
    cells += `
                    <td data-label="\u904B\u8CBB" class="td-fee${hasFee ? " has-fee" : ""}">${shippingFeeDisplay}</td>
                    <td data-label="\u7E3D\u91D1\u984D" class="td-amount">NT$ ${order.totalAmount}</td>
                    <td data-label="\u5DF2\u4ED8\u8A02\u91D1" class="td-deposit${depositAmount > 0 ? " paid" : ""}">NT$ ${depositAmount}</td>
                    <td data-label="\u5269\u9918\u91D1\u984D" class="td-remaining ${remainingAmount > 0 ? "due" : "clear"}">NT$ ${remainingAmount}</td>
                    <td data-label="\u72C0\u614B"><span class="status-pill ${getStatusPillClass(order.status)}">${escapeHtml(order.status)}</span></td>
                    <td data-label="\u64CD\u4F5C">
                        <button class="btn-table btn-table-view" data-oid="${escapeAttr(orderId)}" onclick="event.stopPropagation(); viewOrderDetails(this.dataset.oid)">\u8A73\u60C5</button>
                        ${document.body.dataset.shopRole === "viewer" ? "" : `<button class="btn-table btn-table-delete requires-editor" data-oid="${escapeAttr(orderId)}" data-cname="${escapeAttr(order.customerName)}" onclick="event.stopPropagation(); showDeleteConfirm(this.dataset.oid, this.dataset.cname)">\u522A\u9664</button>`}
                    </td>`;
    const rowClassAttr = rowClasses.length ? ` class="${rowClasses.join(" ")}"` : "";
    const rowClickAttr = canExpandItems ? ` onclick="toggleOrderItems('${escapeHandlerArgument(orderId)}')"` : "";
    const expandedItemsRow = isExpanded || isCollapsing ? renderExpandedOrderItems(order.items, tableHeaders.split("</th>").length - 1, isCollapsing) : "";
    return `<tr${rowClassAttr}${rowClickAttr}>${cells}</tr>${expandedItemsRow}`;
  }).join("");
  container.innerHTML = `
                ${headerContent}
                <div class="table-responsive">
                    <table class="table">
                        <thead><tr>${tableHeaders}</tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                ${type === "search" && state.searchNextCursor ? '<div class="search-pagination"><button id="searchLoadMore" type="button" onclick="loadMoreOrders()">\u8F09\u5165\u66F4\u591A\u8A02\u55AE</button></div>' : ""}`;
}
function toggleOrderItems(orderId) {
  if (state.orderItemsTransitionTimer) return;
  const nextOrderId = state.expandedSearchOrderId === orderId ? null : orderId;
  if (!state.expandedSearchOrderId) {
    state.expandedSearchOrderId = nextOrderId;
    displayOrderTable(state.currentSearchOrders, "searchResults", "search");
    return;
  }
  state.collapsingSearchOrderId = state.expandedSearchOrderId;
  state.expandedSearchOrderId = null;
  displayOrderTable(state.currentSearchOrders, "searchResults", "search");
  state.orderItemsTransitionTimer = setTimeout(function() {
    state.collapsingSearchOrderId = null;
    state.expandedSearchOrderId = nextOrderId;
    state.orderItemsTransitionTimer = null;
    displayOrderTable(state.currentSearchOrders, "searchResults", "search");
  }, 500);
}
function renderExpandedOrderItems(items, columnCount, isCollapsing = false) {
  const collapsingClass = isCollapsing ? " is-collapsing" : "";
  if (!items || items.length === 0) {
    return `<tr class="order-items-row${collapsingClass}"><td colspan="${columnCount}"><div class="order-items-expand"><div class="order-items-empty">\u6B64\u8A02\u55AE\u6C92\u6709\u5546\u54C1\u660E\u7D30</div></div></td></tr>`;
  }
  let itemsHtml = "";
  items.forEach((item) => {
    if (item.isGiftBox && item.giftBoxDetails) {
      itemsHtml += `
                        <tr class="giftbox-row">
                            <td colspan="4"><strong>${escapeHtml(item.productName)} x ${item.quantity}</strong></td>
                        </tr>`;
      Object.entries(item.giftBoxDetails.products || {}).forEach(([productId, qty]) => {
        const product = state.allProducts.find((p) => p.productId === productId);
        const productName = product ? product.productName : `\u5546\u54C1ID: ${productId}`;
        const totalQty = (parseInt(qty) || 0) * (parseInt(item.quantity) || 1);
        itemsHtml += `
                            <tr class="giftbox-subitem-row">
                                <td>\u2514 ${escapeHtml(productName)}</td>
                                <td>${totalQty}</td>
                                <td>-</td>
                                <td>-</td>
                            </tr>`;
      });
      if (item.giftBoxDetails.notes) {
        itemsHtml += `
                            <tr class="giftbox-note-row">
                                <td colspan="4">\u5099\u8A3B: ${escapeHtml(item.giftBoxDetails.notes)}</td>
                            </tr>`;
      }
      let giftboxPriceDisplay = `NT$ ${item.unitPrice}`;
      if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
        giftboxPriceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span><br><span class="special-price-text">\u7279\u50F9 NT$ ${item.unitPrice}</span>`;
      }
      itemsHtml += `
                        <tr class="giftbox-subtotal-row">
                            <td>\u79AE\u76D2\u5C0F\u8A08</td>
                            <td>-</td>
                            <td>${giftboxPriceDisplay}</td>
                            <td>NT$ ${item.subtotal}</td>
                        </tr>`;
    } else {
      let priceDisplay = `NT$ ${item.unitPrice}`;
      if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
        priceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span> <span class="special-price-text">\u7279\u50F9 NT$ ${item.unitPrice}</span>`;
      }
      itemsHtml += `
                        <tr>
                            <td>${escapeHtml(item.productName)}</td>
                            <td>${item.quantity}</td>
                            <td>${priceDisplay}</td>
                            <td>NT$ ${item.subtotal}</td>
                        </tr>`;
    }
  });
  return `
                <tr class="order-items-row${collapsingClass}">
                    <td colspan="${columnCount}">
                        <div class="order-items-expand">
                            <div class="order-items-scroll">
                                <table class="order-items-table">
                                    <thead><tr><th>\u5546\u54C1</th><th>\u6578\u91CF</th><th>\u55AE\u50F9</th><th>\u5C0F\u8A08</th></tr></thead>
                                    <tbody>${itemsHtml}</tbody>
                                </table>
                            </div>
                        </div>
                    </td>
                </tr>`;
}
function formatDisplayDate(dateValue) {
  try {
    if (!dateValue) return "\u672A\u8A2D\u5B9A";
    let date;
    if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === "string") {
      date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return dateValue;
      }
    } else {
      return dateValue.toString();
    }
    return date.toISOString().split("T")[0];
  } catch (error) {
    console.log("\u65E5\u671F\u683C\u5F0F\u5316\u932F\u8AA4:", error);
    return dateValue.toString();
  }
}
function clearSearch() {
  document.getElementById("searchPhone").value = "";
  document.getElementById("searchName").value = "";
  if (state.searchDatepickerInstance) {
    state.searchDatepickerInstance.clear();
  } else {
    document.getElementById("searchDate").value = "";
  }
  document.getElementById("searchResults").innerHTML = "";
  const status = document.getElementById("searchStatus");
  if (status) status.value = "";
  selectSearchContactMethod("phone", false);
  state.searchNextCursor = null;
  state.lastSearchCriteria = null;
}
function searchOverdueOrders() {
  const searchBtn = window.event?.currentTarget || document.querySelector(".btn-overdue");
  setButtonLoading(searchBtn, true, "\u6AA2\u7D22\u4E2D...");
  if (isConnected()) {
    rpc.withSuccessHandler(function(orders) {
      setButtonLoading(searchBtn, false);
      try {
        handleOverdueResults(orders);
      } catch (clientError) {
        console.error("\u8655\u7406\u904E\u671F\u8A02\u55AE\u7D50\u679C\u6642\u767C\u751F\u932F\u8AA4:", clientError);
        showAlert("\u8655\u7406\u904E\u671F\u8A02\u55AE\u7D50\u679C\u6642\u767C\u751F\u932F\u8AA4: " + clientError.message, "error");
      }
    }).withFailureHandler(function(error) {
      setButtonLoading(searchBtn, false);
      handleError(error);
    }).searchOverdueOrders();
  } else {
    setButtonLoading(searchBtn, false);
    renderSearchError(new Error("\u5C1A\u672A\u9023\u63A5 Firebase"));
  }
}
function handleOverdueResults(orders) {
  document.getElementById("searchResults").innerHTML = "";
  displayOrderTable(orders, "searchResults", "overdue");
}

// src/app/capacity.js
function loadCapacitySettings(forceReload) {
  if (state.capacitySettingsLoaded && !forceReload) {
    renderCapacitySettingsUI();
    return;
  }
  if (isConnected()) {
    rpc.withSuccessHandler(function(result) {
      state.capacitySettings = result;
      state.capacitySettingsLoaded = true;
      renderCapacitySettingsUI();
    }).withFailureHandler(function(error) {
      console.warn("\u8F09\u5165\u7522\u80FD\u8A2D\u5B9A\u5931\u6557", error);
      state.capacitySettings = { weekday: {}, dateOverrides: [] };
      state.capacitySettingsLoaded = true;
      renderCapacitySettingsUI();
      showAlert("\u7522\u80FD\u8A2D\u5B9A\u8F09\u5165\u5931\u6557\uFF0C\u8ACB\u91CD\u65B0\u6574\u7406\u5F8C\u518D\u8A66", "error");
    }).getCapacitySettings();
  } else {
    state.capacitySettings = { weekday: {}, dateOverrides: [] };
    state.capacitySettingsLoaded = true;
    renderCapacitySettingsUI();
  }
}
function renderCapacitySettingsUI() {
  var grid = document.getElementById("capacityWeekdayGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (var i = 0; i < 7; i++) {
    var setting = state.capacitySettings.weekday[i.toString()] || {
      dayOfWeek: i,
      maxQuantity: "",
      enabled: false
    };
    var isActive = setting.enabled;
    var col = document.createElement("div");
    col.className = "capacity-day-col" + (isActive ? " active" : "");
    var val = setting.maxQuantity === "" || setting.maxQuantity === null ? "" : setting.maxQuantity;
    col.innerHTML = '<div class="day-name">' + escapeHtml(state.weekdayNames[i]) + '</div><input type="number" min="0" placeholder="0" aria-label="\u661F\u671F' + escapeAttr(state.weekdayNames[i]) + '\u4F9B\u61C9\u91CF\u4E0A\u9650" value="' + val + '" data-day="' + i + '" id="capDay' + i + '"><label class="day-toggle" for="capDayEnabled' + i + '"><input type="checkbox" aria-label="\u555F\u7528\u661F\u671F' + escapeAttr(state.weekdayNames[i]) + '\u4F9B\u61C9\u91CF\u9650\u5236" ' + (isActive ? "checked" : "") + ' data-day="' + i + '" id="capDayEnabled' + i + '"><span class="slider" aria-hidden="true"></span></label>';
    grid.appendChild(col);
  }
  grid.querySelectorAll('input[type="number"], input[type="checkbox"]').forEach(function(el) {
    el.addEventListener("change", function() {
      var checkbox = this;
      if (checkbox.type === "checkbox") {
        var col2 = checkbox.closest(".capacity-day-col");
        if (col2) {
          col2.classList.toggle("active", checkbox.checked);
        }
      }
      debouncedSaveWeekdayCapacity();
    });
  });
  renderOverrideTable();
  applyRoleCapabilities();
}
function renderOverrideTable() {
  const tbody = document.getElementById("overrideTableBody");
  if (!tbody) return;
  if (!state.capacitySettings.dateOverrides || state.capacitySettings.dateOverrides.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #9ca3af; padding: 24px;">\u5C1A\u7121\u65E5\u671F\u8986\u5BEB\u8A2D\u5B9A</td></tr>';
    return;
  }
  var todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  var upcoming = [];
  var expired = [];
  state.capacitySettings.dateOverrides.forEach(function(o) {
    if (o.date >= todayStr) {
      upcoming.push(o);
    } else {
      expired.push(o);
    }
  });
  upcoming.sort(function(a, b) {
    return a.date.localeCompare(b.date);
  });
  expired.sort(function(a, b) {
    return a.date.localeCompare(b.date);
  });
  var sorted = upcoming.concat(expired);
  tbody.innerHTML = sorted.map(function(o) {
    var isExpired = o.date < todayStr;
    var d = new Date(o.date);
    var dayStr = isNaN(d.getTime()) ? "-" : "\u9031" + state.weekdayNames[d.getDay()];
    var maxStr = o.maxQuantity === "" || o.maxQuantity === null || o.maxQuantity === 0 ? "\u4E0D\u9650\u5236" : o.maxQuantity;
    var statusBadge;
    if (isExpired) {
      statusBadge = '<span style="color: #9ca3af;">\u5DF2\u904E\u671F</span>';
    } else if (o.enabled) {
      statusBadge = '<span style="color: #16a34a; font-weight: 600;">\u555F\u7528</span>';
    } else {
      statusBadge = '<span style="color: #9ca3af;">\u505C\u7528</span>';
    }
    var rowStyle = isExpired ? ' style="opacity: 0.5;"' : "";
    var deleteButton = document.body.dataset.shopRole === "viewer" ? "" : '<button class="requires-editor" aria-label="\u522A\u9664 ' + escapeAttr(o.date) + ` \u65E5\u671F\u8986\u5BEB" onclick="deleteDateOverrideById('` + escapeAttr(o.id) + `')" style="padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 0.8rem; cursor: pointer;"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>`;
    return "<tr" + rowStyle + "><td>" + escapeHtml(o.date) + "</td><td>" + dayStr + '</td><td style="font-weight: 600;">' + maxStr + "</td><td>" + statusBadge + '</td><td style="text-align: center;">' + deleteButton + "</td></tr>";
  }).join("");
}
function debouncedSaveWeekdayCapacity() {
  clearTimeout(state._weekdayCapacityDebounceTimer);
  var statusEl = document.getElementById("weekdayAutoSaveStatus");
  if (statusEl) statusEl.textContent = "\u5132\u5B58\u4E2D...";
  state._weekdayCapacityDebounceTimer = setTimeout(function() {
    saveWeekdayCapacitySettings();
  }, 600);
}
function saveWeekdayCapacitySettings() {
  if (document.body.dataset.shopRole === "viewer") {
    showAlert("\u6B64\u5E33\u865F\u53EA\u6709\u6AA2\u8996\u6B0A\u9650", "error");
    return;
  }
  var statusEl = document.getElementById("weekdayAutoSaveStatus");
  var settings = [];
  for (var i = 0; i < 7; i++) {
    var input = document.getElementById("capDay" + i);
    var checkbox = document.getElementById("capDayEnabled" + i);
    var val = input ? input.value.trim() : "";
    settings.push({
      dayOfWeek: i,
      maxQuantity: val === "" ? "" : parseInt(val) || 0,
      enabled: checkbox ? checkbox.checked : false
    });
  }
  if (isConnected()) {
    rpc.withSuccessHandler(function() {
      if (statusEl) statusEl.textContent = "\u5DF2\u81EA\u52D5\u5132\u5B58";
      setTimeout(function() {
        if (statusEl) statusEl.textContent = "";
      }, 2e3);
      settings.forEach(function(s) {
        state.capacitySettings.weekday[s.dayOfWeek.toString()] = s;
      });
      invalidateCapacityCache();
    }).withFailureHandler(function(error) {
      if (statusEl) {
        statusEl.style.color = "#dc2626";
        statusEl.textContent = "\u5132\u5B58\u5931\u6557: " + error.message;
      }
      setTimeout(function() {
        if (statusEl) {
          statusEl.style.color = "#9ca3af";
          statusEl.textContent = "";
        }
      }, 3e3);
    }).saveWeekdayCapacity(settings);
  } else {
    if (statusEl) {
      statusEl.style.color = "#dc2626";
      statusEl.textContent = "\u5C1A\u672A\u9023\u63A5 Firebase\uFF0C\u672A\u5132\u5B58";
    }
  }
}
function parseOverrideDateRange(raw) {
  var dates = [];
  var startDate, endDate;
  if (raw.includes("~")) {
    var parts = raw.split("~").map(function(s) {
      return s.trim();
    });
    startDate = parts[0];
    endDate = parts[1] || parts[0];
  } else {
    startDate = raw.trim();
    endDate = startDate;
  }
  var cur = /* @__PURE__ */ new Date(startDate + "T00:00:00");
  var end = /* @__PURE__ */ new Date(endDate + "T00:00:00");
  if (isNaN(cur.getTime()) || isNaN(end.getTime())) return dates;
  while (cur <= end) {
    var y = cur.getFullYear();
    var m = String(cur.getMonth() + 1).padStart(2, "0");
    var d = String(cur.getDate()).padStart(2, "0");
    dates.push(y + "-" + m + "-" + d);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
function addDateOverride() {
  if (document.body.dataset.shopRole === "viewer") {
    showAlert("\u6B64\u5E33\u865F\u53EA\u6709\u6AA2\u8996\u6B0A\u9650", "error");
    return;
  }
  var dateInput = document.getElementById("overrideDate");
  var qtyInput = document.getElementById("overrideMaxQty");
  var raw = dateInput.value.trim();
  var qty = qtyInput.value.trim();
  if (!raw) {
    showAlert("\u8ACB\u9078\u64C7\u65E5\u671F", "error");
    return;
  }
  var dates = parseOverrideDateRange(raw);
  if (dates.length === 0) {
    showAlert("\u65E5\u671F\u683C\u5F0F\u932F\u8AA4", "error");
    return;
  }
  var maxQty = qty === "" ? "" : parseInt(qty) || 0;
  var settings = dates.map(function(d) {
    return { date: d, maxQuantity: maxQty, enabled: true };
  });
  if (isConnected()) {
    rpc.withSuccessHandler(function() {
      var msg = dates.length === 1 ? "\u65E5\u671F\u8986\u5BEB\u8A2D\u5B9A\u5DF2\u65B0\u589E" : "\u5DF2\u65B0\u589E " + dates.length + " \u5929\u8986\u5BEB\u8A2D\u5B9A";
      showAlert(msg, "success");
      if (state.overrideDatepickerInstance) state.overrideDatepickerInstance.clear();
      qtyInput.value = "";
      settings.forEach(function(s) {
        state.capacitySettings.dateOverrides = state.capacitySettings.dateOverrides.filter(function(o) {
          return o.date !== s.date;
        });
        state.capacitySettings.dateOverrides.push({ ...s, id: s.date });
      });
      state.capacitySettings.dateOverrides.sort(function(a, b) {
        return a.date.localeCompare(b.date);
      });
      renderOverrideTable();
      invalidateCapacityCache();
    }).withFailureHandler(function(error) {
      showAlert("\u65B0\u589E\u5931\u6557: " + error.message, "error");
    }).saveDateOverrideCapacityBatch(settings);
  } else {
    showAlert("\u5C1A\u672A\u9023\u63A5 Firebase\uFF0C\u8A2D\u5B9A\u672A\u5132\u5B58", "error");
  }
}
function deleteDateOverrideById(id) {
  if (document.body.dataset.shopRole === "viewer") {
    showAlert("\u6B64\u5E33\u865F\u53EA\u6709\u6AA2\u8996\u6B0A\u9650", "error");
    return;
  }
  if (!confirm("\u78BA\u5B9A\u8981\u522A\u9664\u6B64\u65E5\u671F\u8986\u5BEB\u8A2D\u5B9A\uFF1F")) return;
  if (isConnected()) {
    rpc.withSuccessHandler(function() {
      showAlert("\u5DF2\u522A\u9664\u65E5\u671F\u8986\u5BEB\u8A2D\u5B9A", "success");
      state.capacitySettings.dateOverrides = state.capacitySettings.dateOverrides.filter(function(o) {
        return o.id !== id && o.date !== id;
      });
      renderOverrideTable();
      invalidateCapacityCache();
    }).withFailureHandler(function(error) {
      showAlert("\u522A\u9664\u5931\u6557: " + error.message, "error");
    }).deleteDateOverrideCapacity(id);
  } else {
    showAlert("\u5C1A\u672A\u9023\u63A5 Firebase\uFF0C\u8A2D\u5B9A\u672A\u522A\u9664", "error");
  }
}
function loadMonthCapacity(year, month, callback) {
  const key = year + "-" + month;
  if (state.monthCapacityCache[key]) {
    if (callback) callback(state.monthCapacityCache[key]);
    return;
  }
  if (state.capacityInflight[key]) {
    if (callback) state.capacityInflight[key].push(callback);
    return;
  }
  state.capacityInflight[key] = callback ? [callback] : [];
  function resolveCallbacks(data) {
    state.monthCapacityCache[key] = data;
    const cbs = state.capacityInflight[key] || [];
    delete state.capacityInflight[key];
    cbs.forEach(function(cb) {
      cb(data);
    });
  }
  if (isConnected()) {
    rpc.withSuccessHandler(function(result) {
      resolveCallbacks(result);
    }).withFailureHandler(function(error) {
      console.warn("\u8F09\u5165\u6708\u7522\u80FD\u5931\u6557", error);
      resolveCallbacks({});
    }).getMonthCapacityStatus(year, month);
  } else {
    resolveCallbacks({});
  }
}
function invalidateCapacityCache() {
  state.monthCapacityCache = {};
}
function getCapacityIndicatorHtml(info) {
  if (!info || !info.hasLimit) {
    return "";
  }
  const used = info.currentQuantity || 0;
  const limit = info.limit || 0;
  let colorClass = "cap-green";
  const rate = info.usageRate || 0;
  if (info.status === "full" || rate >= 100) {
    colorClass = "cap-red";
  } else if (info.status === "nearFull" || rate >= 90) {
    colorClass = "cap-orange";
  } else if (info.status === "warning" || rate >= 70) {
    colorClass = "cap-yellow";
  }
  return '<div class="cap-indicator ' + colorClass + '">' + used + "/" + limit + "</div>";
}

// src/app/calendar.js
function renderCalendar(skipCapacityLoad) {
  const grid = document.getElementById("calendar-grid");
  const monthYearLabel = document.getElementById("calendar-month-year");
  if (!grid || !monthYearLabel) return;
  grid.innerHTML = "";
  monthYearLabel.innerText = `${state.calendarState.currYear}\u5E74 ${state.monthNames[state.calendarState.currMonth]}`;
  const firstDay = new Date(state.calendarState.currYear, state.calendarState.currMonth, 1).getDay();
  const daysInMonth = new Date(state.calendarState.currYear, state.calendarState.currMonth + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement("div");
    grid.appendChild(emptyCell);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const dayBtn = document.createElement("button");
    dayBtn.type = "button";
    dayBtn.className = "calendar-day";
    const thisDateStr = `${state.calendarState.currYear}-${String(state.calendarState.currMonth + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    const dayNum = document.createElement("span");
    dayNum.textContent = i;
    dayBtn.appendChild(dayNum);
    dayBtn.dataset.date = thisDateStr;
    dayBtn.setAttribute("aria-label", thisDateStr);
    dayBtn.setAttribute("aria-pressed", String(thisDateStr === state.calendarState.selectedDateStr));
    if (thisDateStr === state.calendarState.selectedDateStr) {
      dayBtn.classList.add("selected");
    }
    const checkDate = new Date(state.calendarState.currYear, state.calendarState.currMonth, i);
    checkDate.setHours(23, 59, 59);
    if (checkDate < (/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0)) {
      dayBtn.classList.add("disabled");
      dayBtn.disabled = true;
    } else {
      dayBtn.onclick = () => selectCalendarDate(i);
    }
    grid.appendChild(dayBtn);
  }
  function applyCapacityIndicators(capData) {
    if (!capData) return;
    const cells = grid.querySelectorAll(".calendar-day");
    cells.forEach(function(cell) {
      const dateStr = cell.dataset.date;
      if (dateStr && capData[dateStr]) {
        const indicator = getCapacityIndicatorHtml(capData[dateStr]);
        const info = capData[dateStr];
        cell.setAttribute(
          "aria-label",
          dateStr + (info.hasLimit ? `\uFF0C\u5DF2\u6392\u5B9A ${info.currentQuantity} \u4EF6\uFF0C\u4E0A\u9650 ${info.limit} \u4EF6` : "\uFF0C\u4E0D\u9650\u4F9B\u61C9\u91CF")
        );
        if (indicator) {
          const existing = cell.querySelector(".cap-indicator");
          if (existing) existing.remove();
          cell.insertAdjacentHTML("beforeend", indicator);
        }
      }
    });
  }
  const capKey = state.calendarState.currYear + "-" + (state.calendarState.currMonth + 1);
  if (state.monthCapacityCache[capKey]) {
    applyCapacityIndicators(state.monthCapacityCache[capKey]);
  } else if (!skipCapacityLoad) {
    loadMonthCapacity(
      state.calendarState.currYear,
      state.calendarState.currMonth + 1,
      applyCapacityIndicators
    );
  }
}
function changeMonth(offset) {
  state.calendarState.currMonth += offset;
  if (state.calendarState.currMonth > 11) {
    state.calendarState.currMonth = 0;
    state.calendarState.currYear++;
  } else if (state.calendarState.currMonth < 0) {
    state.calendarState.currMonth = 11;
    state.calendarState.currYear--;
  }
  renderCalendar();
  document.querySelector(`[data-date="${state.calendarState.selectedDateStr}"]`)?.focus({ preventScroll: true });
}
function selectCalendarDate(day) {
  state.calendarState.selectedDateStr = `${state.calendarState.currYear}-${String(state.calendarState.currMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  renderCalendar();
  const weekDay = new Date(state.calendarState.currYear, state.calendarState.currMonth, day).getDay();
  const weekStr = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"][weekDay];
  document.getElementById("selected-date-display").innerHTML = `\u5DF2\u9078\u64C7\uFF1A<span class="text-blue-600 font-bold text-xl">${state.calendarState.currYear}/${state.calendarState.currMonth + 1}/${day} (\u9031${weekStr})</span>`;
  document.getElementById("deliveryDate").value = state.calendarState.selectedDateStr;
  const btn = document.getElementById("btn-confirm-date");
  btn.disabled = false;
  btn.classList.remove("bg-gray-300", "cursor-not-allowed");
  btn.classList.add("bg-blue-600", "hover:bg-blue-700", "shadow-lg");
  btn.innerHTML = `\u78BA\u8A8D\u65E5\u671F <i class="fas fa-check ml-2"></i>`;
}
function confirmDateSelection() {
  if (!state.calendarState.selectedDateStr) return;
  setDeliveryDate();
}

// src/app/catalog.js
function setDeliveryDate() {
  const dateBtn = window.event?.currentTarget || window.event?.target;
  const date = document.getElementById("deliveryDate").value;
  if (!date) {
    showAlert("\u8ACB\u9078\u64C7\u4EA4\u8CA8\u65E5\u671F", "error");
    return;
  }
  state.currentDeliveryDate = date;
  updateCartDisplay();
  showAlert(`\u4EA4\u8CA8\u65E5\u671F\u5DF2\u8A2D\u5B9A: ${date}`, "success");
  if (dateBtn) setButtonLoading(dateBtn, false);
  showSectionById("gift");
}
function loadProducts() {
  const giftContainer = document.getElementById("giftProducts");
  const cakeContainer = document.getElementById("cakeProducts");
  giftContainer.innerHTML = '<p style="text-align: center; padding: 20px;">\u8F09\u5165\u5546\u54C1\u4E2D...</p>';
  cakeContainer.innerHTML = '<p style="text-align: center; padding: 20px;">\u8F09\u5165\u5546\u54C1\u4E2D...</p>';
  if (isConnected()) {
    rpc.withSuccessHandler(handleProductsLoaded).withFailureHandler(function(error) {
      showProductLoadFailure(error);
    }).getProducts();
  } else {
    showProductLoadFailure(new Error("\u5C1A\u672A\u9023\u63A5 Firebase"));
  }
}
async function cacheProducts(products) {
  const key = catalogStorageKey();
  if (!key) return;
  await localDbPut("catalogs", key, { products, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).catch(function() {
  });
}
async function showProductLoadFailure(error) {
  console.warn("\u5546\u54C1\u8CC7\u6599\u8F09\u5165\u5931\u6557", error);
  const key = catalogStorageKey();
  const cached = key ? await localDbGet("catalogs", key).catch(function() {
    return null;
  }) : null;
  if (cached?.products?.length) {
    handleProductsLoaded(cached.products, { skipCache: true });
    document.querySelectorAll("#giftProducts, #cakeProducts").forEach(function(container) {
      container.insertAdjacentHTML(
        "afterbegin",
        `<div class="product-stale-banner col-span-full"><i class="fas fa-cloud-slash"></i> \u7121\u6CD5\u9023\u7DDA\uFF0C\u986F\u793A ${formatDisplayDate(cached.updatedAt)} \u7684\u5546\u54C1\u8CC7\u6599 <button type="button" onclick="loadProducts()">\u91CD\u8A66</button></div>`
      );
    });
    return;
  }
  const message = `<div class="product-load-error col-span-full" role="alert"><i class="fas fa-wifi"></i><strong>\u5546\u54C1\u8F09\u5165\u5931\u6557</strong><span>${escapeHtml(error?.message || "\u8ACB\u6AA2\u67E5\u7DB2\u8DEF\u9023\u7DDA")}</span><button type="button" onclick="loadProducts()">\u91CD\u65B0\u8F09\u5165</button></div>`;
  document.getElementById("giftProducts").innerHTML = message;
  document.getElementById("cakeProducts").innerHTML = message;
}
function loadInitialShopData() {
  const now = /* @__PURE__ */ new Date();
  if (!isConnected()) {
    showProductLoadFailure(new Error("\u5C1A\u672A\u9023\u63A5 Firebase"));
    renderCalendar();
    return;
  }
  rpc.withSuccessHandler(function(result) {
    handleProductsLoaded(result?.products || []);
    if (result?.capacityMonth?.key) {
      state.monthCapacityCache[result.capacityMonth.key] = result.capacityMonth.data || {};
    }
    renderCalendar();
  }).withFailureHandler(function(error) {
    console.warn("\u521D\u59CB\u8CC7\u6599\u8F09\u5165\u5931\u6557\uFF0C\u6539\u7528\u5546\u54C1\u91CD\u8A66\u6D41\u7A0B", error);
    loadProducts();
    renderCalendar();
  }).getShopBootstrap(now.getFullYear(), now.getMonth() + 1);
}
function handleProductsLoaded(products, options = {}) {
  state.allProducts = Array.isArray(products) ? products : [];
  if (!options.skipCache) cacheProducts(state.allProducts);
  renderProductCards();
  updateProductDisplays();
  updateNavVisibility();
  restoreOrderDraftOnce();
}
function updateNavVisibility() {
  const activeProducts = state.allProducts.filter((p) => p.status === "\u555F\u7528");
  const hasGift = activeProducts.some((p) => p.category === "\u4F34\u624B\u79AE");
  const hasCake = activeProducts.some((p) => p.category === "\u559C\u9905");
  const hasGiftbox = activeProducts.some((p) => p.giftBoxEnabled === "\u662F");
  document.getElementById("nav-gift").style.display = hasGift ? "" : "none";
  document.getElementById("nav-cake").style.display = hasCake ? "" : "none";
  document.getElementById("nav-giftbox").style.display = hasGiftbox ? "" : "none";
}
function updateProductDisplays() {
  loadProductsByCategory("\u4F34\u624B\u79AE", "gift");
  loadProductsByCategory("\u559C\u9905", "cake");
}
function loadProductsByCategory(category, containerId) {
  const query = document.getElementById(containerId + "ProductSearch")?.value.trim().toLocaleLowerCase() || "";
  const products = state.allProducts.filter(
    (p) => p.category === category && p.status === "\u555F\u7528" && (!query || `${p.productName} ${p.description || ""}`.toLocaleLowerCase().includes(query))
  );
  const container = document.getElementById(containerId + "Products");
  container.classList.remove("loading");
  if (products.length === 0) {
    container.innerHTML = `<div class="col-span-full workspace-empty" role="status"><h3>${query ? "\u627E\u4E0D\u5230\u7B26\u5408\u7684\u5546\u54C1" : "\u76EE\u524D\u6C92\u6709\u555F\u7528\u7684\u5546\u54C1"}</h3><p>${query ? "\u8A66\u8A66\u5176\u4ED6\u540D\u7A31\uFF0C\u6216\u6E05\u9664\u641C\u5C0B\u689D\u4EF6\u3002" : "\u53EF\u5728\u300C\u7BA1\u7406\u300D\u7684\u300C\u5546\u54C1\u7BA1\u7406\u300D\u65B0\u589E\u6216\u555F\u7528\u5546\u54C1\u3002"}</p></div>`;
    return;
  }
  const companyBanner = state.isCompanyCustomer ? '<div class="company-mode-banner col-span-full"><i class="fas fa-building"></i>\u76EE\u524D\u70BA\u4F01\u696D\u5BA2\u6236\u6A21\u5F0F\uFF0C\u5546\u54C1\u5DF2\u5957\u7528\u4F01\u696D\u50F9\u683C</div>' : "";
  const iconClass = category === "\u4F34\u624B\u79AE" ? "fa-cookie-bite" : "fa-birthday-cake";
  const bgClass = category === "\u4F34\u624B\u79AE" ? "bg-orange-50 text-orange-300" : "bg-pink-50 text-pink-300";
  const hoverBorderClass = category === "\u4F34\u624B\u79AE" ? "hover:border-orange-300" : "hover:border-pink-300";
  container.innerHTML = companyBanner + products.map((p) => {
    const effectivePrice = getEffectivePrice(p);
    const isCompanyPriceActive = state.isCompanyCustomer && p.companyPrice && parseFloat(p.companyPrice) > 0 && parseFloat(p.companyPrice) !== parseFloat(p.price);
    return `
                <div class="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col border ${hoverBorderClass} transition group relative h-full">
                    <!-- \u4E0A\u534A\u90E8\uFF1A\u9EDE\u64CA\u67E5\u770B\u8A73\u60C5/\u7279\u50F9 -->
                    <div class="cursor-pointer flex-1 flex flex-col" onclick="showProductDetail('${escapeHandlerArgument(p.productId)}')">
                        <div class="h-32 ${bgClass} flex items-center justify-center relative overflow-hidden">
                            <i class="fas ${iconClass} text-5xl transform group-hover:scale-110 transition-transform duration-300"></i>
                            ${isCompanyPriceActive ? '<div class="absolute top-2 left-2 bg-indigo-600 text-white text-xs px-2 py-1 rounded-full font-bold shadow-sm">\u4F01\u696D\u50F9</div>' : ""}
                        </div>
                        <div class="p-4 pb-2 flex-1">
                            <h3 class="font-bold text-lg mb-1 text-gray-800 line-clamp-2 h-14">${escapeHtml(p.productName)}</h3>
                            <p class="text-red-500 font-bold text-xl">${isCompanyPriceActive ? '<span class="company-original-price">NT$ ' + p.price + "</span>" : ""}NT$ ${effectivePrice}${isCompanyPriceActive ? '<span class="company-price-tag">\u4F01\u696D\u50F9</span>' : ""}</p>
                        </div>
                    </div>

                    <!-- \u4E0B\u534A\u90E8\uFF1A\u64CD\u4F5C\u6309\u9215 -->
                    <div class="p-4 pt-0 mt-auto">
                        <div class="flex items-center justify-between gap-3 bg-gray-50 p-2 rounded-lg border border-gray-100">
                            <button onclick="showProductDetail('${escapeHandlerArgument(p.productId)}')" class="flex-1 py-2 px-2 text-gray-600 text-sm font-medium hover:text-blue-600 transition flex items-center justify-center gap-1">
                                <i class="fas fa-edit"></i> \u8A73\u60C5
                            </button>
                            <div class="w-px h-6 bg-gray-300"></div>
                            <button onclick="addToCartDirectly('${escapeHandlerArgument(p.productId)}', '${escapeHandlerArgument(category)}')" class="w-10 h-10 bg-white border border-blue-200 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm active:scale-95 transition">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
  }).join("");
}
function addToCartDirectly(productId, category) {
  event.stopPropagation();
  const btn = window.event?.currentTarget || window.event?.target;
  if (btn.dataset.animating === "true") {
    const product2 = state.allProducts.find((p) => p.productId === productId);
    if (!product2) return;
    const cart2 = category === "\u4F34\u624B\u79AE" ? state.giftCart : state.cakeCart;
    const existingItem2 = cart2.find(
      (item) => item.productId === productId && !item.isSpecialPrice && !item.isCompanyPrice === !state.isCompanyCustomer && (!item.notes || item.notes === "")
    );
    if (existingItem2) {
      existingItem2.quantity += 1;
    } else {
      cart2.push({
        productId: product2.productId,
        productName: product2.productName,
        price: getEffectivePrice(product2),
        quantity: 1,
        category,
        isSpecialPrice: false,
        isCompanyPrice: state.isCompanyCustomer,
        notes: ""
      });
    }
    updateCartDisplay();
    return;
  }
  const product = state.allProducts.find((p) => p.productId === productId);
  if (!product) return;
  const cart = category === "\u4F34\u624B\u79AE" ? state.giftCart : state.cakeCart;
  const existingItem = cart.find(
    (item) => item.productId === productId && !item.isSpecialPrice && !item.isCompanyPrice === !state.isCompanyCustomer && (!item.notes || item.notes === "")
  );
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      productId: product.productId,
      productName: product.productName,
      price: getEffectivePrice(product),
      quantity: 1,
      category,
      isSpecialPrice: false,
      isCompanyPrice: state.isCompanyCustomer,
      notes: ""
    });
  }
  updateCartDisplay();
  const originalContent = '<i class="fas fa-plus"></i>';
  const originalClasses = "w-10 h-10 bg-white border border-blue-200 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm active:scale-95 transition add-to-cart-btn";
  btn.dataset.animating = "true";
  btn.innerHTML = '<i class="fas fa-check"></i>';
  btn.className = "w-10 h-10 bg-green-500 text-white rounded-lg flex items-center justify-center shadow-md transition add-to-cart-btn";
  setTimeout(() => {
    btn.innerHTML = originalContent;
    btn.className = originalClasses;
    btn.dataset.animating = "false";
  }, 600);
}

// src/app/products.js
function renderProductCards() {
  const grid = document.getElementById("productsCardGrid");
  const tabsContainer = document.getElementById("productsFilterTabs");
  const categories = ["\u5168\u90E8", ...new Set(state.allProducts.map((p) => p.category))];
  const categoryCounts = /* @__PURE__ */ Object.create(null);
  categoryCounts["\u5168\u90E8"] = state.allProducts.length;
  state.allProducts.forEach((p) => {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  });
  tabsContainer.replaceChildren(
    ...categories.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.classList.toggle("active", category === state.currentProductFilter);
      button.textContent = `${category} (${categoryCounts[category]})`;
      button.onclick = () => filterProductsByCategory(category);
      return button;
    })
  );
  const filtered = state.currentProductFilter === "\u5168\u90E8" ? state.allProducts : state.allProducts.filter((p) => p.category === state.currentProductFilter);
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="products-empty" style="grid-column: 1/-1;">
                    <i class="fas fa-box-open"></i>
                    <p>\u5C1A\u7121\u5546\u54C1\u8CC7\u6599</p>
                </div>`;
    return;
  }
  grid.innerHTML = filtered.map((p) => {
    const statusClass = p.status === "\u555F\u7528" ? "enabled" : "disabled";
    const statusIcon = p.status === "\u555F\u7528" ? "fa-check-circle" : "fa-times-circle";
    const giftboxBadge = p.giftBoxEnabled === "\u662F" ? '<span class="status-badge yes"><i class="fas fa-gift"></i> \u53EF\u88DD\u79AE\u76D2</span>' : "";
    const specialPriceDisplay = p.specialPrice && p.specialPrice !== "" ? `<span class="price-special">NT$ ${p.specialPrice}</span>` : '<span class="price-none">--</span>';
    const companyPriceDisplay = p.companyPrice && p.companyPrice !== "" ? `<span class="price-value" style="color: #4f46e5;">NT$ ${p.companyPrice}</span>` : '<span class="price-none">--</span>';
    return `<div class="product-card">
                    <div class="product-card-header">
                        <span class="product-name">${escapeHtml(p.productName)}</span>
                        <span class="status-badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${p.status}</span>
                    </div>
                    <div class="product-card-tags">
                        <span class="status-badge category"><i class="fas fa-tag"></i> ${escapeHtml(p.category)}</span>
                        ${giftboxBadge}
                    </div>
                    <div class="product-card-prices">
                        <div class="price-row">
                            <span class="price-label">\u552E\u50F9</span>
                            <span class="price-value">NT$ ${p.price}</span>
                        </div>
                        <div class="price-row">
                            <span class="price-label">\u7279\u50F9</span>
                            ${specialPriceDisplay}
                        </div>
                        <div class="price-row">
                            <span class="price-label">\u4F01\u696D\u50F9</span>
                            ${companyPriceDisplay}
                        </div>
                    </div>
                    ${document.body.dataset.shopRole === "viewer" ? "" : `<div class="product-card-actions requires-editor">
                        <button class="btn-card-edit" onclick="editProduct('${escapeHandlerArgument(p.productId)}')">
                            <i class="fas fa-edit"></i> \u7DE8\u8F2F
                        </button>
                        <button class="btn-card-delete" onclick="event.stopPropagation(); deleteProduct('${escapeHandlerArgument(p.productId)}')">
                            <i class="fas fa-trash-alt"></i> \u522A\u9664
                        </button>
                    </div>`}
                </div>`;
  }).join("");
}
function filterProductsByCategory(category) {
  state.currentProductFilter = category;
  renderProductCards();
}
function selectProductOption(inputId, button) {
  button.parentElement.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
  document.getElementById(inputId).value = button.dataset.value;
}
function syncProductOptionButtons(inputId) {
  const value = document.getElementById(inputId).value;
  const group = document.getElementById(inputId + "Group");
  if (!group) return;
  group.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.value === value));
}
function showAddProduct() {
  document.getElementById("productEditModalTitle").textContent = "\u65B0\u589E\u5546\u54C1";
  document.getElementById("editProductId").value = "";
  document.getElementById("productName").value = "";
  document.getElementById("productPrice").value = "";
  document.getElementById("productSpecialPrice").value = "";
  document.getElementById("productCompanyPrice").value = "";
  document.getElementById("productDescription").value = "";
  document.getElementById("productCategory").value = "\u4F34\u624B\u79AE";
  document.getElementById("productStatus").value = "\u555F\u7528";
  document.getElementById("productGiftBoxEnabled").value = "\u662F";
  syncProductOptionButtons("productCategory");
  syncProductOptionButtons("productStatus");
  syncProductOptionButtons("productGiftBoxEnabled");
  document.getElementById("productEditModal").classList.add("active");
  setTimeout(() => initializeModalCloseHandlers(), 50);
}
function closeProductEditModal() {
  document.getElementById("productEditModal").classList.remove("active");
}
function saveProduct() {
  const saveBtn = window.event?.currentTarget || window.event?.target;
  const specialPriceValue = document.getElementById("productSpecialPrice").value.trim();
  const data = {
    productId: document.getElementById("editProductId").value,
    productName: document.getElementById("productName").value.trim(),
    category: document.getElementById("productCategory").value,
    price: parseInt(document.getElementById("productPrice").value),
    status: document.getElementById("productStatus").value,
    description: document.getElementById("productDescription").value.trim(),
    giftBoxEnabled: document.getElementById("productGiftBoxEnabled").value,
    specialPrice: specialPriceValue ? parseInt(specialPriceValue) : "",
    companyPrice: document.getElementById("productCompanyPrice").value.trim() ? parseInt(document.getElementById("productCompanyPrice").value.trim()) : ""
  };
  if (!data.productName || !data.price) {
    showAlert("\u8ACB\u586B\u5BEB\u5546\u54C1\u540D\u7A31\u548C\u50F9\u683C", "error");
    return;
  }
  setButtonLoading(saveBtn, true, "\u5132\u5B58\u4E2D...");
  rpc.withSuccessHandler(function(result) {
    setButtonLoading(saveBtn, false);
    handleProductSaved(result);
  }).withFailureHandler(function(error) {
    setButtonLoading(saveBtn, false);
    handleError(error);
  }).saveProduct(data);
}
function handleProductSaved(result) {
  if (result?.product) {
    const index = state.allProducts.findIndex((p) => p.productId === result.product.productId);
    if (index >= 0) state.allProducts[index] = { ...state.allProducts[index], ...result.product };
    else state.allProducts.push(result.product);
    state.allProducts.sort((a, b) => String(a.productName).localeCompare(String(b.productName), "zh-TW"));
    renderProductCards();
    updateProductDisplays();
    updateNavVisibility();
  }
  showAlert("\u5546\u54C1\u5DF2\u5132\u5B58", "success");
  closeProductEditModal();
}
function editProduct(productId) {
  const p = state.allProducts.find((p2) => p2.productId === productId);
  if (!p) return;
  document.getElementById("productEditModalTitle").textContent = "\u7DE8\u8F2F\u5546\u54C1";
  document.getElementById("editProductId").value = p.productId;
  document.getElementById("productName").value = p.productName;
  document.getElementById("productCategory").value = p.category;
  document.getElementById("productPrice").value = p.price;
  document.getElementById("productSpecialPrice").value = p.specialPrice || "";
  document.getElementById("productCompanyPrice").value = p.companyPrice || "";
  document.getElementById("productStatus").value = p.status;
  document.getElementById("productDescription").value = p.description || "";
  document.getElementById("productGiftBoxEnabled").value = p.giftBoxEnabled || "\u662F";
  syncProductOptionButtons("productCategory");
  syncProductOptionButtons("productStatus");
  syncProductOptionButtons("productGiftBoxEnabled");
  document.getElementById("productEditModal").classList.add("active");
  setTimeout(() => initializeModalCloseHandlers(), 50);
}
function deleteProduct(productId) {
  showConfirmModal("\u78BA\u5B9A\u8981\u522A\u9664\u6B64\u5546\u54C1\u55CE\uFF1F", () => {
    rpc.withSuccessHandler(function() {
      closeConfirmModal();
      showAlert("\u5546\u54C1\u5DF2\u522A\u9664", "success");
      state.allProducts = state.allProducts.filter((p) => p.productId !== productId);
      renderProductCards();
      updateProductDisplays();
      updateNavVisibility();
    }).withFailureHandler(function(error) {
      closeConfirmModal();
      handleError(error);
    }).deleteProduct(productId);
  });
}

// src/app/drafts.js
function openPosLocalDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (state.posLocalDbPromise) return state.posLocalDbPromise;
  state.posLocalDbPromise = new Promise(function(resolve, reject) {
    const request = indexedDB.open("ginJiaPosLocal", 1);
    request.onupgradeneeded = function() {
      const db = request.result;
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts");
      if (!db.objectStoreNames.contains("catalogs")) db.createObjectStore("catalogs");
    };
    request.onsuccess = function() {
      resolve(request.result);
    };
    request.onerror = function() {
      reject(request.error);
    };
  }).catch(function(error) {
    console.warn("\u7121\u6CD5\u958B\u555F\u672C\u6A5F\u8349\u7A3F\u8CC7\u6599\u5EAB", error);
    return null;
  });
  return state.posLocalDbPromise;
}
async function localDbOperation(storeName, mode, operation) {
  const db = await openPosLocalDb();
  if (!db) return null;
  return new Promise(function(resolve, reject) {
    const tx = db.transaction(storeName, mode);
    const request = operation(tx.objectStore(storeName));
    tx.oncomplete = function() {
      resolve(request.result);
    };
    tx.onabort = function() {
      reject(tx.error || new Error("\u672C\u6A5F\u8CC7\u6599\u5132\u5B58\u4E2D\u65B7"));
    };
    request.onerror = function() {
      reject(request.error);
    };
  });
}
function localDbGet(store, key) {
  return localDbOperation(store, "readonly", function(s) {
    return s.get(key);
  });
}
function localDbPut(store, key, value) {
  return localDbOperation(store, "readwrite", function(s) {
    return s.put(value, key);
  });
}
function localDbDelete(store, key) {
  return localDbOperation(store, "readwrite", function(s) {
    return s.delete(key);
  });
}
function currentLocalScope() {
  const uid = document.body.dataset.userId;
  const shopId = document.body.dataset.shopId;
  return uid && shopId ? `${uid}:${shopId}` : "";
}
function draftStorageKey() {
  const scope = currentLocalScope();
  return scope ? `order:${scope}` : "";
}
function catalogStorageKey() {
  const scope = currentLocalScope();
  return scope ? `products:${scope}` : "";
}
function captureOrderDraft() {
  return {
    version: 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    currentCustomer: state.currentCustomer,
    currentContactMethod: state.currentContactMethod,
    currentDeliveryDate: state.currentDeliveryDate,
    giftCart: state.giftCart,
    cakeCart: state.cakeCart,
    giftboxCart: state.giftboxCart,
    isCompanyCustomer: state.isCompanyCustomer,
    isEditingOrder: state.isEditingOrder,
    editingOrderId: state.editingOrderId,
    currentOrderRequestId: state.currentOrderRequestId,
    fields: {
      customerName: document.getElementById("customerName")?.value || "",
      customerPhone: document.getElementById("customerPhone")?.value || "",
      customerAddress: document.getElementById("customerAddress")?.value || "",
      recipientName: document.getElementById("recipientName")?.value || "",
      recipientPhone: document.getElementById("recipientPhone")?.value || "",
      deliveryType: document.getElementById("deliveryTypeValue")?.value || "\u5916\u9001",
      shippingOption: document.getElementById("shippingOption")?.value || "free",
      shippingFee: document.getElementById("shippingFee")?.value || "",
      selectedTitle: getSelectedTitle()
    }
  };
}
function hasMeaningfulDraft(draft) {
  return Boolean(
    draft?.currentCustomer?.name || draft?.currentCustomer?.contactValue || draft?.currentCustomer?.phone || draft?.fields?.customerName || draft?.fields?.customerPhone || draft?.currentDeliveryDate || draft?.giftCart?.length || draft?.cakeCart?.length || draft?.giftboxCart?.length || draft?.isEditingOrder
  );
}
function scheduleDraftSave() {
  document.dispatchEvent(new Event("pos:draft-changed"));
  if (state.suppressDraftSave) return;
  clearTimeout(state.draftSaveTimer);
  state.draftSaveTimer = setTimeout(async function() {
    const key = draftStorageKey();
    if (!key) return;
    const draft = captureOrderDraft();
    try {
      if (hasMeaningfulDraft(draft)) {
        await localDbPut("drafts", key, draft);
        document.body.dataset.draftDirty = "true";
      } else {
        await localDbDelete("drafts", key);
        document.body.dataset.draftDirty = "false";
      }
    } catch (error) {
      console.warn("\u8A02\u55AE\u8349\u7A3F\u4FDD\u5B58\u5931\u6557", error);
    }
  }, 250);
}
async function clearOrderDraft() {
  clearTimeout(state.draftSaveTimer);
  const key = draftStorageKey();
  document.body.dataset.draftDirty = "false";
  if (key)
    await localDbDelete("drafts", key).catch(function(error) {
      console.warn("\u8349\u7A3F\u6E05\u9664\u5931\u6557", error);
    });
}
function applyRoleCapabilities() {
  const viewer = document.body.dataset.shopRole === "viewer";
  document.querySelectorAll(".requires-editor").forEach(function(element) {
    element.hidden = viewer;
    element.setAttribute("aria-hidden", String(viewer));
  });
  if (viewer) document.body.dataset.permissionNotice = "readonly";
  else delete document.body.dataset.permissionNotice;
  document.querySelectorAll("#settingsCapacity input, #settingsCapacity button").forEach(function(element) {
    element.disabled = viewer;
    element.setAttribute("aria-disabled", String(viewer));
  });
  if (state.allProducts.length) renderProductCards();
  if (state.currentSearchOrders.length)
    displayOrderTable(state.currentSearchOrders, "searchResults", "search");
  updateCartDisplay();
}
function applyDraft(draft) {
  if (draft.fields?.recipientName || draft.fields?.recipientPhone)
    document.getElementById("recipientDetails").open = true;
  const fields = draft.fields || {};
  state.suppressDraftSave = true;
  state.currentContactMethod = draft.currentContactMethod === "line" ? "line" : "phone";
  selectContactMethod(state.currentContactMethod, false);
  [
    "customerName",
    "customerPhone",
    "customerAddress",
    "recipientName",
    "recipientPhone",
    "shippingFee"
  ].forEach(function(id) {
    const element = document.getElementById(id);
    if (element) element.value = fields[id] || "";
  });
  if (state.currentContactMethod === "line") document.getElementById("customerPhone").value = "LINE";
  document.querySelectorAll("#nameTitleGroup .name-title-btn").forEach(function(button) {
    button.classList.toggle("active", button.dataset.title === fields.selectedTitle);
  });
  state.currentCustomer = draft.currentCustomer || {};
  state.currentDeliveryDate = draft.currentDeliveryDate || "";
  state.giftCart = Array.isArray(draft.giftCart) ? draft.giftCart : [];
  state.cakeCart = Array.isArray(draft.cakeCart) ? draft.cakeCart : [];
  state.giftboxCart = Array.isArray(draft.giftboxCart) ? draft.giftboxCart : [];
  state.isCompanyCustomer = Boolean(draft.isCompanyCustomer);
  state.isEditingOrder = Boolean(draft.isEditingOrder);
  state.editingOrderId = draft.editingOrderId || null;
  state.currentOrderRequestId = draft.currentOrderRequestId || (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : generateUniqueId("REQ"));
  selectCustomerType(
    document.getElementById(state.isCompanyCustomer ? "customerCompany" : "customerNormal"),
    state.isCompanyCustomer
  );
  selectDeliveryType(
    document.getElementById(
      { \u5BC4\u8CA8: "deliveryShipping", \u81EA\u53D6: "deliveryPickup" }[fields.deliveryType] || "deliveryHome"
    ),
    fields.deliveryType || "\u5916\u9001"
  );
  selectShippingFee(
    document.getElementById(fields.shippingOption === "charge" ? "chargeShipping" : "freeShipping"),
    fields.shippingOption || "free"
  );
  if (state.currentDeliveryDate) {
    document.getElementById("deliveryDate").value = state.currentDeliveryDate;
    state.calendarState.selectedDateStr = state.currentDeliveryDate;
  }
  updateCartDisplay();
  renderCalendar();
  state.suppressDraftSave = false;
  document.body.dataset.draftDirty = "true";
  showAlert("\u5DF2\u6062\u5FA9\u4E0A\u6B21\u672A\u5B8C\u6210\u7684\u8A02\u55AE\u8349\u7A3F", "success");
}
async function restoreOrderDraftOnce() {
  const key = draftStorageKey();
  if (!key || state.restoredDraftKey === key) return;
  state.restoredDraftKey = key;
  const draft = await localDbGet("drafts", key).catch(function() {
    return null;
  });
  if (!hasMeaningfulDraft(draft)) return;
  const age = Date.now() - new Date(draft.updatedAt || 0).getTime();
  if (!Number.isFinite(age) || age > 30 * 24 * 60 * 60 * 1e3) {
    await localDbDelete("drafts", key);
    return;
  }
  if (confirm("\u627E\u5230\u4E0A\u6B21\u672A\u5B8C\u6210\u7684\u8A02\u55AE\u8349\u7A3F\uFF0C\u662F\u5426\u7E7C\u7E8C\uFF1F")) applyDraft(draft);
  else await clearOrderDraft();
}
function initOrderDraftPersistence() {
  const form = document.getElementById("customer");
  form?.addEventListener("input", scheduleDraftSave);
  form?.addEventListener("change", scheduleDraftSave);
  window.addEventListener("pos:shop-changed", function() {
    state.restoredDraftKey = null;
    restoreOrderDraftOnce();
    applyRoleCapabilities();
  });
}

// src/app/customers.js
function toggleNameTitle(btn) {
  if (btn.classList.contains("active")) {
    btn.classList.remove("active");
    return;
  }
  document.querySelectorAll("#nameTitleGroup .name-title-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  scheduleDraftSave();
}
function selectContactMethod(method, clearValue = true) {
  state.currentContactMethod = method === "line" ? "line" : "phone";
  const input = document.getElementById("customerPhone");
  const label = document.getElementById("customerContactLabel");
  document.getElementById("contactMethodPhone")?.classList.toggle("active", state.currentContactMethod === "phone");
  document.getElementById("contactMethodLine")?.classList.toggle("active", state.currentContactMethod === "line");
  if (input) {
    input.type = state.currentContactMethod === "phone" ? "tel" : "text";
    input.inputMode = state.currentContactMethod === "phone" ? "tel" : "none";
    input.placeholder = state.currentContactMethod === "phone" ? "09xx-xxx-xxx" : "";
    input.readOnly = state.currentContactMethod === "line";
    input.setAttribute("aria-label", state.currentContactMethod === "phone" ? "\u5BA2\u6236\u96FB\u8A71" : "\u806F\u7D61\u65B9\u5F0F LINE");
    if (state.currentContactMethod === "line") input.value = "LINE";
    else if (clearValue) input.value = "";
  }
  if (label) label.textContent = "\u806F\u7D61\u96FB\u8A71";
  closeAllAcLists();
  scheduleDraftSave();
}
function initContactMethodToggle() {
  const phoneButton = document.getElementById("contactMethodPhone");
  const lineButton = document.getElementById("contactMethodLine");
  phoneButton?.addEventListener("click", function(event2) {
    event2.preventDefault();
    selectContactMethod("phone");
  });
  lineButton?.addEventListener("click", function(event2) {
    event2.preventDefault();
    selectContactMethod("line");
  });
}
function selectSearchContactMethod(method, clearValue = true) {
  state.currentSearchContactMethod = method === "line" ? "line" : "phone";
  const input = document.getElementById("searchPhone");
  document.getElementById("searchContactPhone")?.classList.toggle("active", state.currentSearchContactMethod === "phone");
  document.getElementById("searchContactLine")?.classList.toggle("active", state.currentSearchContactMethod === "line");
  if (!input) return;
  input.type = state.currentSearchContactMethod === "phone" ? "tel" : "text";
  input.inputMode = state.currentSearchContactMethod === "phone" ? "tel" : "none";
  input.placeholder = state.currentSearchContactMethod === "phone" ? "\u8F38\u5165\u96FB\u8A71\u865F\u78BC" : "";
  input.readOnly = state.currentSearchContactMethod === "line";
  input.setAttribute(
    "aria-label",
    state.currentSearchContactMethod === "phone" ? "\u641C\u5C0B\u5BA2\u6236\u96FB\u8A71" : "\u641C\u5C0B LINE \u8A02\u55AE"
  );
  if (state.currentSearchContactMethod === "line") input.value = "LINE";
  else if (clearValue) input.value = "";
}
function initSearchContactMethodToggle() {
  document.getElementById("searchContactPhone")?.addEventListener("click", function(event2) {
    event2.preventDefault();
    selectSearchContactMethod("phone");
  });
  document.getElementById("searchContactLine")?.addEventListener("click", function(event2) {
    event2.preventDefault();
    selectSearchContactMethod("line");
  });
}
function initCustomerAutocomplete() {
  const nameInput = document.getElementById("customerName");
  const phoneInput = document.getElementById("customerPhone");
  nameInput.addEventListener("input", function() {
    debounceAcSearch(this.value.trim(), "customerAcList", "name");
  });
  phoneInput.addEventListener("input", function() {
    debounceAcSearch(this.value.trim(), "customerAcListPhone", "contact");
  });
  document.addEventListener("click", function(e) {
    if (!e.target.closest(".customer-ac-wrap")) {
      closeAllAcLists();
    }
  });
  nameInput.addEventListener("keydown", function(e) {
    acKeyNav(e, "customerAcList");
  });
  phoneInput.addEventListener("keydown", function(e) {
    acKeyNav(e, "customerAcListPhone");
  });
}
function debounceAcSearch(keyword, listId, mode) {
  clearTimeout(state.acDebounceTimer);
  if (!keyword || keyword.length < 2) {
    document.getElementById(listId).classList.remove("show");
    return;
  }
  const cacheKey = `${mode}:${state.currentContactMethod}:${keyword.toLocaleLowerCase()}`;
  if (state.customerSearchCache.has(cacheKey)) {
    renderAcList(state.customerSearchCache.get(cacheKey), listId);
    return;
  }
  state.acDebounceTimer = setTimeout(function() {
    if (isConnected()) {
      rpc.withSuccessHandler(function(results) {
        state.customerSearchCache.set(cacheKey, results || []);
        renderAcList(results, listId);
      }).searchCustomers({ keyword, mode, contactType: state.currentContactMethod });
    }
  }, 300);
}
function renderAcList(results, listId) {
  const list = document.getElementById(listId);
  if (!results || results.length === 0) {
    list.classList.remove("show");
    list.innerHTML = "";
    return;
  }
  state.acResultsCache = results;
  list.innerHTML = results.map(function(c, i) {
    return '<button type="button" class="customer-ac-item" role="option" data-index="' + i + '"><div class="customer-ac-icon"><i class="fas fa-user"></i></div><div class="customer-ac-info"><div class="customer-ac-name">' + escapeHtml(c.name) + '</div><div class="customer-ac-phone">' + escapeHtml(c.contactType === "line" ? "LINE" : c.contactValue || c.phone || "") + (c.address ? " / " + escapeHtml(c.address) : "") + "</div></div></button>";
  }).join("");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "\u7B26\u5408\u7684\u5BA2\u6236");
  list.querySelectorAll(".customer-ac-item").forEach((button) => {
    button.addEventListener("click", () => selectAcCustomer(Number(button.dataset.index)));
  });
  list.classList.add("show");
}
function selectAcCustomer(index) {
  const c = state.acResultsCache[index];
  if (!c) return;
  let name = c.name || "";
  document.querySelectorAll("#nameTitleGroup .name-title-btn").forEach(function(b) {
    b.classList.remove("active");
  });
  if (name.endsWith("\u5148\u751F") || name.endsWith("\u5C0F\u59D0")) {
    const title = name.slice(-2);
    name = name.slice(0, -2);
    const btn = document.querySelector('#nameTitleGroup .name-title-btn[data-title="' + title + '"]');
    if (btn) btn.classList.add("active");
  }
  document.getElementById("customerName").value = name;
  selectContactMethod(c.contactType === "line" ? "line" : "phone", false);
  document.getElementById("customerPhone").value = c.contactType === "line" ? "LINE" : c.contactValue || c.phone || "";
  if (c.address) {
    document.getElementById("customerAddress").value = c.address;
  }
  closeAllAcLists();
}
function closeAllAcLists() {
  document.querySelectorAll(".customer-ac-list").forEach(function(el) {
    el.classList.remove("show");
  });
}
function acKeyNav(e, listId) {
  const list = document.getElementById(listId);
  if (!list.classList.contains("show")) return;
  const items = list.querySelectorAll(".customer-ac-item");
  if (items.length === 0) return;
  let idx = -1;
  items.forEach(function(item, i) {
    if (item.classList.contains("highlight")) idx = i;
  });
  if (e.key === "ArrowDown") {
    e.preventDefault();
    idx = (idx + 1) % items.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    idx = idx <= 0 ? items.length - 1 : idx - 1;
  } else if (e.key === "Enter" && idx >= 0) {
    e.preventDefault();
    items[idx].dispatchEvent(new Event("mousedown"));
    return;
  } else if (e.key === "Escape") {
    closeAllAcLists();
    return;
  } else {
    return;
  }
  items.forEach(function(item) {
    item.classList.remove("highlight");
  });
  items[idx].classList.add("highlight");
  items[idx].scrollIntoView({ block: "nearest" });
}
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
function escapeAttr(str) {
  return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function getSelectedTitle() {
  const active = document.querySelector("#nameTitleGroup .name-title-btn.active");
  return active ? active.dataset.title : "";
}
function saveCustomer() {
  const saveBtn = window.event?.currentTarget || window.event?.target;
  const rawName = document.getElementById("customerName").value.trim();
  const title = getSelectedTitle();
  const name = rawName ? rawName + title : "";
  const contactValue = state.currentContactMethod === "line" ? "LINE" : document.getElementById("customerPhone").value.trim();
  const address = document.getElementById("customerAddress").value.trim();
  const recipientName = document.getElementById("recipientName").value.trim();
  const recipientPhone = document.getElementById("recipientPhone").value.trim();
  const deliveryType = document.getElementById("deliveryTypeValue").value;
  if (!name) {
    showAlert("\u8ACB\u8F38\u5165\u5BA2\u6236\u59D3\u540D", "error");
    return;
  }
  if (!contactValue) {
    showAlert("\u8ACB\u8F38\u5165\u5BA2\u6236\u96FB\u8A71", "error");
    return;
  }
  state.currentCustomer = {
    name,
    contactType: state.currentContactMethod,
    contactValue,
    phone: state.currentContactMethod === "phone" ? contactValue : "",
    lineId: state.currentContactMethod === "line" ? contactValue : "",
    address,
    recipientName,
    recipientPhone,
    deliveryType,
    isCompanyCustomer: state.isCompanyCustomer
  };
  updateCartDisplay();
  showAlert("\u5BA2\u6236\u8CC7\u8A0A\u5DF2\u5132\u5B58", "success");
  if (saveBtn) setButtonLoading(saveBtn, false);
  showSectionById("date");
}
function clearCustomerForm() {
  document.getElementById("customerName").value = "";
  document.querySelectorAll("#nameTitleGroup .name-title-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById("customerPhone").value = "";
  selectContactMethod("phone", false);
  document.getElementById("customerAddress").value = "";
  document.getElementById("recipientName").value = "";
  document.getElementById("recipientPhone").value = "";
  document.getElementById("shippingFee").value = "";
  selectDeliveryType(document.getElementById("deliveryHome"), "\u5916\u9001");
  selectShippingFee(document.getElementById("freeShipping"), "free");
  state.isCompanyCustomer = false;
  document.getElementById("customerNormal").classList.add("active");
  document.getElementById("customerCompany").classList.remove("active");
  updateProductDisplays();
  state.currentCustomer = {};
  if (state.isEditingOrder) {
    state.isEditingOrder = false;
    state.editingOrderId = null;
    state.giftCart = [];
    state.cakeCart = [];
    state.giftboxCart = [];
    state.currentDeliveryDate = "";
    document.getElementById("deliveryDate").value = "";
    showAlert("\u5DF2\u53D6\u6D88\u8A02\u55AE\u7DE8\u8F2F", "success");
  }
  updateCartDisplay();
}
function selectDeliveryType(button, value) {
  const parent = button.parentElement;
  parent.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
  document.getElementById("deliveryTypeValue").value = value;
  toggleShippingField();
}
function selectShippingFee(button, value) {
  const parent = button.parentElement;
  parent.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
  document.getElementById("shippingOption").value = value;
  toggleShippingFeeInput();
}
function selectCustomerType(button, isCompany) {
  const parent = button.parentElement;
  parent.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
  state.isCompanyCustomer = isCompany;
  updateProductDisplays();
  recalcCartPricesForCustomerType();
}
function recalcCartPricesForCustomerType() {
  let hasChanges = false;
  [state.giftCart, state.cakeCart].forEach((cart) => {
    cart.forEach((item) => {
      if (item.type !== "giftbox" && !item.isSpecialPrice) {
        const product = state.allProducts.find((p) => p.productId === item.productId);
        if (product) {
          const newPrice = getEffectivePrice(product);
          if (item.price !== newPrice) {
            item.price = newPrice;
            item.isCompanyPrice = state.isCompanyCustomer;
            hasChanges = true;
          }
        }
      }
    });
  });
  if (hasChanges) {
    updateCartDisplay();
    const modeText = state.isCompanyCustomer ? "\u4F01\u696D" : "\u4E00\u822C";
    showAlert("\u5DF2\u5207\u63DB\u70BA" + modeText + "\u50F9\u683C", "success");
  }
}
function toggleShippingField() {
  const deliveryType = document.getElementById("deliveryTypeValue").value;
  const isPickup = deliveryType === "\u81EA\u53D6";
  const addressGroup = document.getElementById("customerAddress").closest(".mb-8") || document.getElementById("customerAddress").parentElement;
  const shippingFeeGroup = document.getElementById("shippingFeeGroup");
  const recipientInfoGroup = document.getElementById("recipientInfoGroup");
  if (isPickup) {
    addressGroup.style.display = "none";
    shippingFeeGroup.style.display = "none";
    recipientInfoGroup.style.display = "none";
    document.getElementById("customerAddress").value = "";
    document.getElementById("shippingFee").value = "";
    document.getElementById("recipientName").value = "";
    document.getElementById("recipientPhone").value = "";
  } else {
    addressGroup.style.display = "block";
    recipientInfoGroup.style.display = "grid";
    shippingFeeGroup.style.display = "grid";
  }
  updateOrderTotal();
}
function toggleShippingFeeInput() {
  const shippingOption = document.getElementById("shippingOption").value;
  const isCharge = shippingOption === "charge";
  const shippingFeeInput = document.getElementById("shippingFeeInput");
  if (isCharge) {
    shippingFeeInput.style.display = "block";
  } else {
    shippingFeeInput.style.display = "none";
    document.getElementById("shippingFee").value = "";
  }
  updateOrderTotal();
}

// src/app/giftboxes.js
function selectGiftboxSize(size, btnElement) {
  const sizeBtn = btnElement || window.event?.currentTarget || window.event?.target?.closest("button");
  if (sizeBtn.classList.contains("loading")) return;
  setButtonLoading(sizeBtn, true, "\u6E96\u5099\u4E2D...");
  state.currentGiftboxSize = size;
  state.giftboxSelection = {};
  document.querySelectorAll(".giftbox-size-btn").forEach((btn) => {
    btn.classList.remove("selected");
    setButtonLoading(btn, false);
  });
  sizeBtn.classList.add("selected");
  document.getElementById("giftboxStep1").classList.remove("active");
  document.getElementById("giftboxStep2").classList.add("active");
  document.getElementById("giftboxStep2Title").textContent = `\u6B65\u9A5F2: \u9078\u64C7\u5546\u54C1\u7D44\u5408 (${size}\u7C92\u88DD)`;
  document.getElementById("targetCount").textContent = size;
  loadGiftboxProducts();
  setButtonLoading(sizeBtn, false);
}
function loadGiftboxProducts() {
  const giftboxProducts = state.allProducts.filter((p) => p.status === "\u555F\u7528" && p.giftBoxEnabled === "\u662F");
  const container = document.getElementById("giftboxProducts");
  if (giftboxProducts.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 20px; color: #6b7280;">\u76EE\u524D\u6C92\u6709\u53EF\u7528\u65BC\u79AE\u76D2\u7684\u5546\u54C1</p>';
    return;
  }
  container.innerHTML = `<div class="giftbox-product-grid">${giftboxProducts.map((p) => {
    const eprice = getEffectivePrice(p);
    const isCompanyPriceActive = state.isCompanyCustomer && p.companyPrice && parseFloat(p.companyPrice) > 0 && parseFloat(p.companyPrice) !== parseFloat(p.price);
    return `
                <div class="giftbox-product-card" id="card_${escapeAttr(p.productId)}">
                    <div class="giftbox-product-icon">
                        <i class="fas fa-cookie-bite"></i>
                    </div>
                    <div class="giftbox-product-info">
                        <h4>${escapeHtml(p.productName)}</h4>
                        <span class="price">${isCompanyPriceActive ? '<span class="company-original-price">NT$ ' + p.price + "</span>" : ""}NT$ ${eprice}${isCompanyPriceActive ? '<span class="company-price-tag">\u4F01\u696D\u50F9</span>' : ""}</span>
                    </div>
                    <div class="giftbox-quantity-control">
                        <button type="button" class="giftbox-qty-btn" onclick="adjustGiftboxQty('${escapeHandlerArgument(p.productId)}', -1)">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" inputmode="numeric" min="0" class="giftbox-qty-display" id="display_${escapeAttr(p.productId)}" value="0" onfocus="this.select()" onchange="setGiftboxQty('${escapeHandlerArgument(p.productId)}', this.value)">
                        <button type="button" class="giftbox-qty-btn" onclick="adjustGiftboxQty('${escapeHandlerArgument(p.productId)}', 1)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <input type="hidden" class="giftbox-product-input" id="qty_${escapeAttr(p.productId)}" value="0">
                </div>`;
  }).join("")}</div>`;
  updateGiftboxProgress();
}
function adjustGiftboxQty(productId, change) {
  const input = document.getElementById("qty_" + productId);
  const display = document.getElementById("display_" + productId);
  const card = document.getElementById("card_" + productId);
  let currentVal = parseInt(input.value) || 0;
  const currentTotal = Object.values(state.giftboxSelection).reduce((sum, qty) => sum + qty, 0);
  if (change > 0 && currentTotal >= state.currentGiftboxSize) {
    showAlert(`\u5DF2\u9054${state.currentGiftboxSize}\u5165\u4E0A\u9650`, "warning");
    return;
  }
  let newVal = Math.max(0, currentVal + change);
  input.value = newVal;
  display.value = newVal;
  if (newVal > 0) {
    display.classList.add("has-value");
    card.classList.add("has-quantity");
  } else {
    display.classList.remove("has-value");
    card.classList.remove("has-quantity");
  }
  updateGiftboxSelection(productId, newVal);
}
function setGiftboxQty(productId, rawValue) {
  const input = document.getElementById("qty_" + productId);
  const display = document.getElementById("display_" + productId);
  const card = document.getElementById("card_" + productId);
  let newVal = Math.max(0, parseInt(rawValue, 10) || 0);
  const otherTotal = Object.entries(state.giftboxSelection).filter(([id]) => id !== productId).reduce((sum, [, qty]) => sum + qty, 0);
  if (otherTotal + newVal > state.currentGiftboxSize) {
    newVal = Math.max(0, state.currentGiftboxSize - otherTotal);
    showAlert(`\u5DF2\u9054${state.currentGiftboxSize}\u5165\u4E0A\u9650\uFF0C\u5DF2\u81EA\u52D5\u8ABF\u6574\u70BA ${newVal}`, "warning");
  }
  input.value = newVal;
  display.value = newVal;
  display.classList.toggle("has-value", newVal > 0);
  card.classList.toggle("has-quantity", newVal > 0);
  updateGiftboxSelection(productId, newVal);
}
function updateGiftboxSelection(productId, quantity) {
  const qty = parseInt(quantity) || 0;
  if (qty > 0) {
    state.giftboxSelection[productId] = qty;
  } else {
    delete state.giftboxSelection[productId];
  }
  updateGiftboxProgress();
}
function updateGiftboxProgress() {
  const totalSelected = Object.values(state.giftboxSelection).reduce((sum, qty) => sum + qty, 0);
  document.getElementById("selectedCount").textContent = totalSelected;
  if (totalSelected > state.currentGiftboxSize) {
    document.querySelector(".giftbox-progress").style.color = "#c66b6b";
    document.querySelector(".giftbox-progress").style.borderLeftColor = "#c66b6b";
  } else if (totalSelected === state.currentGiftboxSize) {
    document.querySelector(".giftbox-progress").style.color = "#2ecc71";
    document.querySelector(".giftbox-progress").style.borderLeftColor = "#2ecc71";
  } else {
    document.querySelector(".giftbox-progress").style.color = "var(--primary-dark)";
    document.querySelector(".giftbox-progress").style.borderLeftColor = "var(--primary-color)";
  }
}
function proceedToStep3() {
  const totalSelected = Object.values(state.giftboxSelection).reduce((sum, qty) => sum + qty, 0);
  if (totalSelected === 0) {
    showAlert("\u8ACB\u9078\u64C7\u81F3\u5C11\u4E00\u500B\u5546\u54C1", "error");
    return;
  }
  if (totalSelected < state.currentGiftboxSize) {
    showAlert(`\u9084\u9700\u8981\u9078\u64C7 ${state.currentGiftboxSize - totalSelected} \u500B\u5546\u54C1`, "error");
    return;
  }
  if (totalSelected > state.currentGiftboxSize) {
    showAlert(`\u5546\u54C1\u6578\u91CF\u8D85\u904E\u9650\u5236\uFF0C\u8ACB\u6E1B\u5C11 ${totalSelected - state.currentGiftboxSize} \u500B\u5546\u54C1`, "error");
    return;
  }
  const proceedBtn = document.getElementById("proceedStep3");
  setButtonLoading(proceedBtn, true, "\u8A08\u7B97\u4E2D...");
  document.getElementById("giftboxStep2").classList.remove("active");
  document.getElementById("giftboxStep3").classList.add("active");
  updateGiftboxSummary();
  setButtonLoading(proceedBtn, false);
  const addBtn = document.querySelector(".btn-add-cart");
  if (addBtn) {
    if (state.editingGiftboxIndex >= 0) {
      addBtn.innerHTML = '<i class="fas fa-save"></i> \u66F4\u65B0\u79AE\u76D2';
    } else {
      addBtn.innerHTML = '<i class="fas fa-cart-plus"></i> \u52A0\u5165\u8CFC\u7269\u8ECA';
    }
  }
}
function updateGiftboxSummary() {
  const summaryContainer = document.getElementById("giftboxSummary");
  const sizeLabel = document.getElementById("giftboxSizeLabel");
  let summaryHtml = "";
  let totalPrice = 0;
  if (sizeLabel) {
    sizeLabel.textContent = `${state.currentGiftboxSize}\u7C92\u88DD\u79AE\u76D2`;
  }
  for (const [productId, quantity] of Object.entries(state.giftboxSelection)) {
    const product = state.allProducts.find((p) => p.productId === productId);
    if (product) {
      const subtotal = getEffectivePrice(product) * quantity;
      totalPrice += subtotal;
      summaryHtml += `
                        <div class="giftbox-summary-product">
                            <div class="product-info">
                                <div class="product-icon">
                                    <i class="fas fa-cookie-bite"></i>
                                </div>
                                <div>
                                    <div class="product-name">${escapeHtml(product.productName)}</div>
                                    <div class="product-qty">x ${quantity}</div>
                                </div>
                            </div>
                            <div class="product-price">NT$ ${subtotal}</div>
                        </div>
                    `;
    }
  }
  summaryHtml += `
                <div class="giftbox-summary-total">
                    <span class="total-label"><i class="fas fa-calculator"></i> \u55AE\u7D44\u79AE\u76D2\u7E3D\u50F9</span>
                    <span class="total-price">NT$ ${totalPrice}</span>
                </div>
            `;
  summaryContainer.innerHTML = summaryHtml;
  state.currentGiftboxCombo = {
    size: state.currentGiftboxSize,
    products: { ...state.giftboxSelection },
    unitPrice: totalPrice
  };
  updateGiftboxPrice();
}
function updateGiftboxPrice() {
  if (!state.currentGiftboxCombo) return;
  const quantity = Math.max(1, parseInt(document.getElementById("giftboxQuantity").value) || 1);
  const special = parseFloat(document.getElementById("giftboxSpecialPriceInput").value) || 0;
  const original = state.currentGiftboxCombo.unitPrice;
  document.getElementById("giftboxPriceComparison").style.display = special > 0 ? "" : "none";
  document.getElementById("giftboxOriginalTotalText").textContent = (original * quantity).toLocaleString();
  document.getElementById("giftboxSpecialTotalText").textContent = (special * quantity).toLocaleString();
  document.getElementById("giftboxTotalAmount").textContent = `\u79AE\u76D2\u5408\u8A08 NT$ ${((special > 0 ? special : original) * quantity).toLocaleString()}`;
}
function addGiftboxToCart() {
  const addBtn = window.event?.currentTarget || window.event?.target?.closest("button") || window.event?.target;
  const quantity = parseInt(document.getElementById("giftboxQuantity").value) || 1;
  const notes = document.getElementById("giftboxNotes").value.trim();
  const isEditing = state.editingGiftboxIndex >= 0;
  if (!state.currentGiftboxCombo) {
    showAlert("\u79AE\u76D2\u7D44\u5408\u8CC7\u8A0A\u932F\u8AA4", "error");
    return;
  }
  const specialPriceInput = document.getElementById("giftboxSpecialPriceInput");
  const specialPrice = parseFloat(specialPriceInput.value) || 0;
  let finalPrice = state.currentGiftboxCombo.unitPrice;
  let isSpecialPrice = false;
  if (specialPrice > 0) {
    finalPrice = specialPrice;
    isSpecialPrice = true;
  }
  const loadingText = isEditing ? "\u66F4\u65B0\u4E2D..." : "\u52A0\u5165\u4E2D...";
  setButtonLoading(addBtn, true, loadingText);
  if (isEditing) {
    const existingItem = state.giftboxCart[state.editingGiftboxIndex];
    state.giftboxCart[state.editingGiftboxIndex] = {
      ...existingItem,
      name: `${state.currentGiftboxCombo.size}\u7C92\u88DD\u79AE\u76D2`,
      size: state.currentGiftboxCombo.size,
      products: state.currentGiftboxCombo.products,
      price: finalPrice,
      originalPrice: state.currentGiftboxCombo.unitPrice,
      isSpecialPrice,
      quantity,
      notes
    };
    showAlert("\u79AE\u76D2\u5DF2\u66F4\u65B0", "success");
  } else {
    const giftboxItem = {
      type: "giftbox",
      id: generateUniqueId("GB"),
      name: `${state.currentGiftboxCombo.size}\u7C92\u88DD\u79AE\u76D2`,
      size: state.currentGiftboxCombo.size,
      products: state.currentGiftboxCombo.products,
      price: finalPrice,
      originalPrice: state.currentGiftboxCombo.unitPrice,
      isSpecialPrice,
      quantity,
      notes
    };
    state.giftboxCart.push(giftboxItem);
    showAlert(`\u5DF2\u5C07 ${quantity} \u7D44\u79AE\u76D2\u52A0\u5165\u8CFC\u7269\u8ECA`, "success");
  }
  updateCartDisplay();
  setButtonLoading(addBtn, false);
  resetGiftboxState();
}
function resetGiftboxState() {
  state.currentGiftboxSize = 0;
  state.giftboxSelection = {};
  state.currentGiftboxCombo = null;
  state.editingGiftboxIndex = -1;
  document.querySelectorAll(".giftbox-step").forEach((step) => step.classList.remove("active"));
  document.getElementById("giftboxStep1").classList.add("active");
  document.querySelectorAll(".giftbox-size-btn").forEach((btn) => btn.classList.remove("selected"));
  document.getElementById("giftboxQuantity").value = 1;
  document.getElementById("giftboxNotes").value = "";
  document.getElementById("giftboxSpecialPriceInput").value = "";
  document.getElementById("giftboxPriceComparison").style.display = "none";
  const addBtn = document.querySelector(".btn-add-cart");
  if (addBtn) {
    addBtn.innerHTML = '<i class="fas fa-cart-plus"></i> \u52A0\u5165\u8CFC\u7269\u8ECA';
  }
}
function editGiftboxItem(cartIndex) {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const item = allItems[cartIndex];
  if (!item || item.type !== "giftbox") {
    showAlert("\u627E\u4E0D\u5230\u79AE\u76D2\u9805\u76EE", "error");
    return;
  }
  const giftboxIndex = state.giftboxCart.findIndex((g) => g.id === item.id);
  if (giftboxIndex === -1) {
    showAlert("\u627E\u4E0D\u5230\u79AE\u76D2\u9805\u76EE", "error");
    return;
  }
  state.editingGiftboxIndex = giftboxIndex;
  closeCartModal();
  showSectionById("giftbox");
  state.currentGiftboxSize = item.size;
  state.giftboxSelection = { ...item.products };
  document.querySelectorAll(".giftbox-size-btn").forEach((btn) => btn.classList.remove("selected"));
  document.querySelectorAll(".giftbox-step").forEach((step) => step.classList.remove("active"));
  document.getElementById("giftboxStep2").classList.add("active");
  document.getElementById("giftboxStep2Title").textContent = `\u6B65\u9A5F2: \u9078\u64C7\u5546\u54C1\u7D44\u5408 (${item.size}\u7C92\u88DD)`;
  document.getElementById("targetCount").textContent = item.size;
  loadGiftboxProductsForEdit(item.products);
  document.getElementById("giftboxQuantity").value = item.quantity;
  document.getElementById("giftboxNotes").value = item.notes || "";
  if (item.isSpecialPrice) {
    document.getElementById("giftboxSpecialPriceInput").value = item.price;
  }
  showAlert("\u6B63\u5728\u7DE8\u8F2F\u79AE\u76D2\uFF0C\u4FEE\u6539\u5F8C\u8ACB\u9EDE\u64CA\u300C\u66F4\u65B0\u79AE\u76D2\u300D", "info");
}
function loadGiftboxProductsForEdit(existingProducts) {
  const giftboxProducts = state.allProducts.filter((p) => p.status === "\u555F\u7528" && p.giftBoxEnabled === "\u662F");
  const container = document.getElementById("giftboxProducts");
  if (giftboxProducts.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 20px; color: #6b7280;">\u76EE\u524D\u6C92\u6709\u53EF\u7528\u65BC\u79AE\u76D2\u7684\u5546\u54C1</p>';
    return;
  }
  container.innerHTML = `<div class="giftbox-product-grid">${giftboxProducts.map((p) => {
    const existingQty = existingProducts[p.productId] || 0;
    const hasQty = existingQty > 0;
    const eprice = getEffectivePrice(p);
    const isCompanyPriceActive = state.isCompanyCustomer && p.companyPrice && parseFloat(p.companyPrice) > 0 && parseFloat(p.companyPrice) !== parseFloat(p.price);
    return `
                <div class="giftbox-product-card ${hasQty ? "has-quantity" : ""}" id="card_${escapeAttr(p.productId)}">
                    <div class="giftbox-product-icon">
                        <i class="fas fa-cookie-bite"></i>
                    </div>
                    <div class="giftbox-product-info">
                        <h4>${escapeHtml(p.productName)}</h4>
                        <span class="price">${isCompanyPriceActive ? '<span class="company-original-price">NT$ ' + p.price + "</span>" : ""}NT$ ${eprice}${isCompanyPriceActive ? '<span class="company-price-tag">\u4F01\u696D\u50F9</span>' : ""}</span>
                    </div>
                    <div class="giftbox-quantity-control">
                        <button type="button" class="giftbox-qty-btn" onclick="adjustGiftboxQty('${escapeHandlerArgument(p.productId)}', -1)">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" inputmode="numeric" min="0" class="giftbox-qty-display ${hasQty ? "has-value" : ""}" id="display_${escapeAttr(p.productId)}" value="${existingQty}" onfocus="this.select()" onchange="setGiftboxQty('${escapeHandlerArgument(p.productId)}', this.value)">
                        <button type="button" class="giftbox-qty-btn" onclick="adjustGiftboxQty('${escapeHandlerArgument(p.productId)}', 1)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <input type="hidden" class="giftbox-product-input" id="qty_${escapeAttr(p.productId)}" value="${existingQty}">
                </div>
            `;
  }).join("")}</div>`;
  updateGiftboxProgress();
}
function backToStep1() {
  document.querySelectorAll(".giftbox-step").forEach((step) => step.classList.remove("active"));
  document.getElementById("giftboxStep1").classList.add("active");
  if (typeof resetGiftboxState === "function") {
    resetGiftboxState();
  }
}
function backToStep2() {
  document.getElementById("giftboxStep3").classList.remove("active");
  document.getElementById("giftboxStep2").classList.add("active");
}

// src/app/date-pickers.js
function initSearchDatepicker() {
  if (state.searchDatepickerInstance) return;
  const el = document.getElementById("searchDate");
  if (!el) return;
  state.searchDatepickerInstance = new AirDatepicker(el, {
    locale: state.demandDateLocaleZh,
    dateFormat: "yyyy-MM-dd",
    autoClose: true,
    buttons: [
      {
        content: "\u4ECA\u5929",
        onClick: function(dp) {
          dp.selectDate(/* @__PURE__ */ new Date());
        }
      },
      {
        content: "\u6E05\u9664",
        onClick: function(dp) {
          dp.clear();
        }
      }
    ]
  });
}
function initOverrideDatepicker() {
  if (state.overrideDatepickerInstance) return;
  var el = document.getElementById("overrideDate");
  if (!el) return;
  state.overrideDatepickerInstance = new AirDatepicker(el, {
    locale: state.demandDateLocaleZh,
    range: true,
    dateFormat: "yyyy-MM-dd",
    multipleDatesSeparator: " ~ ",
    autoClose: true,
    buttons: [
      {
        content: "\u4ECA\u5929",
        onClick: function(dp) {
          dp.selectDate(/* @__PURE__ */ new Date());
          dp.selectDate(/* @__PURE__ */ new Date());
        }
      },
      {
        content: "\u6E05\u9664",
        onClick: function(dp) {
          dp.clear();
        }
      }
    ]
  });
}
function initDemandDatepicker() {
  if (state.demandDatepickerInstance) return;
  const el = document.getElementById("demandDatePicker");
  if (!el) return;
  state.demandDatepickerInstance = new AirDatepicker(el, {
    locale: state.demandDateLocaleZh,
    range: true,
    dateFormat: "yyyy-MM-dd",
    multipleDatesSeparator: " ~ ",
    autoClose: true,
    buttons: [
      {
        content: "\u4ECA\u5929",
        onClick: (dp) => {
          dp.selectDate(/* @__PURE__ */ new Date());
          dp.selectDate(/* @__PURE__ */ new Date());
        }
      },
      {
        content: "\u6E05\u9664",
        onClick: (dp) => {
          dp.clear();
        }
      }
    ]
  });
}

// src/app/reports.js
function initReportDatepicker() {
  if (state.reportDatepickerInstance) return;
  const el = document.getElementById("reportDatePicker");
  if (!el) return;
  state.reportDatepickerInstance = new AirDatepicker(el, {
    locale: state.demandDateLocaleZh,
    range: true,
    dateFormat: "yyyy-MM-dd",
    multipleDatesSeparator: " ~ ",
    autoClose: true,
    buttons: [
      {
        content: "\u4ECA\u5929",
        onClick: function(dp) {
          dp.clear();
          dp.selectDate(/* @__PURE__ */ new Date());
          dp.selectDate(/* @__PURE__ */ new Date());
        }
      },
      {
        content: "\u6E05\u9664",
        onClick: function(dp) {
          dp.clear();
        }
      }
    ]
  });
}
function generateReport() {
  const raw = document.getElementById("reportDatePicker").value.trim();
  if (!raw) {
    showAlert("\u8ACB\u9078\u64C7\u5831\u8868\u65E5\u671F\u5340\u9593", "error");
    return;
  }
  const [startDate, selectedEnd] = raw.split("~").map((value) => value.trim());
  const endDate = selectedEnd || startDate;
  var btn = document.getElementById("btnReport");
  setButtonLoading(btn, true, "\u7522\u751F\u4E2D...");
  rpc.withSuccessHandler(function(report) {
    setButtonLoading(btn, false);
    handleReportGenerated(report);
  }).withFailureHandler(function(error) {
    setButtonLoading(btn, false);
    handleError(error);
  }).generateDailyReport(startDate, endDate);
}
function handleReportGenerated(report) {
  var container = document.getElementById("reportResults");
  var dateLabel = escapeHtml(report.date || "");
  if (report.totalOrders === 0) {
    container.innerHTML = '<div class="report-date-label"><i class="fas fa-calendar-check" style="margin-right:6px;"></i>' + dateLabel + '</div><p style="padding:20px;text-align:center;color:#64748b;">\u6B64\u671F\u9593\u7121\u71DF\u696D\u8A18\u9304</p>';
    return;
  }
  var totalRevenue = Math.round(report.totalRevenue);
  var avgOrder = report.totalOrders > 0 ? Math.round(totalRevenue / report.totalOrders) : 0;
  var html = "";
  html += '<div class="report-date-label"><i class="fas fa-calendar-check" style="margin-right:6px;"></i>' + dateLabel + "\uFF0C\u5171 " + report.totalOrders + " \u7B46\u8A02\u55AE</div>";
  html += '<div class="report-summary-cards">';
  html += '<div class="report-summary-card revenue"><div class="card-label">\u7E3D\u71DF\u696D\u984D</div><div class="card-value">$' + totalRevenue.toLocaleString() + "</div></div>";
  html += '<div class="report-summary-card orders"><div class="card-label">\u8A02\u55AE\u6578</div><div class="card-value">' + report.totalOrders + "</div></div>";
  html += '<div class="report-summary-card items"><div class="card-label">\u5546\u54C1\u7E3D\u6578</div><div class="card-value">' + report.totalItems + "</div></div>";
  html += '<div class="report-summary-card avg"><div class="card-label">\u5E73\u5747\u5BA2\u55AE\u50F9</div><div class="card-value">$' + avgOrder.toLocaleString() + "</div></div>";
  html += "</div>";
  if (report.productSales && report.productSales.length > 0) {
    html += '<div class="demand-section-title"><i class="fas fa-chart-bar" style="margin-right:8px;"></i>\u5546\u54C1\u92B7\u552E\u660E\u7D30</div>';
    html += '<table class="demand-stats-table"><thead><tr><th>\u5546\u54C1\u540D\u7A31</th><th>\u6578\u91CF</th><th>\u91D1\u984D</th><th>\u4F54\u6BD4</th></tr></thead><tbody>';
    for (var i = 0; i < report.productSales.length; i++) {
      var p = report.productSales[i];
      var amount = Math.round(p.amount);
      var pct = totalRevenue > 0 ? (amount / totalRevenue * 100).toFixed(1) : "0.0";
      html += "<tr><td>" + escapeHtml(p.productName) + "</td><td>" + p.quantity + '</td><td class="qty-cell">$' + amount.toLocaleString() + "</td><td>" + pct + "%</td></tr>";
    }
    html += "</tbody></table>";
  } else {
    html += '<p style="padding:20px;text-align:center;color:#64748b;">\u6B64\u671F\u9593\u7121\u5546\u54C1\u92B7\u552E\u660E\u7D30</p>';
  }
  container.innerHTML = html;
}
function generateDemandStats() {
  const el = document.getElementById("demandDatePicker");
  const raw = el.value.trim();
  if (!raw) {
    showAlert("\u8ACB\u5148\u9078\u64C7\u65E5\u671F", "error");
    return;
  }
  let startDate, endDate;
  if (raw.includes("~")) {
    const parts = raw.split("~").map((s) => s.trim());
    startDate = parts[0];
    endDate = parts[1] || parts[0];
  } else {
    startDate = raw;
    endDate = raw;
  }
  const btn = document.getElementById("btnDemandStats");
  setButtonLoading(btn, true, "\u7D71\u8A08\u4E2D...");
  if (isConnected()) {
    rpc.withSuccessHandler(function(result) {
      setButtonLoading(btn, false);
      renderDemandResults(result, startDate, endDate);
    }).withFailureHandler(function(error) {
      setButtonLoading(btn, false);
      handleError(error);
    }).getDemandStats(startDate, endDate);
  } else {
    setButtonLoading(btn, false);
    showAlert("\u5C1A\u672A\u9023\u63A5 Firebase\uFF0C\u7121\u6CD5\u7522\u751F\u9700\u6C42\u7D71\u8A08", "error");
  }
}
function renderDemandResults(result, startDate, endDate) {
  const container = document.getElementById("demandResults");
  if (!result || result.orderCount === 0) {
    container.innerHTML = '<p style="padding: 20px; text-align: center; color: #64748b;">\u6B64\u671F\u9593\u7121\u8A02\u55AE\u8CC7\u6599</p>';
    return;
  }
  const dateLabel = startDate === endDate ? startDate : startDate + " ~ " + endDate;
  let html = "";
  html += `<div class="demand-date-range-label"><i class="fas fa-calendar-check" style="margin-right:6px;"></i>${dateLabel}\uFF0C\u5171 ${result.orderCount} \u7B46\u8A02\u55AE</div>`;
  if (result.productStats.length > 0) {
    html += '<div class="demand-section-title"><i class="fas fa-boxes-stacked" style="margin-right:8px;"></i>\u5404\u5546\u54C1\u9700\u6C42\u91CF</div>';
    html += '<table class="demand-stats-table"><thead><tr><th>\u5546\u54C1\u540D\u7A31</th><th>\u6563\u88DD</th><th>\u79AE\u76D2\u5167</th><th>\u5408\u8A08</th></tr></thead><tbody>';
    result.productStats.forEach((p) => {
      html += `<tr>
                        <td>${escapeHtml(p.name)}</td>
                        <td>${p.loose || 0}</td>
                        <td>${p.inbox || 0}</td>
                        <td class="qty-cell">${p.total}</td>
                    </tr>`;
    });
    html += "</tbody></table>";
  }
  if (result.giftboxStats.length > 0) {
    html += '<div class="demand-section-title"><i class="fas fa-box" style="margin-right:8px;"></i>\u79AE\u76D2\u898F\u683C\u7D71\u8A08</div>';
    html += '<div class="demand-summary-cards">';
    result.giftboxStats.forEach((g) => {
      html += `<div class="demand-summary-card">
                        <div class="card-label">${escapeHtml(g.size)}</div>
                        <div class="card-value">${g.count}</div>
                        <div class="card-label">\u76D2</div>
                    </div>`;
    });
    html += "</div>";
  }
  container.innerHTML = html;
}

// src/app/navigation.js
function showSection(sectionName, navElement, panel) {
  if (sectionName === "settings" && !panel) {
    const active = document.querySelector(".settings-section.active");
    return showSettingsSection(active?.id.replace("settings", "").toLowerCase() || "products");
  }
  const section = document.getElementById(sectionName);
  if (!section?.classList.contains("content-section")) return;
  navElement ||= document.getElementById("nav-" + sectionName);
  document.querySelectorAll(".content-section").forEach((s) => s.classList.remove("active"));
  section.classList.add("active");
  const mainScroller = document.querySelector("main");
  if (mainScroller) mainScroller.scrollTop = 0;
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("bg-blue-100", "text-blue-700");
    item.classList.add("text-gray-600");
    item.removeAttribute("aria-current");
  });
  if (navElement) {
    navElement.classList.remove("text-gray-600");
    navElement.classList.add("bg-blue-100", "text-blue-700");
    navElement.setAttribute("aria-current", "page");
  }
  const floatingCart = document.querySelector(".floating-cart");
  if (floatingCart) {
    if (sectionName === "search" || sectionName === "settings") {
      floatingCart.style.display = "none";
    } else {
      floatingCart.style.display = "flex";
    }
  }
  if (sectionName !== "giftbox" && state.editingGiftboxIndex >= 0) {
    resetGiftboxState();
  }
  if (sectionName === "date") {
    setTimeout(() => renderCalendar(), 100);
  }
  if (sectionName === "search") {
    initSearchDatepicker();
  }
  document.dispatchEvent(new CustomEvent("pos:navigate", { detail: { section: sectionName, panel } }));
}
function showSettingsSection(sectionName, navElement) {
  const target = document.getElementById(
    "settings" + sectionName.charAt(0).toUpperCase() + sectionName.slice(1)
  );
  if (!target?.classList.contains("settings-section")) return;
  document.querySelectorAll(".settings-section").forEach((s) => {
    s.classList.remove("active");
    s.style.display = "none";
  });
  target.classList.add("active");
  target.style.display = "";
  showSection("settings", navElement || document.getElementById("nav-" + sectionName), sectionName);
  if (sectionName === "demand") {
    initDemandDatepicker();
  }
  if (sectionName === "reports") {
    initReportDatepicker();
  }
  if (sectionName === "capacity") {
    initOverrideDatepicker();
    loadCapacitySettings();
  }
}

// src/app/checkout.js
function submitOrder() {
  const checkoutBtn = document.getElementById("checkoutBtn");
  if (state.isSubmittingOrder) {
    showAlert("\u8A02\u55AE\u8655\u7406\u4E2D\uFF0C\u8ACB\u52FF\u91CD\u8907\u9001\u51FA", "warning");
    return;
  }
  if (checkoutBtn.classList.contains("checkout-not-ready") || !navigator.onLine || document.body.dataset.shopRole === "viewer") {
    if (!state.currentCustomer.name || !state.currentCustomer.contactValue && !state.currentCustomer.phone) {
      showAlert("\u8ACB\u5148\u5132\u5B58\u5BA2\u6236\u8CC7\u8A0A", "error");
    } else if (!navigator.onLine) {
      showAlert("\u76EE\u524D\u96E2\u7DDA\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u5B58\uFF1B\u6062\u5FA9\u9023\u7DDA\u5F8C\u624D\u80FD\u9001\u51FA\u8A02\u55AE", "error");
    } else if (document.body.dataset.shopRole === "viewer") {
      showAlert("\u50C5\u6AA2\u8996\u6210\u54E1\u4E0D\u80FD\u5EFA\u7ACB\u6216\u4FEE\u6539\u8A02\u55AE", "error");
    } else if (!state.currentDeliveryDate) {
      showAlert("\u8ACB\u5148\u8A2D\u5B9A\u4EA4\u8CA8\u65E5\u671F", "error");
    } else {
      showAlert("\u8CFC\u7269\u8ECA\u662F\u7A7A\u7684", "error");
    }
    return;
  }
  beginOrderSubmit();
  const orderTotals = updateOrderTotal();
  const isPickupOrder = document.getElementById("deliveryTypeValue").value === "\u81EA\u53D6";
  const shippingNotes = isPickupOrder ? "" : document.getElementById("shippingOption").value === "free" ? "\u514D\u904B" : orderTotals.shippingFee > 0 ? `\u904B\u8CBB NT$ ${orderTotals.shippingFee}` : "";
  const recipientName = document.getElementById("recipientName").value.trim();
  const recipientPhone = document.getElementById("recipientPhone").value.trim();
  const customerData = {
    ...state.currentCustomer,
    recipientName,
    recipientPhone
  };
  const orderData = {
    clientRequestId: state.currentOrderRequestId,
    customer: customerData,
    deliveryDate: state.currentDeliveryDate,
    items: [...state.giftCart, ...state.cakeCart, ...state.giftboxCart],
    totalAmount: orderTotals.totalAmount,
    shippingFee: orderTotals.shippingFee,
    shippingNotes,
    isCompanyCustomer: state.isCompanyCustomer
  };
  checkCapacityAndSubmit(orderData);
}
function handleOrderUpdated(result) {
  let alertMessage = `\u8A02\u55AE ${result.orderId} \u66F4\u65B0\u6210\u529F!`;
  if (result.paymentChange) {
    const pc = result.paymentChange;
    alertMessage += `

\u4ED8\u6B3E\u72C0\u614B\u8B8A\u66F4\uFF1A`;
    alertMessage += `
\u539F\u91D1\u984D\uFF1ANT$ ${pc.originalTotal} \u2192 \u65B0\u91D1\u984D\uFF1ANT$ ${pc.newTotal}`;
    alertMessage += `
\u539F\u72C0\u614B\uFF1A${pc.originalStatus} \u2192 \u65B0\u72C0\u614B\uFF1A${pc.newStatus}`;
    if (pc.remainingAmount > 0) {
      alertMessage += `
\u5269\u9918\u91D1\u984D\uFF1ANT$ ${pc.remainingAmount}`;
    } else if (pc.paymentNotes && pc.paymentNotes.includes("\u9000\u6B3E")) {
      alertMessage += `
${pc.paymentNotes.split(";").pop().trim()}`;
    }
  }
  showAlert(alertMessage, "success");
  closeCartModal();
  resetOrderForm();
  showSectionById("search");
}
function clearEditingState() {
  state.isEditingOrder = false;
  state.editingOrderId = null;
  clearCustomerForm();
  state.currentDeliveryDate = "";
  state.giftCart = [];
  state.cakeCart = [];
  state.giftboxCart = [];
  updateCartDisplay();
}
function handleOrderSubmitted(result) {
  const orderId = result && result.orderId ? result.orderId : "";
  closeCartModal();
  resetOrderForm();
  showSectionById("customer");
  showAlert(`\u8A02\u55AE ${orderId} \u5EFA\u7ACB\u6210\u529F!`, "success", 5e3);
}
function resetOrderForm() {
  try {
    clearEditingState();
    state.currentDeliveryDate = "";
    const deliveryDateInput = document.getElementById("deliveryDate");
    if (deliveryDateInput) deliveryDateInput.value = "";
    state.calendarState.selectedDateStr = null;
    state.calendarState.currYear = (/* @__PURE__ */ new Date()).getFullYear();
    state.calendarState.currMonth = (/* @__PURE__ */ new Date()).getMonth();
    if (typeof renderCalendar === "function") renderCalendar();
    const dateDisplay = document.getElementById("selected-date-display");
    if (dateDisplay) dateDisplay.textContent = "\u76EE\u524D\u5C1A\u672A\u9078\u64C7\u65E5\u671F";
    const confirmDateBtn = document.getElementById("btn-confirm-date");
    if (confirmDateBtn) {
      confirmDateBtn.disabled = true;
      confirmDateBtn.classList.remove("bg-blue-600", "hover:bg-blue-700", "shadow-lg");
      confirmDateBtn.classList.add("bg-gray-300", "cursor-not-allowed");
      confirmDateBtn.innerHTML = "\u8ACB\u5148\u9078\u64C7\u65E5\u671F";
    }
    state.currentGiftboxSize = 0;
    state.giftboxSelection = {};
    state.currentGiftboxCombo = null;
    state.editingGiftboxIndex = -1;
    state.currentOrderRequestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : generateUniqueId("REQ");
    updateCartDisplay();
    clearOrderDraft();
  } catch (e) {
    console.error("\u91CD\u7F6E\u8A02\u55AE\u8868\u55AE\u5931\u6557:", e);
    showAlert("\u8A02\u55AE\u5DF2\u5EFA\u7ACB\uFF0C\u4F46\u8868\u55AE\u91CD\u7F6E\u5931\u6557\uFF0C\u8ACB\u91CD\u65B0\u6574\u7406\u9801\u9762", "warning");
  }
}
function beginOrderSubmit() {
  state.isSubmittingOrder = true;
  const text = state.isEditingOrder ? "\u8A02\u55AE\u66F4\u65B0\u4E2D..." : "\u8A02\u55AE\u5EFA\u7ACB\u4E2D...";
  setButtonLoading(
    document.getElementById("checkoutBtn"),
    true,
    state.isEditingOrder ? "\u66F4\u65B0\u4E2D..." : "\u5EFA\u7ACB\u4E2D..."
  );
  showOrderSubmitOverlay(text);
  clearTimeout(state.orderSubmitWatchdog);
  state.orderSubmitWatchdog = setTimeout(function() {
    if (state.isSubmittingOrder) {
      finishOrderSubmit();
      showAlert("\u8A02\u55AE\u9001\u51FA\u903E\u6642\uFF0C\u8ACB\u5230\u8A02\u55AE\u67E5\u8A62\u78BA\u8A8D\u662F\u5426\u5DF2\u5EFA\u7ACB\uFF0C\u907F\u514D\u91CD\u8907\u9001\u55AE", "error");
    }
  }, 6e4);
}
function showOrderSubmitOverlay(text) {
  const overlay = document.getElementById("orderSubmitOverlay");
  if (!overlay) return;
  document.getElementById("orderSubmitOverlayText").textContent = text || "\u8A02\u55AE\u8655\u7406\u4E2D...";
  overlay.classList.add("active");
}
function hideOrderSubmitOverlay() {
  const overlay = document.getElementById("orderSubmitOverlay");
  if (overlay) overlay.classList.remove("active");
}
function finishOrderSubmit() {
  state.isSubmittingOrder = false;
  clearTimeout(state.orderSubmitWatchdog);
  state.orderSubmitWatchdog = null;
  hideOrderSubmitOverlay();
  setButtonLoading(document.getElementById("checkoutBtn"), false);
}
function checkCapacityAndSubmit(orderData) {
  if (isConnected()) {
    submitOrderRequest(orderData, false);
  } else {
    finishOrderSubmit();
    showAlert("\u5C1A\u672A\u9023\u63A5 Firebase\uFF0C\u8A02\u55AE\u8349\u7A3F\u5DF2\u4FDD\u7559\u4F46\u4E0D\u6703\u9001\u51FA", "error");
  }
}
function showCapacityWarningModal(capacityStatus, orderData) {
  state.pendingOrderData = orderData;
  hideOrderSubmitOverlay();
  setButtonLoading(document.getElementById("checkoutBtn"), false);
  closeCartModal();
  const body = document.getElementById("capacityWarningBody");
  const cs = capacityStatus;
  body.innerHTML = '<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; margin-bottom: 16px;"><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;"><div style="display: flex; flex-direction: column;"><span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">\u4EA4\u8CA8\u65E5\u671F</span><span style="font-size: 1rem; font-weight: 700; color: #1f2937;">' + escapeHtml(cs.date) + '</span></div><div style="display: flex; flex-direction: column;"><span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">\u6BCF\u65E5\u4E0A\u9650</span><span style="font-size: 1rem; font-weight: 700; color: #1f2937;">' + cs.limit + ' \u4EF6</span></div><div style="display: flex; flex-direction: column;"><span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">\u76EE\u524D\u5DF2\u6392\u5B9A</span><span style="font-size: 1rem; font-weight: 700; color: #1f2937;">' + cs.currentQuantity + ' \u4EF6</span></div><div style="display: flex; flex-direction: column;"><span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">\u672C\u6B21\u8A02\u55AE</span><span style="font-size: 1rem; font-weight: 700; color: #1f6f5f;">' + cs.newOrderQuantity + ' \u4EF6</span></div></div></div><div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; display: flex; align-items: flex-start; gap: 12px;"><i class="fas fa-exclamation-circle" style="color: #dc2626; margin-top: 2px; flex-shrink: 0;"></i><div><div style="font-weight: 700; color: #991b1b; margin-bottom: 4px;">\u9001\u51FA\u5F8C\u9810\u8A08\u7E3D\u91CF: ' + cs.projectedQuantity + " \u4EF6\uFF0C\u8D85\u51FA\u4E0A\u9650 " + cs.exceededQuantity + ' \u4EF6</div><div style="font-size: 0.85rem; color: #7f1d1d;">\u6B64\u8B66\u544A\u4E0D\u6703\u963B\u64CB\u8A02\u55AE\u5EFA\u7ACB\uFF0C\u8ACB\u78BA\u8A8D\u662F\u5426\u7E7C\u7E8C\u9001\u51FA\uFF0C\u6216\u8FD4\u56DE\u4FEE\u6539\u4EA4\u8CA8\u65E5\u671F\u3002</div></div></div>';
  document.getElementById("capacityWarningModal").classList.add("active");
}
function closeCapacityWarningModal() {
  document.getElementById("capacityWarningModal").classList.remove("active");
  state.pendingOrderData = null;
  finishOrderSubmit();
}
function confirmCapacityOverride() {
  if (!state.pendingOrderData) return;
  const orderData = state.pendingOrderData;
  state.pendingOrderData = null;
  document.getElementById("capacityWarningModal").classList.remove("active");
  orderData.capacityOverrideConfirmed = true;
  if (isConnected()) submitOrderRequest(orderData, true);
  else doSubmitOrder(orderData);
}
function submitOrderRequest(orderData, confirmed) {
  beginOrderSubmit();
  rpc.withSuccessHandler(function(result) {
    if (result.needConfirm) {
      showCapacityWarningModal(result.capacityStatus, orderData);
      return;
    }
    finishOrderSubmit();
    invalidateCapacityCache();
    if (state.isEditingOrder) handleOrderUpdated(result);
    else handleOrderSubmitted(result);
  }).withFailureHandler(function(error) {
    finishOrderSubmit();
    handleError(error);
  }).submitOrder(orderData, {
    orderId: state.isEditingOrder ? state.editingOrderId : null,
    confirmed
  });
}
function doSubmitOrder(orderData) {
  finishOrderSubmit();
  showAlert("\u5C1A\u672A\u9023\u63A5 Firebase\uFF0C\u8A02\u55AE\u8349\u7A3F\u5DF2\u4FDD\u7559\u4F46\u4E0D\u6703\u9001\u51FA", "error");
}

// src/app/payments.js
function initConfirmSlider(thumbId, progressId, onConfirm) {
  const thumb = document.getElementById(thumbId);
  const progressBar = document.getElementById(progressId);
  if (!thumb) return null;
  const track = thumb.parentElement;
  let dragging = false;
  let confirmed = false;
  let startX = 0;
  thumb.tabIndex = 0;
  thumb.setAttribute("role", "button");
  thumb.setAttribute(
    "aria-label",
    thumbId.startsWith("delete") ? "\u78BA\u8A8D\u522A\u9664\u8A02\u55AE\uFF0C\u6309 Enter \u6216\u7A7A\u767D\u9375" : "\u78BA\u8A8D\u8B8A\u66F4\u8A02\u55AE\u72C0\u614B\uFF0C\u6309 Enter \u6216\u7A7A\u767D\u9375"
  );
  thumb.addEventListener("keydown", (event2) => {
    if (!["Enter", " "].includes(event2.key) || confirmed || event2.repeat) return;
    event2.preventDefault();
    confirmed = true;
    thumb.classList.add("completed");
    thumb.setAttribute("aria-disabled", "true");
    onConfirm?.();
  });
  function maxX() {
    return track.offsetWidth - thumb.offsetWidth - 4;
  }
  function setPosition(x) {
    thumb.style.left = x + "px";
    if (progressBar) {
      progressBar.style.width = (x <= 2 ? 0 : Math.min(track.offsetWidth, x + thumb.offsetWidth)) + "px";
    }
  }
  function setSnapping(enabled) {
    thumb.classList.toggle("snapping", enabled);
    if (progressBar) progressBar.classList.toggle("snapping", enabled);
  }
  thumb.addEventListener("pointerdown", function(e) {
    if (confirmed) return;
    dragging = true;
    startX = e.clientX - thumb.offsetLeft;
    setSnapping(false);
    try {
      thumb.setPointerCapture(e.pointerId);
    } catch (err) {
    }
    e.preventDefault();
  });
  thumb.addEventListener("pointermove", function(e) {
    if (!dragging || confirmed) return;
    setPosition(Math.max(2, Math.min(maxX(), e.clientX - startX)));
  });
  thumb.addEventListener("pointerup", function() {
    if (!dragging || confirmed) return;
    dragging = false;
    setSnapping(true);
    if (thumb.offsetLeft >= maxX() * 0.8) {
      confirmed = true;
      setPosition(maxX());
      thumb.classList.add("completed");
      thumb.innerHTML = '<i class="fas fa-check"></i>';
      if (onConfirm) onConfirm();
    } else {
      setPosition(2);
    }
  });
  thumb.addEventListener("pointercancel", function() {
    if (!dragging || confirmed) return;
    dragging = false;
    setSnapping(true);
    setPosition(2);
  });
  return {
    reset: function() {
      dragging = false;
      confirmed = false;
      thumb.removeAttribute("aria-disabled");
      setSnapping(false);
      thumb.classList.remove("completed");
      thumb.innerHTML = '<i class="fas fa-chevron-right"></i>';
      setPosition(2);
    }
  };
}
function showStatusConfirm(orderId, newStatus) {
  state.currentStatusOrderId = orderId;
  state.currentStatusValue = newStatus;
  const completing = newStatus === "\u5B8C\u6210";
  document.getElementById("statusConfirmTitle").textContent = completing ? "\u5B8C\u6210\u9019\u7B46\u8A02\u55AE\uFF1F" : "\u66F4\u65B0\u8A02\u55AE\u72C0\u614B\uFF1F";
  document.getElementById("statusConfirmDescription").textContent = completing ? "\u8ACB\u78BA\u8A8D\u8A02\u55AE\u5DF2\u8655\u7406\u5B8C\u7562\uFF0C\u518D\u5C07\u72C0\u614B\u6A19\u8A18\u70BA\u5B8C\u6210\u3002" : "\u8ACB\u78BA\u8A8D\u4E0B\u65B9\u8A02\u55AE\u8CC7\u8A0A\uFF0C\u518D\u66F4\u65B0\u8A02\u55AE\u72C0\u614B\u3002";
  document.querySelector("#statusConfirmModal .slider-track").dataset.confirmLabel = completing ? "\u5411\u53F3\u6ED1\u52D5\uFF0C\u78BA\u8A8D\u5B8C\u6210" : "\u5411\u53F3\u6ED1\u52D5\uFF0C\u78BA\u8A8D\u66F4\u65B0";
  document.getElementById("statusOrderId").textContent = `\u8A02\u55AE\u7DE8\u865F\uFF1A${orderId}`;
  document.getElementById("statusUpdateInfo").textContent = `\u5C07\u66F4\u65B0\u70BA\uFF1A${newStatus}`;
  document.getElementById("statusUpdateStatus").textContent = "";
  document.getElementById("statusUpdateStatus").className = "status-update-status";
  if (!state.statusSliderCtrl) {
    state.statusSliderCtrl = initConfirmSlider("statusSliderThumb", "statusSliderProgress", function() {
      const statusEl = document.getElementById("statusUpdateStatus");
      statusEl.textContent = "\u5DF2\u78BA\u8A8D\uFF0C\u6B63\u5728\u66F4\u65B0...";
      statusEl.classList.add("success");
      setTimeout(executeStatusUpdate, 350);
    });
  }
  state.statusSliderCtrl.reset();
  document.getElementById("statusConfirmModal").classList.add("active");
}
function executeStatusUpdate() {
  if (!state.currentStatusOrderId || !state.currentStatusValue) return;
  updateOrderStatus(state.currentStatusOrderId, state.currentStatusValue);
  closeStatusConfirmModal();
}
function closeStatusConfirmModal() {
  document.getElementById("statusConfirmModal").classList.remove("active");
  state.currentStatusOrderId = null;
  state.currentStatusValue = null;
}
function showDeleteConfirm(orderId, customerName) {
  state.deleteOrderId = orderId;
  document.getElementById("deleteOrderId").textContent = `\u8A02\u55AE\u7DE8\u865F\uFF1A${orderId}`;
  document.getElementById("deleteCustomerName").textContent = `\u5BA2\u6236\uFF1A${customerName}`;
  const status = document.getElementById("deleteStatus");
  status.textContent = "";
  status.classList.remove("show", "success");
  if (!state.deleteSliderCtrl) {
    state.deleteSliderCtrl = initConfirmSlider("deleteSliderThumb", "deleteSliderProgress", function() {
      executeDelete();
    });
  }
  state.deleteSliderCtrl.reset();
  document.getElementById("deleteConfirmModal").classList.add("active");
}
function closeDeleteConfirmModal() {
  document.getElementById("deleteConfirmModal").classList.remove("active");
  state.deleteOrderId = null;
}
function showDepositModal(orderId, totalAmount, depositAmount) {
  state.currentDepositOrderId = orderId;
  state.currentDepositTotalAmount = totalAmount;
  state.currentDepositAmount = depositAmount;
  document.getElementById("depositOrderInfo").textContent = `\u8A02\u55AE\u7DE8\u865F\uFF1A${orderId} - \u7E3D\u91D1\u984D\uFF1ANT$ ${totalAmount}`;
  document.getElementById("depositAmountInput").value = depositAmount || "";
  document.getElementById("paymentNotesInput").value = "";
  updateDepositCalculation();
  document.getElementById("depositModal").classList.add("active");
}
function closeDepositModal() {
  document.getElementById("depositModal").classList.remove("active");
  state.currentDepositOrderId = null;
  state.currentDepositTotalAmount = 0;
  state.currentDepositAmount = 0;
}
function updateDepositCalculation() {
  const depositInput = document.getElementById("depositAmountInput");
  const newDepositAmount = parseFloat(depositInput.value) || 0;
  const calculationResult = document.getElementById("depositCalculationResult");
  if (newDepositAmount < 0 || newDepositAmount > state.currentDepositTotalAmount) {
    depositInput.style.borderColor = "#e74c3c";
    calculationResult.style.display = "none";
    return;
  } else {
    depositInput.style.borderColor = "#e5e7eb";
  }
  if (newDepositAmount > 0) {
    calculationResult.style.display = "block";
    const { remainingAmount, newStatus } = domain("payment", {
      total: state.currentDepositTotalAmount,
      paid: newDepositAmount
    });
    const statusColor = newStatus === "\u5DF2\u4ED8\u8A02\u91D1" ? "#99621a" : "#226b4e";
    document.getElementById("currentDepositText").textContent = `NT$ ${newDepositAmount}`;
    document.getElementById("remainingAmountText").textContent = `NT$ ${remainingAmount}`;
    document.getElementById("remainingAmountText").style.color = remainingAmount > 0 ? "#e74c3c" : "#27ae60";
    const statusText = document.getElementById("newStatusText");
    statusText.textContent = newStatus;
    statusText.style.backgroundColor = statusColor;
    statusText.style.color = "white";
  } else {
    calculationResult.style.display = "none";
  }
}
function confirmDepositUpdate() {
  const depositAmount = parseFloat(document.getElementById("depositAmountInput").value) || 0;
  const paymentNotes = document.getElementById("paymentNotesInput").value.trim();
  if (!state.currentDepositOrderId) {
    showAlert("\u8A02\u55AE\u8CC7\u8A0A\u932F\u8AA4", "error");
    return;
  }
  if (depositAmount > state.currentDepositTotalAmount) {
    showAlert("\u8A02\u91D1\u4E0D\u80FD\u8D85\u904E\u7E3D\u91D1\u984D", "error");
    return;
  }
  const confirmBtn = document.getElementById("confirmDepositBtn");
  setButtonLoading(confirmBtn, true, "\u8A2D\u5B9A\u4E2D...");
  rpc.withSuccessHandler(function(result) {
    setButtonLoading(confirmBtn, false);
    const cachedOrder = state.currentSearchOrders.find(
      (order) => (order.id || order.orderId) === result.orderId
    );
    if (cachedOrder) {
      cachedOrder.depositAmount = result.depositAmount;
      cachedOrder.remainingAmount = result.remainingAmount;
    }
    showAlert(`\u8A02\u91D1\u5DF2\u8A2D\u5B9A\uFF1ANT$ ${result.depositAmount}\uFF0C\u72C0\u614B\u66F4\u65B0\u70BA\uFF1A${result.newStatus}`, "success");
    closeDepositModal();
    refreshOrderDisplays(result.orderId, result.newStatus);
  }).withFailureHandler(function(error) {
    setButtonLoading(confirmBtn, false);
    handleError(error);
  }).updateOrderDeposit(state.currentDepositOrderId, depositAmount, paymentNotes);
}
function executeDelete() {
  if (!state.deleteOrderId) return;
  const orderId = state.deleteOrderId;
  const status = document.getElementById("deleteStatus");
  status.textContent = "\u6B63\u5728\u522A\u9664\u8A02\u55AE...";
  status.classList.add("show");
  status.classList.remove("success");
  const onDeleteSuccess = function() {
    const rowsToRemove = /* @__PURE__ */ new Set();
    document.querySelectorAll(`#searchResults button[data-oid="${orderId}"]`).forEach(function(btn) {
      const tr = btn.closest("tr");
      if (tr) rowsToRemove.add(tr);
    });
    rowsToRemove.forEach(function(tr) {
      const expandedRow = tr.nextElementSibling;
      if (expandedRow && expandedRow.classList.contains("order-items-row")) expandedRow.remove();
      tr.remove();
    });
    state.currentSearchOrders = state.currentSearchOrders.filter(
      (order) => (order.id || order.orderId) !== orderId
    );
    if (state.expandedSearchOrderId === orderId) state.expandedSearchOrderId = null;
    closeDeleteConfirmModal();
    showAlert("\u8A02\u55AE\u5DF2\u522A\u9664", "success");
  };
  const onDeleteFailure = function(error) {
    status.textContent = "";
    status.classList.remove("show");
    if (state.deleteSliderCtrl) state.deleteSliderCtrl.reset();
    handleError(error);
  };
  if (isConnected()) {
    rpc.withSuccessHandler(onDeleteSuccess).withFailureHandler(onDeleteFailure).deleteOrder(orderId);
  } else {
    onDeleteFailure(new Error("\u5C1A\u672A\u9023\u63A5 Firebase"));
  }
}

// src/app/order-editor.js
function editOrder(orderId) {
  rpc.withSuccessHandler(function(orderDetails) {
    loadOrderForEditing(orderDetails);
  }).withFailureHandler(function(error) {
    handleError(error);
  }).getOrderDetails(orderId);
}
function loadOrderForEditing(orderDetails) {
  document.getElementById("recipientDetails").open = Boolean(
    orderDetails.recipientName || orderDetails.recipientPhone
  );
  state.isEditingOrder = true;
  state.editingOrderId = orderDetails.orderId;
  state.giftCart = [];
  state.cakeCart = [];
  state.giftboxCart = [];
  state.isCompanyCustomer = !!orderDetails.isCompanyCustomer;
  if (state.isCompanyCustomer) {
    document.getElementById("customerCompany").classList.add("active");
    document.getElementById("customerNormal").classList.remove("active");
  } else {
    document.getElementById("customerNormal").classList.add("active");
    document.getElementById("customerCompany").classList.remove("active");
  }
  state.currentCustomer = {
    name: orderDetails.customerName,
    contactType: orderDetails.customerContactType || (orderDetails.customerLineId ? "line" : "phone"),
    contactValue: orderDetails.customerContactValue || orderDetails.customerLineId || orderDetails.customerPhone || "",
    phone: orderDetails.customerPhone || "",
    lineId: orderDetails.customerLineId || "",
    address: orderDetails.customerAddress || "",
    recipientName: orderDetails.recipientName || "",
    recipientPhone: orderDetails.recipientPhone || "",
    deliveryType: orderDetails.deliveryType || "\u5916\u9001",
    isCompanyCustomer: state.isCompanyCustomer
  };
  let loadedName = state.currentCustomer.name || "";
  document.querySelectorAll("#nameTitleGroup .name-title-btn").forEach((b) => b.classList.remove("active"));
  if (loadedName.endsWith("\u5148\u751F") || loadedName.endsWith("\u5C0F\u59D0")) {
    const title = loadedName.slice(-2);
    loadedName = loadedName.slice(0, -2);
    const btn = document.querySelector(`#nameTitleGroup .name-title-btn[data-title="${title}"]`);
    if (btn) btn.classList.add("active");
  }
  document.getElementById("customerName").value = loadedName;
  selectContactMethod(state.currentCustomer.contactType, false);
  document.getElementById("customerPhone").value = state.currentCustomer.contactType === "line" ? "LINE" : state.currentCustomer.contactValue;
  document.getElementById("customerAddress").value = state.currentCustomer.address;
  document.getElementById("recipientName").value = state.currentCustomer.recipientName;
  document.getElementById("recipientPhone").value = state.currentCustomer.recipientPhone;
  const deliveryType = orderDetails.deliveryType || "\u5916\u9001";
  const deliveryBtnMap = { \u5916\u9001: "deliveryHome", \u5BC4\u8CA8: "deliveryShipping", \u81EA\u53D6: "deliveryPickup" };
  const deliveryBtn = document.getElementById(deliveryBtnMap[deliveryType] || "deliveryHome");
  selectDeliveryType(deliveryBtn, deliveryType);
  const shippingFee = orderDetails.shippingFee || 0;
  if (shippingFee > 0) {
    selectShippingFee(document.getElementById("chargeShipping"), "charge");
    document.getElementById("shippingFee").value = shippingFee;
  } else {
    selectShippingFee(document.getElementById("freeShipping"), "free");
  }
  state.currentDeliveryDate = orderDetails.deliveryDate;
  if (state.currentDeliveryDate) {
    try {
      let dateValue;
      if (state.currentDeliveryDate instanceof Date) {
        dateValue = state.currentDeliveryDate.toISOString().split("T")[0];
      } else if (typeof state.currentDeliveryDate === "string") {
        const parsedDate = new Date(state.currentDeliveryDate);
        if (!isNaN(parsedDate.getTime())) {
          dateValue = parsedDate.toISOString().split("T")[0];
        } else {
          dateValue = state.currentDeliveryDate;
        }
      } else {
        dateValue = state.currentDeliveryDate;
      }
      document.getElementById("deliveryDate").value = dateValue;
    } catch (error) {
      console.log("\u65E5\u671F\u683C\u5F0F\u8F49\u63DB\u932F\u8AA4:", error);
      document.getElementById("deliveryDate").value = state.currentDeliveryDate;
    }
  }
  orderDetails.items.forEach((item) => {
    if (item.isGiftBox && item.giftBoxDetails) {
      const giftboxItem = {
        type: "giftbox",
        id: generateUniqueId("GB"),
        name: item.productName,
        size: Object.values(item.giftBoxDetails.products || {}).reduce(
          (sum, qty) => sum + parseInt(qty || 0),
          0
        ),
        products: item.giftBoxDetails.products || {},
        price: parseFloat(item.unitPrice) || 0,
        quantity: parseInt(item.quantity) || 1
        // 確保數量為整數
      };
      state.giftboxCart.push(giftboxItem);
    } else {
      let product = state.allProducts.find((p) => p.productId === item.productId);
      if (!product) {
        product = state.allProducts.find((p) => p.productName === item.productName);
      }
      if (product) {
        const cartItem = {
          ...product,
          quantity: parseInt(item.quantity) || 1,
          // 確保數量為整數
          price: parseFloat(item.unitPrice) || product.price,
          // 使用訂單中的實際價格
          originalPrice: item.originalPrice || product.price,
          // 使用訂單中記錄的原價
          isSpecialPrice: item.isSpecialPrice || false
          // 使用訂單中記錄的特價狀態
        };
        if (product.category === "\u4F34\u624B\u79AE") {
          state.giftCart.push(cartItem);
        } else if (product.category === "\u559C\u9905") {
          state.cakeCart.push(cartItem);
        }
      } else {
        const tempProduct = {
          productId: item.productId || generateUniqueId("TEMP"),
          productName: item.productName,
          category: "\u4F34\u624B\u79AE",
          // 預設類別
          price: parseFloat(item.unitPrice) || 0,
          originalPrice: item.originalPrice || parseFloat(item.unitPrice) || 0,
          isSpecialPrice: item.isSpecialPrice || false,
          quantity: parseInt(item.quantity) || 1,
          status: "\u555F\u7528",
          description: "\u5F9E\u8A02\u55AE\u8F09\u5165\u7684\u5546\u54C1",
          giftBoxEnabled: "\u662F"
        };
        state.giftCart.push(tempProduct);
      }
    }
  });
  updateCartDisplay();
  showAlert(`\u5DF2\u8F09\u5165\u8A02\u55AE ${orderDetails.orderId} \u9032\u884C\u7DE8\u8F2F`, "success");
  showSectionById("customer");
}

// src/app/order-detail.js
function viewOrderDetails(orderId) {
  const cachedDetails = state.currentOrderTableType === "search" ? state.currentSearchOrders.find((order) => (order.id || order.orderId) === orderId) : null;
  if (cachedDetails && Array.isArray(cachedDetails.items)) {
    handleOrderDetails(cachedDetails);
    return;
  }
  const detailBtn = window.event?.currentTarget || window.event?.target;
  setButtonLoading(detailBtn, true, "\u8F09\u5165\u4E2D...");
  if (isConnected()) {
    rpc.withSuccessHandler(function(details) {
      setButtonLoading(detailBtn, false);
      handleOrderDetails(details);
    }).withFailureHandler(function(error) {
      setButtonLoading(detailBtn, false);
      handleError(error);
    }).getOrderDetails(orderId);
  } else {
    setButtonLoading(detailBtn, false);
    showAlert("\u5C1A\u672A\u9023\u63A5 Firebase\uFF0C\u7121\u6CD5\u8B80\u53D6\u8A02\u55AE\u660E\u7D30", "error");
  }
}
function handleOrderDetails(details) {
  const detailModal = document.createElement("div");
  detailModal.className = "modal active";
  detailModal.setAttribute("role", "dialog");
  detailModal.setAttribute("aria-modal", "true");
  detailModal.onclick = function() {
  };
  let itemsHtml = "";
  details.items.forEach((item) => {
    if (item.isGiftBox && item.giftBoxDetails) {
      itemsHtml += `
                        <tr style="background-color: #f0f8ff;">
                            <td colspan="4"><strong>${escapeHtml(item.productName)} x ${item.quantity}</strong></td>
                        </tr>`;
      for (const [productId, qty] of Object.entries(item.giftBoxDetails.products || {})) {
        const product = state.allProducts.find((p) => p.productId === productId);
        const productName = product ? product.productName : `\u5546\u54C1ID: ${productId}`;
        const totalQty = (parseInt(qty) || 0) * (parseInt(item.quantity) || 1);
        itemsHtml += `
                            <tr style="padding-left: 20px; color: #666; font-size: 0.9em;">
                                <td style="padding-left: 30px;">\u2514 ${escapeHtml(productName)}</td>
                                <td>${totalQty}</td>
                                <td>-</td>
                                <td>-</td>
                            </tr>`;
      }
      if (item.giftBoxDetails.notes) {
        itemsHtml += `
                            <tr style="color: #888; font-style: italic;">
                                <td colspan="4" style="padding-left: 30px;">\u5099\u8A3B: ${escapeHtml(item.giftBoxDetails.notes)}</td>
                            </tr>`;
      }
      let giftboxPriceDisplay = `NT$ ${item.unitPrice}`;
      if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
        giftboxPriceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span><br><span class="special-price-text">\u7279\u50F9 NT$ ${item.unitPrice}</span>`;
      }
      itemsHtml += `
                        <tr style="background-color: #f0f8ff; font-weight: bold;">
                            <td style="padding-left: 30px;">\u79AE\u76D2\u5C0F\u8A08</td>
                            <td>-</td>
                            <td>${giftboxPriceDisplay}</td>
                            <td>NT$ ${item.subtotal}</td>
                        </tr>`;
    } else {
      let priceDisplay = `NT$ ${item.unitPrice}`;
      if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
        priceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span> <span class="special-price-text">\u7279\u50F9 NT$ ${item.unitPrice}</span>`;
      }
      itemsHtml += `
                        <tr>
                            <td>${escapeHtml(item.productName)}</td>
                            <td>${item.quantity}</td>
                            <td>${priceDisplay}</td>
                            <td>NT$ ${item.subtotal}</td>
                        </tr>`;
    }
  });
  let statusButtons = "";
  const canEditOrders = document.body.dataset.shopRole !== "viewer";
  if (canEditOrders && details.status !== "\u5B8C\u6210") {
    statusButtons += `<button class="btn btn-success" onclick="showStatusConfirm('${escapeHandlerArgument(details.orderId)}', '\u5B8C\u6210'); this.closest('.modal').remove();">\u5B8C\u6210</button>`;
  }
  detailModal.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>\u8A02\u55AE\u8A73\u60C5 - ${details.orderId}</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">\xD7</button>
                </div>
                <div class="modal-body">
                    <div class="order-info-grid">
                        <div class="order-info-item">
                            <span class="order-info-label">\u5BA2\u6236</span>
                            <span class="order-info-value">${escapeHtml(details.customerName)} (${escapeHtml(details.customerContactType === "line" || details.customerLineId ? "LINE" : details.customerContactValue || details.customerPhone || "-")})</span>
                        </div>
                        ${(details.recipientName || details.recipientPhone) && details.deliveryType !== "\u81EA\u53D6" ? `
                        <div class="order-info-item">
                            <span class="order-info-label">\u6536\u4EF6\u4EBA</span>
                            <span class="order-info-value">${escapeHtml(details.recipientName || "-")} ${details.recipientPhone ? `(${escapeHtml(details.recipientPhone)})` : ""}</span>
                        </div>` : ""}
                        <div class="order-info-item">
                            <span class="order-info-label">\u5730\u5740</span>
                            <span class="order-info-value">${escapeHtml(details.customerAddress || "\u672A\u63D0\u4F9B")}</span>
                        </div>
                        <div class="order-info-item">
                            <span class="order-info-label">\u914D\u9001\u65B9\u5F0F</span>
                            <span class="order-info-value delivery-badge">${escapeHtml(details.deliveryType || "\u5916\u9001")}</span>
                        </div>
                        ${details.isCompanyCustomer ? `<div class="order-info-item">
                            <span class="order-info-label">\u5BA2\u6236\u985E\u578B</span>
                            <span class="order-info-value" style="color: #4f46e5; font-weight: 600;">\u4F01\u696D\u5BA2\u6236</span>
                        </div>` : ""}
                        <div class="order-info-item">
                            <span class="order-info-label">\u4EA4\u8CA8\u65E5\u671F</span>
                            <span class="order-info-value">${formatDisplayDate(details.deliveryDate)}</span>
                        </div>
                        <div class="order-info-item">
                            <span class="order-info-label">\u8A02\u55AE\u72C0\u614B</span>
                            <span class="status-pill ${getStatusPillClass(details.status)}">${escapeHtml(details.status)}</span>
                        </div>
                    </div>

                    <h4>\u8A02\u55AE\u660E\u7D30</h4>
                    <div class="table-responsive">
                        <table class="table">
                            <thead><tr><th>\u5546\u54C1</th><th>\u6578\u91CF</th><th>\u55AE\u50F9</th><th>\u5C0F\u8A08</th></tr></thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>
                    </div>

                    <div class="payment-status-box">
                        <h4>\u4ED8\u6B3E\u72C0\u614B</h4>
                        <div class="payment-grid">
                            <div class="payment-item">
                                <span class="payment-label">\u7E3D\u91D1\u984D</span>
                                <span class="payment-value primary">NT$ ${Math.round(details.totalAmount).toLocaleString()}</span>
                            </div>
                            <div class="payment-item">
                                <span class="payment-label">\u5DF2\u4ED8\u8A02\u91D1</span>
                                <span class="payment-value ${details.depositAmount > 0 ? "success" : ""}">NT$ ${details.depositAmount || 0}</span>
                            </div>
                            <div class="payment-item">
                                <span class="payment-label">\u5269\u9918\u91D1\u984D</span>
                                <span class="payment-value ${details.remainingAmount > 0 ? "danger" : "success"}">NT$ ${details.remainingAmount ?? details.totalAmount}</span>
                            </div>
                            ${details.shippingFee > 0 || details.shippingNotes ? `
                            <div class="payment-item">
                                <span class="payment-label">\u904B\u8CBB</span>
                                <span class="payment-value info">${details.shippingFee > 0 ? `NT$ ${details.shippingFee}` : "\u514D\u904B"}</span>
                            </div>` : ""}
                        </div>
                        ${canEditOrders && details.status !== "\u5B8C\u6210" ? `
                        <div class="deposit-action">
                            <button class="btn btn-deposit" onclick="showDepositModal('${escapeHandlerArgument(details.orderId)}', ${escapeHandlerArgument(details.totalAmount)}, ${escapeHandlerArgument(details.depositAmount || 0)}); this.closest('.modal').remove();">
                                <i class="fas fa-coins"></i> \u8A2D\u5B9A\u8A02\u91D1
                            </button>
                        </div>` : ""}
                    </div>

                    <div class="order-total">
                        <span>\u7E3D\u8A08</span>
                        <span class="total-amount">NT$ ${details.totalAmount}</span>
                    </div>
                </div>
                <div class="modal-footer">
                    ${canEditOrders ? `<button class="btn btn-edit requires-editor" onclick="editOrder('${escapeHandlerArgument(details.orderId)}'); this.closest('.modal').remove();"><i class="fas fa-edit"></i> \u7DE8\u8F2F</button>` : ""}
                    ${statusButtons}
                    <button class="btn btn-close-modal" onclick="this.closest('.modal').remove()">\u95DC\u9589</button>
                </div>
            </div>`;
  document.body.appendChild(detailModal);
  setTimeout(() => initializeModalCloseHandlers(), 50);
}

// src/app/compatibility.js
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
  loadMoreOrders
});

// src/ui/workspace.js
var sections = {
  customer: ["\u5EFA\u7ACB\u8A02\u55AE", "\u5148\u586B\u5BEB\u5BA2\u6236\u8207\u914D\u9001\u8CC7\u6599"],
  date: ["\u4EA4\u8CA8\u5B89\u6392", "\u9078\u64C7\u65E5\u671F\uFF0C\u638C\u63E1\u6BCF\u65E5\u4F9B\u61C9\u91CF"],
  gift: ["\u4F34\u624B\u79AE", "\u6311\u9078\u5546\u54C1\uFF0C\u96A8\u6642\u6AA2\u8996\u8A02\u55AE"],
  cake: ["\u559C\u9905", "\u6311\u9078\u5546\u54C1\uFF0C\u96A8\u6642\u6AA2\u8996\u8A02\u55AE"],
  giftbox: ["\u79AE\u76D2\u7D44\u5408", "\u9078\u64C7\u898F\u683C\uFF0C\u81EA\u7531\u642D\u914D\u5167\u5BB9"],
  search: ["\u8A02\u55AE\u7BA1\u7406", "\u67E5\u8A62\u9032\u5EA6\u3001\u4ED8\u6B3E\u8207\u4EA4\u8CA8\u8CC7\u8A0A"],
  settings: ["\u5546\u54C1\u7BA1\u7406", "\u65B0\u589E\u3001\u7DE8\u8F2F\u8207\u7BA1\u7406\u5546\u54C1"]
};
var panels = {
  products: "\u5546\u54C1\u7BA1\u7406",
  capacity: "\u4F9B\u61C9\u91CF\u8A2D\u5B9A",
  demand: "\u9700\u6C42\u7D71\u8A08",
  reports: "\u71DF\u696D\u5831\u8868",
  device: "\u88DD\u7F6E\u8CC7\u8A0A"
};
var panelSubtitles = {
  products: "\u65B0\u589E\u3001\u7DE8\u8F2F\u8207\u7BA1\u7406\u5546\u54C1",
  capacity: "\u8A2D\u5B9A\u6BCF\u65E5\u4F9B\u61C9\u91CF\u8207\u6307\u5B9A\u65E5\u671F\u4E0A\u9650",
  demand: "\u4F9D\u4EA4\u8CA8\u65E5\u671F\u5F59\u6574\u5546\u54C1\u9700\u6C42",
  reports: "\u4F9D\u4EA4\u8CA8\u65E5\u671F\u5340\u9593\u67E5\u770B\u71DF\u6536\u8207\u5546\u54C1\u92B7\u552E",
  device: "\u67E5\u770B\u76EE\u524D\u4F7F\u7528\u7684\u88DD\u7F6E\u8207\u700F\u89BD\u5668"
};
var restoring = false;
function navigateFromUrl() {
  const [section, panel] = location.hash.slice(1).split("/");
  if (!sections[section]) return;
  restoring = true;
  if (section === "settings") showSettingsSection(panels[panel] ? panel : "products");
  else showSection(section);
  restoring = false;
}
function refreshWorkspace() {
  const customer = document.getElementById("workspaceCustomer");
  if (!customer) return;
  customer.textContent = state.currentCustomer.name || "\u5C1A\u672A\u586B\u5BEB\u5BA2\u6236";
  document.getElementById("workspaceDate").textContent = state.currentDeliveryDate || "\u5C1A\u672A\u9078\u64C7\u65E5\u671F";
  const items = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  document.getElementById("workspaceQuantity").textContent = `${quantity} \u4EF6\u5546\u54C1`;
  document.getElementById("workspaceCart").setAttribute("aria-label", `\u6AA2\u8996\u8A02\u55AE\uFF0C${quantity} \u4EF6\u5546\u54C1`);
  document.getElementById("workspaceMode").textContent = state.isEditingOrder ? "\u7DE8\u8F2F\u8A02\u55AE" : "\u65B0\u8A02\u55AE";
}
function initializeWorkspace() {
  for (const [id, category] of [
    ["gift", "\u4F34\u624B\u79AE"],
    ["cake", "\u559C\u9905"]
  ]) {
    document.getElementById(id + "ProductSearch").addEventListener("input", () => loadProductsByCategory(category, id));
  }
  document.getElementById("workspaceCart").addEventListener("click", toggleCartModal);
  const managementToggle = document.getElementById("managementToggle");
  const managementLinks = document.getElementById("managementLinks");
  function closeManagement(returnFocus = false) {
    managementToggle.setAttribute("aria-expanded", "false");
    if (returnFocus) managementToggle.focus();
  }
  managementToggle.addEventListener("click", () => {
    const expanded = managementToggle.getAttribute("aria-expanded") === "true";
    managementToggle.setAttribute("aria-expanded", String(!expanded));
    if (!expanded) {
      (managementLinks.querySelector('[aria-current="page"]') || managementLinks.querySelector("button")).focus();
    }
  });
  document.addEventListener("click", (event2) => {
    if (!managementLinks.contains(event2.target) && !managementToggle.contains(event2.target))
      closeManagement();
  });
  document.addEventListener("focusin", (event2) => {
    if (!managementLinks.contains(event2.target) && !managementToggle.contains(event2.target))
      closeManagement();
  });
  document.addEventListener("keydown", (event2) => {
    if (event2.key === "Escape" && managementToggle.getAttribute("aria-expanded") === "true") {
      event2.preventDefault();
      closeManagement(true);
    }
  });
  window.matchMedia("(max-width: 899px)").addEventListener("change", () => closeManagement());
  document.querySelectorAll("[data-panel]").forEach((button) => button.addEventListener("click", () => showSettingsSection(button.dataset.panel)));
  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.route)));
  document.getElementById("todayOrders").addEventListener("click", () => {
    document.getElementById("searchDate").value = getTaipeiDate();
    searchOrders();
  });
  document.getElementById("overdueShortcut").addEventListener("click", searchOverdueOrders);
  document.querySelector(".search-form").addEventListener("keydown", (event2) => {
    if (event2.key === "Enter" && event2.target.matches("input")) {
      event2.preventDefault();
      searchOrders();
    }
  });
  document.addEventListener("pos:navigate", (event2) => {
    const { section, panel } = event2.detail;
    if (!sections[section]) return;
    const [title, subtitle] = sections[section];
    document.getElementById("workspaceTitle").textContent = panels[panel] || title;
    document.getElementById("workspaceSubtitle").textContent = panelSubtitles[panel] || subtitle;
    document.getElementById("orderContext").hidden = ["search", "settings"].includes(section);
    document.body.dataset.section = section;
    document.title = `${panels[panel] || title} \xB7 WebPOS`;
    const hash = `#${section}${panel ? "/" + panel : ""}`;
    if (!restoring && location.hash !== hash) history.pushState(null, "", hash);
    closeManagement();
    managementToggle.classList.toggle("current-group", section === "settings");
    const heading = document.getElementById("workspaceTitle");
    if (heading && !restoring) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    refreshWorkspace();
  });
  window.addEventListener("popstate", navigateFromUrl);
  window.addEventListener("hashchange", navigateFromUrl);
  document.addEventListener("input", refreshWorkspace);
  document.addEventListener("pos:draft-changed", refreshWorkspace);
  document.addEventListener("keydown", (event2) => {
    if (event2.key !== "/" || event2.ctrlKey || event2.metaKey || event2.altKey || event2.target.matches("input,textarea,select,[contenteditable]"))
      return;
    if (document.querySelector(
      ".modal.active, .cart-sidebar.active, #firebaseAuthOverlay.active, #firebaseShopOverlay.active"
    ))
      return;
    event2.preventDefault();
    showSection("search");
    document.getElementById("searchName").focus();
  });
  if (location.hash) navigateFromUrl();
  else showSection(new URLSearchParams(location.search).get("section") || "customer");
  refreshWorkspace();
}

// src/ui/accessibility.js
var selector = ".modal, .cart-sidebar, #firebaseAuthOverlay, #firebaseShopOverlay";
var focusable = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
var close = {
  cartModal: closeCartModal,
  capacityWarningModal: closeCapacityWarningModal,
  deleteConfirmModal: closeDeleteConfirmModal,
  statusConfirmModal: closeStatusConfirmModal,
  depositModal: closeDepositModal,
  confirmModal: closeConfirmModal
};
var visible = (element) => element.getClientRects().length > 0 && !element.closest("[inert]");
function initializeAccessibility() {
  let active = null;
  const returns = /* @__PURE__ */ new WeakMap();
  function enhance() {
    document.querySelectorAll("i.fas,i.far,i.fab").forEach((icon) => icon.setAttribute("aria-hidden", "true"));
    document.querySelectorAll("label:not([for])").forEach((label) => {
      const control = label.querySelector("input[id],select[id],textarea[id]") || label.parentElement?.querySelector("input[id],select[id],textarea[id]");
      if (control) label.htmlFor = control.id;
    });
    document.querySelectorAll("input,select,textarea").forEach((control) => {
      if (!control.labels?.length && !control.hasAttribute("aria-label"))
        control.setAttribute("aria-label", control.placeholder || control.id || "\u8F38\u5165\u6B04\u4F4D");
    });
    document.querySelectorAll("button").forEach((button) => {
      if (!button.hasAttribute("type")) button.type = "button";
      if (button.hasAttribute("aria-label")) return;
      const text = button.textContent.trim();
      if (text === "\xD7") button.setAttribute("aria-label", "\u95DC\u9589");
      if (!text) {
        const icon = button.querySelector("i");
        const label = icon?.className.includes("minus") ? "\u6E1B\u5C11\u6578\u91CF" : icon?.className.includes("plus") ? "\u589E\u52A0\u6578\u91CF" : icon?.className.includes("trash") ? "\u522A\u9664" : "\u95DC\u9589";
        button.setAttribute("aria-label", label);
      }
    });
    document.querySelectorAll(".grove-btn-group button,.name-title-group button").forEach((button) => {
      const value = String(button.classList.contains("active"));
      if (button.getAttribute("aria-pressed") !== value) button.setAttribute("aria-pressed", value);
    });
    const dialogs = [...document.querySelectorAll(selector)].filter(
      (element) => element.classList.contains("active") && element.getClientRects().length
    );
    const top = dialogs.sort((a, b) => (Number(getComputedStyle(a).zIndex) || 0) - (Number(getComputedStyle(b).zIndex) || 0)).at(-1) || null;
    document.querySelectorAll(selector).forEach((dialog) => {
      dialog.inert = dialog !== top;
    });
    if (top !== active) {
      const previous = active;
      active = top;
      document.querySelector("main").inert = Boolean(top);
      document.querySelector("header").inert = Boolean(top);
      document.querySelector(".fab-cart").inert = Boolean(top);
      if (top) {
        returns.set(top, document.activeElement);
        top.setAttribute("role", "dialog");
        top.setAttribute("aria-modal", "true");
        if (!top.hasAttribute("aria-label") && !top.hasAttribute("aria-labelledby")) {
          const heading = top.querySelector("h2,h3");
          if (heading) {
            heading.id ||= "dialog-title-" + (top.id || Math.random().toString(36).slice(2));
            top.setAttribute("aria-labelledby", heading.id);
          } else top.setAttribute("aria-label", "\u64CD\u4F5C\u8996\u7A97");
        }
        const first = [...top.querySelectorAll(focusable)].find(visible);
        top.tabIndex = -1;
        (first || top).focus({ preventScroll: true });
      } else if (previous) {
        const target = returns.get(previous);
        if (target?.isConnected && visible(target)) target.focus({ preventScroll: true });
      }
    }
  }
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      enhance();
    });
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style"]
  });
  document.addEventListener(
    "keydown",
    (event2) => {
      if (!active) return;
      if (event2.key === "Escape") {
        event2.preventDefault();
        event2.stopImmediatePropagation();
        if (close[active.id]) close[active.id]();
        else if (!["firebaseAuthOverlay", "firebaseShopOverlay"].includes(active.id))
          active.classList.remove("active");
      }
      if (event2.key === "Tab") {
        const controls = [...active.querySelectorAll(focusable)].filter(visible);
        const first = controls[0] || active, last = controls.at(-1) || active;
        if (event2.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) {
          event2.preventDefault();
          last.focus();
        } else if (!event2.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) {
          event2.preventDefault();
          first.focus();
        }
      }
    },
    true
  );
  document.addEventListener("focusin", (event2) => {
    if (active && !active.contains(event2.target))
      ([...active.querySelectorAll(focusable)].find(visible) || active).focus();
  });
  enhance();
}

// src/app/startup.js
window.saveOrderDraftNow = async function() {
  clearTimeout(state.draftSaveTimer);
  const key = draftStorageKey();
  const draft = captureOrderDraft();
  if (key && hasMeaningfulDraft(draft)) await localDbPut("drafts", key, draft);
};
async function startApplication() {
  const main = document.querySelector("main");
  main.inert = true;
  main.setAttribute("aria-busy", "true");
  try {
    await initializeDomain();
  } catch (error) {
    const alert = document.getElementById("startupStatus");
    alert.hidden = false;
    alert.replaceChildren(document.createTextNode("\u7121\u6CD5\u8F09\u5165\u61C9\u7528\u7A0B\u5F0F\uFF0C\u8ACB\u6AA2\u67E5\u9023\u7DDA\u5F8C\u91CD\u8A66\u3002"));
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "\u91CD\u65B0\u8F09\u5165";
    retry.onclick = () => location.reload();
    alert.append(retry);
    console.error("domain_initialization_failed", error);
    return;
  }
  main.inert = false;
  main.removeAttribute("aria-busy");
  initContactMethodToggle();
  initSearchContactMethodToggle();
  initVisibleViewportFit();
  showSection("customer", document.querySelector(".nav-item"));
  setDefaultDate();
  updateCartDisplay();
  detectDevice();
  initializeButtonStates();
  initializeModalCloseHandlers();
  initCustomerAutocomplete();
  initEscapeToClose();
  initAccessibleDialogs();
  initOrderDraftPersistence();
  initializeAccessibility();
  initializeWorkspace();
  toggleShippingField();
  renderCalendar(true);
  loadInitialShopData();
  const requestedSection = !location.hash && new URLSearchParams(location.search).get("section");
  if (requestedSection && document.getElementById(requestedSection)) showSectionById(requestedSection);
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", startApplication, { once: true });
else startApplication();
