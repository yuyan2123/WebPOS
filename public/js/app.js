// 全域變數
        let currentCustomer = {};
        let currentDeliveryDate = '';
        let giftCart = [];
        let cakeCart = [];
        let giftboxCart = [];
        let allProducts = [];
        let currentModalProduct = null;
        let confirmCallback = null;
        let isCompanyCustomer = false;
        let isSubmittingOrder = false; // 送單防重入鎖，避免重複按建立訂單

        // 禮盒相關變數
        let currentGiftboxSize = 0;
        let giftboxSelection = {};
        let currentGiftboxCombo = null;
        let editingGiftboxIndex = -1; // 正在編輯的禮盒索引，-1 表示新增模式

        // 生成唯一ID（前端版本）
        function generateUniqueId(prefix = '') {
            const timestamp = new Date().getTime().toString().slice(-6);
            const random = Math.random().toString(36).substr(2, 3);
            return prefix + timestamp + random;
        }

        // 取得有效價格（企業客戶時套用企業價）
        function getEffectivePrice(product) {
            if (isCompanyCustomer && product.companyPrice && parseFloat(product.companyPrice) > 0) {
                return parseFloat(product.companyPrice);
            }
            return parseFloat(product.price);
        }

        // 訂單編輯相關變數
        let isEditingOrder = false;
        let editingOrderId = null;
        let expandedSearchOrderId = null;
        let collapsingSearchOrderId = null;
        let orderItemsTransitionTimer = null;
        let currentSearchOrders = [];
        let currentOrderTableType = null;
        let currentContactMethod = 'phone';
        let searchNextCursor = null;
        let lastSearchCriteria = null;
        let isLoadingMoreOrders = false;
        let draftSaveTimer = null;
        let restoredDraftKey = null;
        let suppressDraftSave = false;
        let posLocalDbPromise = null;
        let currentOrderRequestId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : generateUniqueId('REQ');

        function openPosLocalDb() {
            if (!('indexedDB' in window)) return Promise.resolve(null);
            if (posLocalDbPromise) return posLocalDbPromise;
            posLocalDbPromise = new Promise(function(resolve, reject) {
                const request = indexedDB.open('ginJiaPosLocal', 1);
                request.onupgradeneeded = function() {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts');
                    if (!db.objectStoreNames.contains('catalogs')) db.createObjectStore('catalogs');
                };
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function() { reject(request.error); };
            }).catch(function(error) {
                console.warn('無法開啟本機草稿資料庫', error);
                return null;
            });
            return posLocalDbPromise;
        }

        async function localDbOperation(storeName, mode, operation) {
            const db = await openPosLocalDb();
            if (!db) return null;
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(storeName, mode);
                const request = operation(tx.objectStore(storeName));
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function() { reject(request.error); };
            });
        }

        function localDbGet(store, key) { return localDbOperation(store, 'readonly', function(s) { return s.get(key); }); }
        function localDbPut(store, key, value) { return localDbOperation(store, 'readwrite', function(s) { return s.put(value, key); }); }
        function localDbDelete(store, key) { return localDbOperation(store, 'readwrite', function(s) { return s.delete(key); }); }

        function currentLocalScope() {
            const uid = document.body.dataset.userId;
            const shopId = document.body.dataset.shopId;
            return uid && shopId ? `${uid}:${shopId}` : '';
        }

        function draftStorageKey() {
            const scope = currentLocalScope();
            return scope ? `order:${scope}` : '';
        }

        function catalogStorageKey() {
            const scope = currentLocalScope();
            return scope ? `products:${scope}` : '';
        }

        function captureOrderDraft() {
            return {
                version: 1,
                updatedAt: new Date().toISOString(),
                currentCustomer,
                currentContactMethod,
                currentDeliveryDate,
                giftCart,
                cakeCart,
                giftboxCart,
                isCompanyCustomer,
                isEditingOrder,
                editingOrderId,
                currentOrderRequestId,
                fields: {
                    customerName: document.getElementById('customerName')?.value || '',
                    customerPhone: document.getElementById('customerPhone')?.value || '',
                    customerAddress: document.getElementById('customerAddress')?.value || '',
                    recipientName: document.getElementById('recipientName')?.value || '',
                    recipientPhone: document.getElementById('recipientPhone')?.value || '',
                    deliveryType: document.getElementById('deliveryTypeValue')?.value || '外送',
                    shippingOption: document.getElementById('shippingOption')?.value || 'free',
                    shippingFee: document.getElementById('shippingFee')?.value || '',
                    selectedTitle: getSelectedTitle(),
                },
            };
        }

        function hasMeaningfulDraft(draft) {
            return Boolean(
                draft?.currentCustomer?.name || draft?.currentCustomer?.contactValue || draft?.currentCustomer?.phone ||
                draft?.fields?.customerName || draft?.fields?.customerPhone || draft?.currentDeliveryDate ||
                draft?.giftCart?.length || draft?.cakeCart?.length || draft?.giftboxCart?.length || draft?.isEditingOrder
            );
        }

        function scheduleDraftSave() {
            if (suppressDraftSave) return;
            clearTimeout(draftSaveTimer);
            draftSaveTimer = setTimeout(async function() {
                const key = draftStorageKey();
                if (!key) return;
                const draft = captureOrderDraft();
                try {
                    if (hasMeaningfulDraft(draft)) {
                        await localDbPut('drafts', key, draft);
                        document.body.dataset.draftDirty = 'true';
                    } else {
                        await localDbDelete('drafts', key);
                        document.body.dataset.draftDirty = 'false';
                    }
                } catch (error) {
                    console.warn('訂單草稿保存失敗', error);
                }
            }, 250);
        }

        async function clearOrderDraft() {
            clearTimeout(draftSaveTimer);
            const key = draftStorageKey();
            document.body.dataset.draftDirty = 'false';
            if (key) await localDbDelete('drafts', key).catch(function(error) { console.warn('草稿清除失敗', error); });
        }

        window.saveOrderDraftNow = async function() {
            clearTimeout(draftSaveTimer);
            const key = draftStorageKey();
            const draft = captureOrderDraft();
            if (key && hasMeaningfulDraft(draft)) await localDbPut('drafts', key, draft);
        };

        function applyRoleCapabilities() {
            const viewer = document.body.dataset.shopRole === 'viewer';
            document.querySelectorAll('.requires-editor').forEach(function(element) {
                element.hidden = viewer;
                element.setAttribute('aria-hidden', String(viewer));
            });
            if (viewer) document.body.dataset.permissionNotice = 'readonly';
            else delete document.body.dataset.permissionNotice;
            document.querySelectorAll('#settingsCapacity input, #settingsCapacity button').forEach(function(element) {
                element.disabled = viewer;
                element.setAttribute('aria-disabled', String(viewer));
            });
            if (allProducts.length) renderProductCards();
            if (currentSearchOrders.length) displayOrderTable(currentSearchOrders, 'searchResults', 'search');
            updateCartDisplay();
        }

        function applyDraft(draft) {
            const fields = draft.fields || {};
            suppressDraftSave = true;
            currentContactMethod = draft.currentContactMethod === 'line' ? 'line' : 'phone';
            selectContactMethod(currentContactMethod, false);
            ['customerName', 'customerPhone', 'customerAddress', 'recipientName', 'recipientPhone', 'shippingFee'].forEach(function(id) {
                const element = document.getElementById(id);
                if (element) element.value = fields[id] || '';
            });
            if (currentContactMethod === 'line') document.getElementById('customerPhone').value = 'LINE';
            document.querySelectorAll('#nameTitleGroup .name-title-btn').forEach(function(button) {
                button.classList.toggle('active', button.dataset.title === fields.selectedTitle);
            });
            currentCustomer = draft.currentCustomer || {};
            currentDeliveryDate = draft.currentDeliveryDate || '';
            giftCart = Array.isArray(draft.giftCart) ? draft.giftCart : [];
            cakeCart = Array.isArray(draft.cakeCart) ? draft.cakeCart : [];
            giftboxCart = Array.isArray(draft.giftboxCart) ? draft.giftboxCart : [];
            isCompanyCustomer = Boolean(draft.isCompanyCustomer);
            isEditingOrder = Boolean(draft.isEditingOrder);
            editingOrderId = draft.editingOrderId || null;
            currentOrderRequestId = draft.currentOrderRequestId || (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : generateUniqueId('REQ'));
            selectCustomerType(document.getElementById(isCompanyCustomer ? 'customerCompany' : 'customerNormal'), isCompanyCustomer);
            selectDeliveryType(document.getElementById({ '寄貨': 'deliveryShipping', '自取': 'deliveryPickup' }[fields.deliveryType] || 'deliveryHome'), fields.deliveryType || '外送');
            selectShippingFee(document.getElementById(fields.shippingOption === 'charge' ? 'chargeShipping' : 'freeShipping'), fields.shippingOption || 'free');
            if (currentDeliveryDate) {
                document.getElementById('deliveryDate').value = currentDeliveryDate;
                calendarState.selectedDateStr = currentDeliveryDate;
            }
            updateCartDisplay();
            renderCalendar();
            suppressDraftSave = false;
            document.body.dataset.draftDirty = 'true';
            showAlert('已恢復上次未完成的訂單草稿', 'success');
        }

        async function restoreOrderDraftOnce() {
            const key = draftStorageKey();
            if (!key || restoredDraftKey === key) return;
            restoredDraftKey = key;
            const draft = await localDbGet('drafts', key).catch(function() { return null; });
            if (!hasMeaningfulDraft(draft)) return;
            const age = Date.now() - new Date(draft.updatedAt || 0).getTime();
            if (!Number.isFinite(age) || age > 30 * 24 * 60 * 60 * 1000) {
                await localDbDelete('drafts', key);
                return;
            }
            if (confirm('找到上次未完成的訂單草稿，是否繼續？')) applyDraft(draft);
            else await clearOrderDraft();
        }

        function initOrderDraftPersistence() {
            const form = document.getElementById('customer');
            form?.addEventListener('input', scheduleDraftSave);
            form?.addEventListener('change', scheduleDraftSave);
            window.addEventListener('pos:shop-changed', function() {
                restoredDraftKey = null;
                restoreOrderDraftOnce();
                applyRoleCapabilities();
            });
        }

        function initAccessibleDialogs() {
            document.querySelectorAll('.modal').forEach(function(modal) {
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
            });
            document.querySelectorAll('label:not([for])').forEach(function(label) {
                const control = label.parentElement?.querySelector('input[id], select[id], textarea[id]');
                if (control) label.htmlFor = control.id;
            });
            document.querySelectorAll('input:not([aria-label]), select:not([aria-label]), textarea:not([aria-label])').forEach(function(control) {
                if (!control.labels?.length) control.setAttribute('aria-label', control.placeholder || control.id || '輸入欄位');
            });
            document.querySelectorAll('button').forEach(function(button) {
                if (!button.getAttribute('aria-label') && !button.textContent.trim()) {
                    const icon = button.querySelector('i');
                    if (icon?.classList.contains('fa-plus')) button.setAttribute('aria-label', '增加數量');
                    else if (icon?.classList.contains('fa-minus')) button.setAttribute('aria-label', '減少數量');
                    else if (icon?.classList.contains('fa-trash-alt')) button.setAttribute('aria-label', '刪除');
                    else if (icon?.classList.contains('fa-times')) button.setAttribute('aria-label', '關閉');
                    else if (icon?.classList.contains('fa-chevron-left')) button.setAttribute('aria-label', '上一個月');
                    else if (icon?.classList.contains('fa-chevron-right')) button.setAttribute('aria-label', '下一個月');
                    else if (button.textContent.trim() === '×') button.setAttribute('aria-label', '關閉');
                }
            });
        }

        // 頁面載入時初始化
        document.addEventListener('DOMContentLoaded', function() {
            initVisibleViewportFit();
            showSection('customer', document.querySelector('.nav-item'));
            setDefaultDate();
            updateCartDisplay();
            detectDevice();
            initializeButtonStates();
            initializeModalCloseHandlers();
            initCustomerAutocomplete();
            initEscapeToClose();
            initAccessibleDialogs();
            initOrderDraftPersistence();
            document.getElementById('searchContactType')?.addEventListener('change', function() {
                const input = document.getElementById('searchPhone');
                if (!input) return;
                input.placeholder = this.value === 'line' ? '輸入 LINE ID' : '輸入電話號碼';
                input.inputMode = this.value === 'line' ? 'text' : 'tel';
            });
            // 初始化配送方式相關欄位顯示
            toggleShippingField();
            // 初始化日曆 (新UI)
            renderCalendar(true);
            // 商品與目前月份產能合併載入；客戶只在使用者輸入時查詢。
            loadInitialShopData();
            const requestedSection = new URLSearchParams(location.search).get('section');
            if (requestedSection && document.getElementById(requestedSection)) showSectionById(requestedSection);
        });

        // ==========================================
        //   可視範圍偵測（內嵌於 Google Sites 等外層網頁）
        //   iframe 的高度由外層網頁決定，常大於瀏覽器實際看得到的範圍
        //   （iPad Safari 的網址列、分頁列會吃掉上方空間），造成介面下緣
        //   被裁切又捲不到。這裡用 IntersectionObserver 量出真正可視的區間，
        //   寫入 --vp-top / --vp-bottom，讓版面只使用看得到的高度。
        //   非內嵌或瀏覽器不支援時量測結果為 0，版面行為不變。
        // ==========================================
        let viewportProbeObserver = null;
        let viewportRemeasureTimer = null;

        function initVisibleViewportFit() {
            const probe = document.getElementById('viewportProbe');
            if (!probe || typeof IntersectionObserver === 'undefined') return;

            // 密集 threshold，外層網頁捲動造成的可視範圍變化才會即時回報
            const thresholds = [];
            for (let i = 0; i <= 100; i++) thresholds.push(i / 100);

            viewportProbeObserver = new IntersectionObserver(function(entries) {
                applyVisibleViewport(entries[entries.length - 1]);
            }, { threshold: thresholds });

            viewportProbeObserver.observe(probe);

            window.addEventListener('resize', scheduleViewportRemeasure);
            window.addEventListener('orientationchange', scheduleViewportRemeasure);
            document.addEventListener('visibilitychange', scheduleViewportRemeasure);
            // iOS 捲動外層網頁時 observer 不一定會即時觸發，觸控結束後補量一次
            window.addEventListener('touchend', scheduleViewportRemeasure, { passive: true });

            // 外層網頁（Google Sites）版面可能較晚才確定 iframe 尺寸
            setTimeout(scheduleViewportRemeasure, 300);
            setTimeout(scheduleViewportRemeasure, 1500);
        }

        /**
         * 重新觀察一次探針，強制 IntersectionObserver 回報最新結果
         */
        function scheduleViewportRemeasure() {
            if (!viewportProbeObserver) return;
            clearTimeout(viewportRemeasureTimer);
            viewportRemeasureTimer = setTimeout(function() {
                const probe = document.getElementById('viewportProbe');
                if (!probe) return;
                viewportProbeObserver.unobserve(probe);
                viewportProbeObserver.observe(probe);
            }, 150);
        }

        function applyVisibleViewport(entry) {
            if (!entry || !entry.intersectionRect) return;

            const frameHeight = window.innerHeight;
            const rect = entry.intersectionRect;

            // 完全不可見（切到其他分頁、外層捲離畫面）時不調整，避免版面被壓成 0
            if (!frameHeight || rect.height <= 0) return;

            let top = Math.max(0, Math.round(rect.top));
            let bottom = Math.max(0, Math.round(frameHeight - rect.bottom));
            if (!isFinite(top) || !isFinite(bottom)) return;

            // 誤差在幾個 px 內視為沒被裁切
            if (top + bottom < 8) {
                top = 0;
                bottom = 0;
            }

            // 安全下限：可用高度過小就不套用，寧可維持原樣也不要把介面壓扁
            if (frameHeight - top - bottom < 320) return;

            const root = document.documentElement;
            if (root.style.getPropertyValue('--vp-top') === top + 'px' &&
                root.style.getPropertyValue('--vp-bottom') === bottom + 'px') {
                return;
            }

            root.style.setProperty('--vp-top', top + 'px');
            root.style.setProperty('--vp-bottom', bottom + 'px');
        }

        // 檢測設備類型
        function detectDevice() {
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            const isMobile = /android|iPad|iPhone|iPod/i.test(userAgent);
            const body = document.body;

            if (isMobile) {
                body.classList.add('mobile-device');
            } else {
                body.classList.add('desktop-device');
            }

            // 填入裝置資訊
            const deviceOsEl = document.getElementById('deviceOs');
            const layoutModeEl = document.getElementById('layoutMode');
            const fullUserAgentEl = document.getElementById('fullUserAgent');

            if (deviceOsEl) {
                // 解析作業系統
                let os = '未知';
                if (userAgent.indexOf('Win') !== -1) os = 'Windows';
                else if (userAgent.indexOf('Mac') !== -1) os = 'macOS';
                else if (userAgent.indexOf('Linux') !== -1) os = 'Linux';
                else if (userAgent.indexOf('Android') !== -1) os = 'Android';
                else if (userAgent.indexOf('iPhone') !== -1 || userAgent.indexOf('iPad') !== -1) os = 'iOS';
                deviceOsEl.value = os;
            }

            if (layoutModeEl) {
                layoutModeEl.value = isMobile ? '行動裝置模式' : '桌面模式';
            }

            if (fullUserAgentEl) {
                fullUserAgentEl.value = userAgent;
            }
        }

        // 初始化按鈕狀態
        function initializeButtonStates() {
            // 為重要按鈕添加防重複點擊保護
            const importantButtons = [
                'checkoutBtn', 'proceedStep3'
            ];

            importantButtons.forEach(btnId => {
                const btn = document.getElementById(btnId);
                if (btn && !btn.dataset.protectedClick) {
                    const originalOnclick = btn.onclick;
                    if (originalOnclick) {
                        btn.onclick = preventDoubleClick(btnId, originalOnclick, 2000);
                        btn.dataset.protectedClick = 'true';
                    }
                }
            });
        }

        // Escape 鍵關閉最上層視窗（含動態建立的視窗與購物車側欄）
        function initEscapeToClose() {
            document.addEventListener('keydown', function(e) {
                if (e.key !== 'Escape') return;

                const activeModals = document.querySelectorAll('.modal.active');
                if (activeModals.length > 0) {
                    const top = activeModals[activeModals.length - 1];
                    top.classList.remove('active');
                    if (!top.id) top.remove(); // 動態建立的視窗直接移除
                    return;
                }

                const cartModal = document.getElementById('cartModal');
                if (cartModal && cartModal.classList.contains('active')) {
                    closeCartModal();
                }
            });
        }

        // 初始化modal點擊外部關閉功能
        function initializeModalCloseHandlers() {
            // 為所有modal添加統一的點擊外部關閉功能
            const modals = document.querySelectorAll('.modal');

            modals.forEach(modal => {
                // 如果modal還沒有onclick事件，添加一個
                if (!modal.onclick) {
                    const modalId = modal.id;

                    // 根據modal ID設定對應的關閉函數
                    switch(modalId) {
                        case 'cartModal':
                            modal.onclick = closeCartModal;
                            break;
                        case 'productModal':
                            modal.onclick = closeProductModal;
                            break;
                        case 'productEditModal':
                            modal.onclick = closeProductEditModal;
                            break;
                        case 'confirmModal':
                            modal.onclick = closeConfirmModal;
                            break;
                        default:
                            // 對於動態創建的modal，使用通用關閉方法
                            modal.onclick = function() {
                                this.classList.remove('active');
                                // 如果是動態創建的modal，直接移除
                                if (!document.getElementById(modalId)) {
                                    this.remove();
                                }
                            };
                    }
                }

                // 確保modal內容區域有stopPropagation
                const modalContent = modal.querySelector('.modal-content');
                if (modalContent && !modalContent.onclick) {
                    modalContent.onclick = function(event) {
                        event.stopPropagation();
                    };
                }
            });
        }

        // 注意：showSection 函數在文件後面的新 UI 適配層中定義

        // 程式控制顯示指定區塊
        function showSectionById(sectionName) {
            const sectionMap = { customer: 0, date: 1, gift: 2, cake: 3, giftbox: 4, search: 5, settings: 6 };
            const navItems = document.querySelectorAll('.nav-item');
            const index = sectionMap[sectionName];

            if (index !== undefined) {
                showSection(sectionName, navItems[index]);
            }
        }

        // 注意：showSettingsSection 函數在文件後面的新 UI 適配層中定義

        // 舊的 JS 邏輯...
        function setDefaultDate() {
            const today = getTaipeiDate();
            document.getElementById('deliveryDate').value = today;
            // reportDatePicker 由 AirDatepicker 管理，不需預設值
            // 搜尋日期不設預設值
            // document.getElementById('searchDate').value = today;
        }

        function getTaipeiDate() {
            const now = new Date();
            const taipeiTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
            return taipeiTime.toISOString().split('T')[0];
        }

        function formatDate(dateInput) {
            try {
                let date;
                if (typeof dateInput === 'string') {
                    date = new Date(dateInput);
                } else if (dateInput instanceof Date) {
                    date = dateInput;
                } else {
                    return dateInput.toString();
                }
                
                if (isNaN(date.getTime())) {
                    return dateInput.toString();
                }
                
                // 格式化為 YYYY-MM-DD
                return date.toISOString().split('T')[0];
            } catch (error) {
                console.log('日期格式化錯誤:', error);
                return dateInput.toString();
            }
        }

        // 注意：toggleShippingField 由文件後面的新 UI 適配層定義（讀取 deliveryTypeValue hidden input）

        function toggleShippingFeeInput() {
            const shippingOption = document.getElementById('shippingOption').value;
            const isCharge = shippingOption === 'charge';
            const shippingFeeInput = document.getElementById('shippingFeeInput');

            if (isCharge) {
                shippingFeeInput.style.display = 'block';
            } else {
                shippingFeeInput.style.display = 'none';
                document.getElementById('shippingFee').value = '';
            }

            updateOrderTotal();
        }

        // 計算商品總金額
        function updateOrderTotal() {
            const allItems = [...giftCart, ...cakeCart, ...giftboxCart];
            const itemsTotal = allItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            // 計算運費（讀取 hidden input，配合新版 grove 按鈕）
            let shippingFee = 0;
            const isPickup = document.getElementById('deliveryTypeValue').value === '自取';
            const isChargeShipping = document.getElementById('shippingOption').value === 'charge';

            if (!isPickup && isChargeShipping) {
                const shippingFeeInput = document.getElementById('shippingFee');
                shippingFee = parseFloat(shippingFeeInput.value) || 0;
            }
            
            // 總金額 = 商品總金額 + 運費
            const totalAmount = itemsTotal + shippingFee;
            
            // 更新購物車顯示的總金額
            const cartTotalEl = document.getElementById('cartTotalAmount');
            if (cartTotalEl) {
                cartTotalEl.textContent = totalAmount;
            }
            
            return {
                itemsTotal: itemsTotal,
                shippingFee: shippingFee,
                totalAmount: totalAmount
            };
        }

        function toggleNameTitle(btn) {
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                return;
            }
            document.querySelectorAll('#nameTitleGroup .name-title-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            scheduleDraftSave();
        }

        function selectContactMethod(method, clearValue = true) {
            currentContactMethod = method === 'line' ? 'line' : 'phone';
            const input = document.getElementById('customerPhone');
            const label = document.getElementById('customerContactLabel');
            const hint = document.getElementById('customerContactHint');
            document.getElementById('contactMethodPhone')?.classList.toggle('active', currentContactMethod === 'phone');
            document.getElementById('contactMethodLine')?.classList.toggle('active', currentContactMethod === 'line');
            if (input) {
                if (clearValue || currentContactMethod === 'line') input.value = currentContactMethod === 'line' ? 'LINE' : '';
                input.type = currentContactMethod === 'phone' ? 'tel' : 'text';
                input.inputMode = currentContactMethod === 'phone' ? 'tel' : 'none';
                input.placeholder = currentContactMethod === 'phone' ? '09xx-xxx-xxx' : '';
                input.readOnly = currentContactMethod === 'line';
                input.setAttribute('aria-label', currentContactMethod === 'phone' ? '客戶電話' : '聯絡方式 LINE');
            }
            if (label) label.textContent = '聯絡電話';
            if (hint) {
                hint.textContent = '請輸入可聯絡的電話號碼';
                hint.hidden = currentContactMethod === 'line';
            }
            closeAllAcLists();
            scheduleDraftSave();
        }

        // --- 客戶 Autocomplete ---
        let acDebounceTimer = null;
        let acResultsCache = [];
        const customerSearchCache = new Map();

        function initCustomerAutocomplete() {
            const nameInput = document.getElementById('customerName');
            const phoneInput = document.getElementById('customerPhone');

            nameInput.addEventListener('input', function() {
                debounceAcSearch(this.value.trim(), 'customerAcList', 'name');
            });
            phoneInput.addEventListener('input', function() {
                debounceAcSearch(this.value.trim(), 'customerAcListPhone', 'contact');
            });

            // 點擊外部關閉
            document.addEventListener('click', function(e) {
                if (!e.target.closest('.customer-ac-wrap')) {
                    closeAllAcLists();
                }
            });

            // 鍵盤導航
            nameInput.addEventListener('keydown', function(e) { acKeyNav(e, 'customerAcList'); });
            phoneInput.addEventListener('keydown', function(e) { acKeyNav(e, 'customerAcListPhone'); });
        }

        function debounceAcSearch(keyword, listId, mode) {
            clearTimeout(acDebounceTimer);
            if (!keyword || keyword.length < 2) {
                document.getElementById(listId).classList.remove('show');
                return;
            }
            const cacheKey = `${mode}:${currentContactMethod}:${keyword.toLocaleLowerCase()}`;
            if (customerSearchCache.has(cacheKey)) {
                renderAcList(customerSearchCache.get(cacheKey), listId);
                return;
            }
            // 只查前綴並快取結果，避免下載整個客戶集合。
            acDebounceTimer = setTimeout(function() {
                if (typeof google !== 'undefined' && google.script && google.script.run) {
                    google.script.run
                        .withSuccessHandler(function(results) {
                            customerSearchCache.set(cacheKey, results || []);
                            renderAcList(results, listId);
                        })
                        .searchCustomers({ keyword, mode, contactType: currentContactMethod });
                }
            }, 300);
        }

        function renderAcList(results, listId) {
            const list = document.getElementById(listId);
            if (!results || results.length === 0) {
                list.classList.remove('show');
                list.innerHTML = '';
                return;
            }
            acResultsCache = results;
            list.innerHTML = results.map(function(c, i) {
                return '<div class="customer-ac-item" data-index="' + i + '" onmousedown="selectAcCustomer(' + i + ')">'
                    + '<div class="customer-ac-icon"><i class="fas fa-user"></i></div>'
                    + '<div class="customer-ac-info">'
                    + '<div class="customer-ac-name">' + escapeHtml(c.name) + '</div>'
                    + '<div class="customer-ac-phone">' + escapeHtml(c.contactType === 'line' ? 'LINE' : (c.contactValue || c.phone || '')) + (c.address ? ' / ' + escapeHtml(c.address) : '') + '</div>'
                    + '</div></div>';
            }).join('');
            list.classList.add('show');
        }

        function selectAcCustomer(index) {
            const c = acResultsCache[index];
            if (!c) return;
            let name = c.name || '';
            // 拆分稱謂
            document.querySelectorAll('#nameTitleGroup .name-title-btn').forEach(function(b) { b.classList.remove('active'); });
            if (name.endsWith('先生') || name.endsWith('小姐')) {
                const title = name.slice(-2);
                name = name.slice(0, -2);
                const btn = document.querySelector('#nameTitleGroup .name-title-btn[data-title="' + title + '"]');
                if (btn) btn.classList.add('active');
            }
            document.getElementById('customerName').value = name;
            selectContactMethod(c.contactType === 'line' ? 'line' : 'phone', false);
            document.getElementById('customerPhone').value = c.contactType === 'line' ? 'LINE' : (c.contactValue || c.phone || '');
            if (c.address) {
                document.getElementById('customerAddress').value = c.address;
            }
            closeAllAcLists();
        }

        function closeAllAcLists() {
            document.querySelectorAll('.customer-ac-list').forEach(function(el) { el.classList.remove('show'); });
        }

        function acKeyNav(e, listId) {
            const list = document.getElementById(listId);
            if (!list.classList.contains('show')) return;
            const items = list.querySelectorAll('.customer-ac-item');
            if (items.length === 0) return;
            let idx = -1;
            items.forEach(function(item, i) { if (item.classList.contains('highlight')) idx = i; });

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                idx = (idx + 1) % items.length;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                idx = idx <= 0 ? items.length - 1 : idx - 1;
            } else if (e.key === 'Enter' && idx >= 0) {
                e.preventDefault();
                items[idx].dispatchEvent(new Event('mousedown'));
                return;
            } else if (e.key === 'Escape') {
                closeAllAcLists();
                return;
            } else {
                return;
            }
            items.forEach(function(item) { item.classList.remove('highlight'); });
            items[idx].classList.add('highlight');
            items[idx].scrollIntoView({ block: 'nearest' });
        }

        function escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = str;
            return d.innerHTML;
        }

        // HTML 屬性值專用跳脫（escapeHtml 不會處理引號）
        function escapeAttr(str) {
            return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function getSelectedTitle() {
            const active = document.querySelector('#nameTitleGroup .name-title-btn.active');
            return active ? active.dataset.title : '';
        }

        function saveCustomer() {
            const saveBtn = window.event?.currentTarget || window.event?.target;
            const rawName = document.getElementById('customerName').value.trim();
            const title = getSelectedTitle();
            const name = rawName ? rawName + title : '';
            const contactValue = currentContactMethod === 'line' ? 'LINE' : document.getElementById('customerPhone').value.trim();
            const address = document.getElementById('customerAddress').value.trim();
            const recipientName = document.getElementById('recipientName').value.trim();
            const recipientPhone = document.getElementById('recipientPhone').value.trim();
            const deliveryType = document.getElementById('deliveryTypeValue').value;

            if (!name) {
                showAlert('請輸入客戶姓名', 'error');
                return;
            }
            if (!contactValue) {
                showAlert('請輸入客戶電話', 'error');
                return;
            }

            currentCustomer = {
                name,
                contactType: currentContactMethod,
                contactValue,
                phone: currentContactMethod === 'phone' ? contactValue : '',
                lineId: currentContactMethod === 'line' ? contactValue : '',
                address,
                recipientName,
                recipientPhone,
                deliveryType,
                isCompanyCustomer: isCompanyCustomer
            };
            updateCartDisplay();
            showAlert('客戶資訊已儲存', 'success');
            if (saveBtn) setButtonLoading(saveBtn, false);
            showSectionById('date');
        }

        function clearCustomerForm() {
            document.getElementById('customerName').value = '';
            document.querySelectorAll('#nameTitleGroup .name-title-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('customerPhone').value = '';
            selectContactMethod('phone', false);
            document.getElementById('customerAddress').value = '';
            // 清空收件人資訊
            document.getElementById('recipientName').value = '';
            document.getElementById('recipientPhone').value = '';
            document.getElementById('shippingFee').value = '';
            // 重置配送方式為外送、運費設定為免運（同步 grove 按鈕與 hidden input，並還原欄位顯示）
            selectDeliveryType(document.getElementById('deliveryHome'), '外送');
            selectShippingFee(document.getElementById('freeShipping'), 'free');
            // 重置客戶類型為一般客戶
            isCompanyCustomer = false;
            document.getElementById('customerNormal').classList.add('active');
            document.getElementById('customerCompany').classList.remove('active');
            updateProductDisplays();
            currentCustomer = {};

            // 如果正在編輯訂單，清除編輯狀態
            if (isEditingOrder) {
                isEditingOrder = false;
                editingOrderId = null;
                giftCart = [];
                cakeCart = [];
                giftboxCart = [];
                currentDeliveryDate = '';
                document.getElementById('deliveryDate').value = '';
                showAlert('已取消訂單編輯', 'success');
            }

            updateCartDisplay(); // 更新購物車按鈕狀態
        }

        function setDeliveryDate() {
            const dateBtn = window.event?.currentTarget || window.event?.target;
            const date = document.getElementById('deliveryDate').value;
            if (!date) {
                showAlert('請選擇交貨日期', 'error');
                return;
            }

            currentDeliveryDate = date;
            updateCartDisplay();
            showAlert(`交貨日期已設定: ${date}`, 'success');
            if (dateBtn) setButtonLoading(dateBtn, false);
            showSectionById('gift');
        }

        // Public builds never bundle catalog, customer, or order data.
        function loadProducts() {
            // 顯示載入狀態
            const giftContainer = document.getElementById('giftProducts');
            const cakeContainer = document.getElementById('cakeProducts');
            giftContainer.innerHTML = '<p style="text-align: center; padding: 20px;">載入商品中...</p>';
            cakeContainer.innerHTML = '<p style="text-align: center; padding: 20px;">載入商品中...</p>';

            // 檢查是否在 Google Apps Script 環境中
            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(handleProductsLoaded)
                    .withFailureHandler(function(error) {
                        showProductLoadFailure(error);
                    })
                    .getProducts();
            } else {
                showProductLoadFailure(new Error('尚未連接 Firebase'));
            }
        }

        async function cacheProducts(products) {
            const key = catalogStorageKey();
            if (!key) return;
            await localDbPut('catalogs', key, { products, updatedAt: new Date().toISOString() }).catch(function() {});
        }

        async function showProductLoadFailure(error) {
            console.warn('商品資料載入失敗', error);
            const key = catalogStorageKey();
            const cached = key ? await localDbGet('catalogs', key).catch(function() { return null; }) : null;
            if (cached?.products?.length) {
                handleProductsLoaded(cached.products, { skipCache: true });
                document.querySelectorAll('#giftProducts, #cakeProducts').forEach(function(container) {
                    container.insertAdjacentHTML('afterbegin', `<div class="product-stale-banner col-span-full"><i class="fas fa-cloud-slash"></i> 無法連線，顯示 ${formatDisplayDate(cached.updatedAt)} 的商品資料 <button type="button" onclick="loadProducts()">重試</button></div>`);
                });
                return;
            }
            const message = `<div class="product-load-error col-span-full" role="alert"><i class="fas fa-wifi"></i><strong>商品載入失敗</strong><span>${escapeHtml(error?.message || '請檢查網路連線')}</span><button type="button" onclick="loadProducts()">重新載入</button></div>`;
            document.getElementById('giftProducts').innerHTML = message;
            document.getElementById('cakeProducts').innerHTML = message;
        }

        function loadInitialShopData() {
            const now = new Date();
            if (typeof google === 'undefined' || !google.script || !google.script.run) {
                showProductLoadFailure(new Error('尚未連接 Firebase'));
                renderCalendar();
                return;
            }
            google.script.run
                .withSuccessHandler(function(result) {
                    handleProductsLoaded(result?.products || []);
                    if (result?.capacityMonth?.key) {
                        monthCapacityCache[result.capacityMonth.key] = result.capacityMonth.data || {};
                    }
                    renderCalendar();
                })
                .withFailureHandler(function(error) {
                    console.warn('初始資料載入失敗，改用商品重試流程', error);
                    loadProducts();
                    renderCalendar();
                })
                .getShopBootstrap(now.getFullYear(), now.getMonth() + 1);
        }

        let currentProductFilter = '全部';

        function handleProductsLoaded(products, options = {}) {
            allProducts = Array.isArray(products) ? products : [];
            if (!options.skipCache) cacheProducts(allProducts);
            renderProductCards();
            updateProductDisplays();
            updateNavVisibility();
            restoreOrderDraftOnce();
        }

        function updateNavVisibility() {
            const activeProducts = allProducts.filter(p => p.status === '啟用');
            const hasGift = activeProducts.some(p => p.category === '伴手禮');
            const hasCake = activeProducts.some(p => p.category === '喜餅');
            const hasGiftbox = activeProducts.some(p => p.giftBoxEnabled === '是');

            document.getElementById('nav-gift').style.display = hasGift ? '' : 'none';
            document.getElementById('nav-cake').style.display = hasCake ? '' : 'none';
            document.getElementById('nav-giftbox').style.display = hasGiftbox ? '' : 'none';
        }

        function renderProductCards() {
            const grid = document.getElementById('productsCardGrid');
            const tabsContainer = document.getElementById('productsFilterTabs');

            // 建立類別篩選 tabs
            const categories = ['全部', ...new Set(allProducts.map(p => p.category))];
            const categoryCounts = {};
            categoryCounts['全部'] = allProducts.length;
            allProducts.forEach(p => {
                categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
            });
            tabsContainer.innerHTML = categories.map(cat =>
                `<button class="${cat === currentProductFilter ? 'active' : ''}" onclick="filterProductsByCategory('${cat}')">${cat}(${categoryCounts[cat]})</button>`
            ).join('');

            // 篩選商品
            const filtered = currentProductFilter === '全部'
                ? allProducts
                : allProducts.filter(p => p.category === currentProductFilter);

            if (filtered.length === 0) {
                grid.innerHTML = `<div class="products-empty" style="grid-column: 1/-1;">
                    <i class="fas fa-box-open"></i>
                    <p>尚無商品資料</p>
                </div>`;
                return;
            }

            grid.innerHTML = filtered.map(p => {
                const statusClass = p.status === '啟用' ? 'enabled' : 'disabled';
                const statusIcon = p.status === '啟用' ? 'fa-check-circle' : 'fa-times-circle';
                const giftboxBadge = p.giftBoxEnabled === '是'
                    ? '<span class="status-badge yes"><i class="fas fa-gift"></i> 可裝禮盒</span>'
                    : '';

                const specialPriceDisplay = p.specialPrice && p.specialPrice !== ''
                    ? `<span class="price-special">NT$ ${p.specialPrice}</span>`
                    : '<span class="price-none">--</span>';

                const companyPriceDisplay = p.companyPrice && p.companyPrice !== ''
                    ? `<span class="price-value" style="color: #4f46e5;">NT$ ${p.companyPrice}</span>`
                    : '<span class="price-none">--</span>';

                return `<div class="product-card">
                    <div class="product-card-header">
                        <span class="product-name">${p.productName}</span>
                        <span class="status-badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${p.status}</span>
                    </div>
                    <div class="product-card-tags">
                        <span class="status-badge category"><i class="fas fa-tag"></i> ${p.category}</span>
                        ${giftboxBadge}
                    </div>
                    <div class="product-card-prices">
                        <div class="price-row">
                            <span class="price-label">售價</span>
                            <span class="price-value">NT$ ${p.price}</span>
                        </div>
                        <div class="price-row">
                            <span class="price-label">特價</span>
                            ${specialPriceDisplay}
                        </div>
                        <div class="price-row">
                            <span class="price-label">企業價</span>
                            ${companyPriceDisplay}
                        </div>
                    </div>
                    ${document.body.dataset.shopRole === 'viewer' ? '' : `<div class="product-card-actions requires-editor">
                        <button class="btn-card-edit" onclick="editProduct('${p.productId}')">
                            <i class="fas fa-edit"></i> 編輯
                        </button>
                        <button class="btn-card-delete" onclick="event.stopPropagation(); deleteProduct('${p.productId}')">
                            <i class="fas fa-trash-alt"></i> 刪除
                        </button>
                    </div>`}
                </div>`;
            }).join('');
        }

        function filterProductsByCategory(category) {
            currentProductFilter = category;
            renderProductCards();
        }

        function updateProductDisplays() {
            loadProductsByCategory('伴手禮', 'gift');
            loadProductsByCategory('喜餅', 'cake');
        }

        function loadProductsByCategory(category, containerId) {
            const products = allProducts.filter(p => p.category === category && p.status === '啟用');
            const container = document.getElementById(containerId + 'Products');
            container.classList.remove('loading');

            if (products.length === 0) {
                container.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500">無可用商品</div>';
                return;
            }

            // 企業客戶模式提示 banner
            const companyBanner = isCompanyCustomer ? '<div class="company-mode-banner col-span-full"><i class="fas fa-building"></i>目前為企業客戶模式，商品已套用企業價格</div>' : '';

            const iconClass = category === '伴手禮' ? 'fa-cookie-bite' : 'fa-birthday-cake';
            const bgClass = category === '伴手禮' ? 'bg-orange-50 text-orange-300' : 'bg-pink-50 text-pink-300';
            const hoverBorderClass = category === '伴手禮' ? 'hover:border-orange-300' : 'hover:border-pink-300';

            container.innerHTML = companyBanner + products.map(p => {
                const hasSpecialPrice = p.specialPrice && p.specialPrice !== '';
                const effectivePrice = getEffectivePrice(p);
                const isCompanyPriceActive = isCompanyCustomer && p.companyPrice && parseFloat(p.companyPrice) > 0 && parseFloat(p.companyPrice) !== parseFloat(p.price);

                return `
                <div class="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col border ${hoverBorderClass} transition group relative h-full">
                    <!-- 上半部：點擊查看詳情/特價 -->
                    <div class="cursor-pointer flex-1 flex flex-col" onclick="showProductDetail('${p.productId}')">
                        <div class="h-32 ${bgClass} flex items-center justify-center relative overflow-hidden">
                            <i class="fas ${iconClass} text-5xl transform group-hover:scale-110 transition-transform duration-300"></i>
                            ${isCompanyPriceActive ? '<div class="absolute top-2 left-2 bg-indigo-600 text-white text-xs px-2 py-1 rounded-full font-bold shadow-sm">企業價</div>' : ''}
                        </div>
                        <div class="p-4 pb-2 flex-1">
                            <h3 class="font-bold text-lg mb-1 text-gray-800 line-clamp-2 h-14">${p.productName}</h3>
                            <p class="text-red-500 font-bold text-xl">${isCompanyPriceActive ? '<span class="company-original-price">NT$ ' + p.price + '</span>' : ''}NT$ ${effectivePrice}${isCompanyPriceActive ? '<span class="company-price-tag">企業價</span>' : ''}</p>
                        </div>
                    </div>

                    <!-- 下半部：操作按鈕 -->
                    <div class="p-4 pt-0 mt-auto">
                        <div class="flex items-center justify-between gap-3 bg-gray-50 p-2 rounded-lg border border-gray-100">
                            <button onclick="showProductDetail('${p.productId}')" class="flex-1 py-2 px-2 text-gray-600 text-sm font-medium hover:text-blue-600 transition flex items-center justify-center gap-1">
                                <i class="fas fa-edit"></i> 詳情
                            </button>
                            <div class="w-px h-6 bg-gray-300"></div>
                            <button onclick="addToCartDirectly('${p.productId}', '${category}')" class="w-10 h-10 bg-white border border-blue-200 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm active:scale-95 transition">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }

        function addToCartDirectly(productId, category) {
            // 防止事件冒泡觸發卡片點擊
            event.stopPropagation();

            const btn = window.event?.currentTarget || window.event?.target;

            // 防止快速重複點擊導致狀態錯亂
            if (btn.dataset.animating === 'true') {
                // 仍然加入購物車，但不重複動畫
                const product = allProducts.find(p => p.productId === productId);
                if (!product) return;
                const cart = category === '伴手禮' ? giftCart : cakeCart;
                const existingItem = cart.find(item => item.productId === productId && !item.isSpecialPrice && (!item.isCompanyPrice) === (!isCompanyCustomer) && (!item.notes || item.notes === ''));
                if (existingItem) {
                    existingItem.quantity += 1;
                } else {
                    cart.push({
                        productId: product.productId,
                        productName: product.productName,
                        price: getEffectivePrice(product),
                        quantity: 1,
                        category: category,
                        isSpecialPrice: false,
                        isCompanyPrice: isCompanyCustomer,
                        notes: ''
                    });
                }
                updateCartDisplay();
                return;
            }

            const product = allProducts.find(p => p.productId === productId);
            if (!product) return;

            const cart = category === '伴手禮' ? giftCart : cakeCart;
            // 尋找購物車中是否已有該商品（且非特價、無備註的標準品項）
            const existingItem = cart.find(item => item.productId === productId && !item.isSpecialPrice && (!item.isCompanyPrice) === (!isCompanyCustomer) && (!item.notes || item.notes === ''));

            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                cart.push({
                    productId: product.productId,
                    productName: product.productName,
                    price: getEffectivePrice(product),
                    quantity: 1,
                    category: category,
                    isSpecialPrice: false,
                    isCompanyPrice: isCompanyCustomer,
                    notes: ''
                });
            }

            updateCartDisplay();

            // 按鈕回饋動畫 - 使用 data 屬性保存原始狀態
            const originalContent = '<i class="fas fa-plus"></i>';
            const originalClasses = "w-10 h-10 bg-white border border-blue-200 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm active:scale-95 transition add-to-cart-btn";

            btn.dataset.animating = 'true';
            btn.innerHTML = '<i class="fas fa-check"></i>';
            btn.className = "w-10 h-10 bg-green-500 text-white rounded-lg flex items-center justify-center shadow-md transition add-to-cart-btn";

            setTimeout(() => {
                btn.innerHTML = originalContent;
                btn.className = originalClasses;
                btn.dataset.animating = 'false';
            }, 600);
        }

        function showProductDetail(productId) {
            const product = allProducts.find(p => p.productId === productId);
            if (!product) return;
            currentModalProduct = product;
            const effectivePrice = getEffectivePrice(product);
            document.getElementById('modalProductName').textContent = product.productName;
            document.getElementById('modalProductPrice').innerHTML = isCompanyCustomer && effectivePrice !== parseFloat(product.price) ? '<span class="company-original-price">NT$ ' + product.price + '</span> NT$ ' + effectivePrice + '<span class="company-price-tag">企業價</span>' : 'NT$ ' + effectivePrice;
            document.getElementById('modalProductDescription').textContent = product.description || '無商品描述';
            document.getElementById('modalQuantity').value = 1;
            
            // 載入特價信息
            const specialPriceInput = document.getElementById('specialPriceInput');
            const useSpecialPriceCheckbox = document.getElementById('useSpecialPrice');
            
            if (product.specialPrice && product.specialPrice !== '') {
                specialPriceInput.value = product.specialPrice;
                // 如果有預設特價，可以選擇是否自動開啟，這裡選擇不自動開啟
                useSpecialPriceCheckbox.checked = false;
            } else {
                specialPriceInput.value = '';
                useSpecialPriceCheckbox.checked = false;
            }
            
            // 應用 UI 狀態
            toggleSpecialPrice();
            
            document.getElementById('productModal').classList.add('active');
            // 確保modal有正確的關閉處理器
            setTimeout(() => initializeModalCloseHandlers(), 50);
        }

        function closeProductModal() {
            document.getElementById('productModal').classList.remove('active');
            currentModalProduct = null;
        }

        function toggleSpecialPrice() {
            const checkbox = document.getElementById('useSpecialPrice');
            const priceComparison = document.getElementById('priceComparison');
            const section = document.getElementById('specialPriceSection');
            
            if (checkbox.checked) {
                section.style.maxHeight = '200px';
                section.style.opacity = '1';
                priceComparison.style.display = 'flex';
                updateModalPrice();
            } else {
                section.style.maxHeight = '0';
                section.style.opacity = '0';
                priceComparison.style.display = 'none';
                // 重置為原價顯示
                if (currentModalProduct) {
                    document.getElementById('modalProductPrice').textContent = `NT$ ${currentModalProduct.price}`;
                }
            }
        }
        
        function activateSpecialPrice() {
            const checkbox = document.getElementById('useSpecialPrice');
            if (!checkbox.checked) {
                checkbox.checked = true;
                toggleSpecialPrice();
            }
        }
        
        function updateModalPrice() {
            if (!currentModalProduct) return;
            
            const checkbox = document.getElementById('useSpecialPrice');
            const specialPriceInput = document.getElementById('specialPriceInput');
            const specialPrice = parseFloat(specialPriceInput.value) || 0;
            
            if (checkbox.checked && specialPrice > 0) {
                // 顯示特價
                document.getElementById('modalProductPrice').textContent = `NT$ ${specialPrice}`;
                document.getElementById('originalPriceText').textContent = currentModalProduct.price;
                document.getElementById('specialPriceText').textContent = specialPrice;
                document.getElementById('priceComparison').style.display = 'block';
                
                // 不再立即更新資料庫，改為加入購物車時才更新
            } else {
                // 顯示原價
                document.getElementById('modalProductPrice').textContent = `NT$ ${currentModalProduct.price}`;
                document.getElementById('priceComparison').style.display = 'none';
            }
        }
        
        function updateProductSpecialPrice(productId, specialPrice) {
            // 透過已驗證的 Firebase RPC 更新商品特價。
            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withFailureHandler(function(error) {
                        console.log('更新特價失敗:', error);
                    })
                    .updateProductSpecialPrice(productId, specialPrice);
            } else {
                showAlert('尚未連接 Firebase，特價未儲存', 'error');
            }
        }

        function changeModalQuantity(change) {
            const qtyInput = document.getElementById('modalQuantity');
            let val = parseInt(qtyInput.value) + change;
            if (val < 1) val = 1;
            qtyInput.value = val;
        }

        function validateModalQuantity(newQuantity) {
            const qty = parseInt(newQuantity) || 1;
            const qtyInput = document.getElementById('modalQuantity');
            if (qty < 1) {
                qtyInput.value = 1;
            } else {
                qtyInput.value = qty;
            }
        }

        function updateCartItemDirectly(index, newQuantity) {
            const qty = parseInt(newQuantity) || 1;
            if (qty < 1) {
                updateCartModalDisplay();
                return;
            }

            const allItems = [...giftCart, ...cakeCart, ...giftboxCart];
            const item = allItems[index];

            if (item.type === 'giftbox') {
                const originalItem = giftboxCart.find(i => i.id === item.id);
                if (originalItem) {
                    originalItem.quantity = qty;
                    updateCartDisplay();
                }
            } else {
                const cart = item.category === '伴手禮' ? giftCart : cakeCart;
                const originalItem = cart.find(i => i.productId === item.productId);
                if (originalItem) {
                    originalItem.quantity = qty;
                    updateCartDisplay();
                }
            }
        }

        function addToCartFromModal() {
            if (!currentModalProduct) return;

            const addBtn = window.event?.currentTarget || window.event?.target;
            setButtonLoading(addBtn, true, '加入中...');

            const quantity = parseInt(document.getElementById('modalQuantity').value);
                const useSpecialPrice = document.getElementById('useSpecialPrice').checked;
                const specialPrice = parseFloat(document.getElementById('specialPriceInput').value) || 0;
                
                // 決定使用的價格
                let finalPrice = getEffectivePrice(currentModalProduct);
                let isSpecialPrice = false;

                if (useSpecialPrice && specialPrice > 0) {
                    finalPrice = specialPrice;
                    isSpecialPrice = true;
                }

                const cart = currentModalProduct.category === '伴手禮' ? giftCart : cakeCart;
                const existing = cart.find(i => i.productId === currentModalProduct.productId);

                const cartItem = {
                    ...currentModalProduct,
                    price: finalPrice,
                    originalPrice: currentModalProduct.price,
                    isSpecialPrice: isSpecialPrice,
                    isCompanyPrice: !isSpecialPrice && isCompanyCustomer,
                    quantity: existing ? existing.quantity + quantity : quantity
                };
                
                if (existing) {
                    // 更新現有項目
                    existing.quantity += quantity;
                    existing.price = finalPrice;
                    existing.originalPrice = currentModalProduct.price;
                    existing.isSpecialPrice = isSpecialPrice;
                } else {
                    cart.push(cartItem);
                }
                
                updateCartDisplay();
                const priceText = isSpecialPrice ? `特價 NT$ ${finalPrice}` : `NT$ ${finalPrice}`;
                showAlert(`已將 ${quantity} 個 ${currentModalProduct.productName} (${priceText}) 加入購物車`, 'success');
                
                // 如果使用特價，更新特價到資料庫
                if (useSpecialPrice && specialPrice > 0) {
                    updateProductSpecialPrice(currentModalProduct.productId, specialPrice);
                }
                
                setButtonLoading(addBtn, false);
            closeProductModal();
        }

        function toggleCartModal() {
            const cartModal = document.getElementById('cartModal');
            const cartOverlay = document.getElementById('cartOverlay');

            cartModal.classList.toggle('active');
            cartOverlay.classList.toggle('active');

            if (cartModal.classList.contains('active')) {
                updateCartModalDisplay();
                setTimeout(() => initializeModalCloseHandlers(), 50);
            }
        }
        function closeCartModal() {
            document.getElementById('cartModal').classList.remove('active');
            document.getElementById('cartOverlay').classList.remove('active');
        }

        function updateCartDisplay() {
            const allItems = [...giftCart, ...cakeCart, ...giftboxCart];
            const totalCount = allItems.reduce((sum, item) => sum + item.quantity, 0);
            
            // 使用新的計算邏輯，包含運費
            const orderTotals = updateOrderTotal();
            
            const cartCountEl = document.getElementById('cartCount');
            cartCountEl.textContent = totalCount;
            cartCountEl.style.display = totalCount > 0 ? 'flex' : 'none';

            // 動態調整字體大小：兩位數時使用較小字體
            if (totalCount >= 10) {
                cartCountEl.classList.add('two-digits');
            } else {
                cartCountEl.classList.remove('two-digits');
            }

            // 顯示總金額（包含運費）
            document.getElementById('cartTotalAmount').textContent = orderTotals.totalAmount;

            // 更新建立訂單按鈕：不使用 disabled（disabled 不會觸發 click，無法提示缺少什麼），
            // 改用樣式 class 標記，點擊時由 submitOrder 顯示具體原因
            const checkoutBtn = document.getElementById('checkoutBtn');
            const notReady = totalCount === 0 || !currentCustomer.name || (!currentCustomer.contactValue && !currentCustomer.phone) || !currentDeliveryDate || !navigator.onLine || document.body.dataset.shopRole === 'viewer';
            checkoutBtn.classList.toggle('checkout-not-ready', notReady);

            // 根據是否為編輯模式更新按鈕文字
            if (isEditingOrder) {
                checkoutBtn.textContent = '更新訂單';
            } else {
                checkoutBtn.textContent = '建立訂單';
            }

            updateCartModalDisplay();
            scheduleDraftSave();
        }

        // 生成禮盒細項顯示的輔助函數
        function generateGiftboxDetailsHtml(giftboxItem) {
            if (!giftboxItem.products || Object.keys(giftboxItem.products).length === 0) {
                return '';
            }
            
            const detailItems = [];
            for (const [productId, quantity] of Object.entries(giftboxItem.products)) {
                const product = allProducts.find(p => p.productId === productId);
                if (product && quantity > 0) {
                    detailItems.push(`${product.productName} × ${quantity}`);
                }
            }
            
            if (detailItems.length === 0) {
                return '';
            }
            
            return `
                <div class="giftbox-details">
                    <div class="giftbox-details-content">
                        ${detailItems.join(' | ')}
                    </div>
                </div>
            `;
        }

        function updateCartModalDisplay() {
            const allItems = [...giftCart, ...cakeCart, ...giftboxCart];
            const cartBody = document.getElementById('cartModalBody');
            if (allItems.length === 0) {
                cartBody.innerHTML = '<p style="text-align: center;">購物車是空的</p>';
                return;
            }
            cartBody.innerHTML = allItems.map((item, index) => {
                if (item.type === 'giftbox') {
                    // 處理禮盒特價顯示
                    let priceHtml;
                    if (item.isSpecialPrice && item.originalPrice) {
                        priceHtml = `<span class="original">NT$ ${item.originalPrice}</span>NT$ ${item.price}`;
                    } else {
                        priceHtml = `NT$ ${item.price}`;
                    }

                    // 生成禮盒細項
                    const giftboxDetails = generateGiftboxDetailsHtml(item);

                    return `
                        <div class="cart-item-card">
                            <div class="cart-item-header">
                                <div class="cart-item-icon giftbox">
                                    <i class="fas fa-box-open"></i>
                                </div>
                                <div class="cart-item-details">
                                    <div class="cart-item-name">${item.name}</div>
                                    <div class="cart-item-price">${priceHtml}</div>
                                </div>
                            </div>
                            <div class="cart-item-controls">
                                <div class="cart-qty-group">
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${index}, -1)">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <div class="cart-qty-value">${item.quantity}</div>
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${index}, 1)">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                                <button class="cart-edit-btn" onclick="event.stopPropagation(); editGiftboxItem(${index})" title="編輯禮盒內容">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="cart-delete-btn" onclick="event.stopPropagation(); removeFromCartModal(${index})">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            ${giftboxDetails ? `<div class="cart-giftbox-details">${giftboxDetails.replace(/<[^>]*>/g, '')}</div>` : ''}
                            ${item.notes ? `<div class="cart-giftbox-notes">${item.notes}</div>` : ''}
                        </div>`;
                } else {
                    // 判斷類別圖示
                    const iconClass = item.category === '伴手禮' ? 'gift' : 'cake';
                    const iconName = item.category === '伴手禮' ? 'fa-cookie-bite' : 'fa-birthday-cake';

                    // 構建價格顯示
                    let priceHtml = `NT$ ${item.price}`;
                    if (item.isSpecialPrice && item.originalPrice !== item.price) {
                        priceHtml = `<span class="original">NT$ ${item.originalPrice}</span>NT$ ${item.price}`;
                    } else if (item.isCompanyPrice) {
                        priceHtml = `NT$ ${item.price}<span class="company-price-tag">企業價</span>`;
                    }

                    return `
                        <div class="cart-item-card">
                            <div class="cart-item-header">
                                <div class="cart-item-icon ${iconClass}">
                                    <i class="fas ${iconName}"></i>
                                </div>
                                <div class="cart-item-details">
                                    <div class="cart-item-name">${item.productName}</div>
                                    <div class="cart-item-price">${priceHtml}</div>
                                </div>
                            </div>
                            <div class="cart-item-controls">
                                <div class="cart-qty-group">
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${index}, -1)">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <div class="cart-qty-value">${item.quantity}</div>
                                    <button class="cart-qty-btn" onclick="event.stopPropagation(); updateCartItemQuantity(${index}, 1)">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                                <button class="cart-delete-btn" onclick="event.stopPropagation(); removeFromCartModal(${index})">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>`;
                }
            }).join('');
        }

        function updateCartItemQuantity(index, change) {
            const allItems = [...giftCart, ...cakeCart, ...giftboxCart];
            const item = allItems[index];
            if (!item) return;

            if (item.type === 'giftbox') {
                const originalItem = giftboxCart.find(i => i.id === item.id);
                if (originalItem) {
                    originalItem.quantity += change;
                    if (originalItem.quantity < 1) removeFromCartModal(index);
                    else updateCartDisplay();
                }
            } else {
                const cart = item.category === '伴手禮' ? giftCart : cakeCart;
                const originalItem = cart.find(i => i.productId === item.productId);
                if (originalItem) {
                    originalItem.quantity += change;
                    if (originalItem.quantity < 1) removeFromCartModal(index);
                    else updateCartDisplay();
                }
            }
        }

        function removeFromCartModal(index) {
            const allItems = [...giftCart, ...cakeCart, ...giftboxCart];
            const item = allItems[index];
            if (!item) return;

            if (item.type === 'giftbox') giftboxCart = giftboxCart.filter(i => i.id !== item.id);
            else if (item.category === '伴手禮') giftCart = giftCart.filter(i => i.productId !== item.productId);
            else cakeCart = cakeCart.filter(i => i.productId !== item.productId);
            updateCartDisplay();
        }

        function submitOrder() {
            const checkoutBtn = document.getElementById('checkoutBtn');

            // 防止重複送出（後端處理需時，使用者可能連按多次）
            if (isSubmittingOrder) {
                showAlert('訂單處理中，請勿重複送出', 'warning');
                return;
            }

            if (checkoutBtn.classList.contains('checkout-not-ready')) {
                if (!currentCustomer.name || (!currentCustomer.contactValue && !currentCustomer.phone)) {
                    showAlert('請先儲存客戶資訊', 'error');
                } else if (!navigator.onLine) {
                    showAlert('目前離線，草稿已保存；恢復連線後才能送出訂單', 'error');
                } else if (document.body.dataset.shopRole === 'viewer') {
                    showAlert('僅檢視成員不能建立或修改訂單', 'error');
                } else if (!currentDeliveryDate) {
                    showAlert('請先設定交貨日期', 'error');
                } else {
                    showAlert('購物車是空的', 'error');
                }
                return;
            }

            beginOrderSubmit();

            // 計算總金額包含運費（讀取 hidden input，配合新版 grove 按鈕）
            const orderTotals = updateOrderTotal();
            const isPickupOrder = document.getElementById('deliveryTypeValue').value === '自取';
            const shippingNotes = isPickupOrder ? '' :
                                 (document.getElementById('shippingOption').value === 'free' ? '免運' :
                                 (orderTotals.shippingFee > 0 ? `運費 NT$ ${orderTotals.shippingFee}` : ''));

            // 收集收件人資訊
            const recipientName = document.getElementById('recipientName').value.trim();
            const recipientPhone = document.getElementById('recipientPhone').value.trim();

            // 將收件人資訊加入客戶資料
            const customerData = {
                ...currentCustomer,
                recipientName: recipientName,
                recipientPhone: recipientPhone
            };

            const orderData = {
                clientRequestId: currentOrderRequestId,
                customer: customerData,
                deliveryDate: currentDeliveryDate,
                items: [...giftCart, ...cakeCart, ...giftboxCart],
                totalAmount: orderTotals.totalAmount,
                shippingFee: orderTotals.shippingFee,
                shippingNotes: shippingNotes,
                isCompanyCustomer: isCompanyCustomer
            };

            // 先檢查產能再送出
            checkCapacityAndSubmit(orderData);
        }

        function handleOrderUpdated(result) {
            let alertMessage = `訂單 ${result.orderId} 更新成功!`;
            
            // 如果有付款變更資訊，顯示詳細信息
            if (result.paymentChange) {
                const pc = result.paymentChange;
                alertMessage += `\n\n付款狀態變更：`;
                alertMessage += `\n原金額：NT$ ${pc.originalTotal} → 新金額：NT$ ${pc.newTotal}`;
                alertMessage += `\n原狀態：${pc.originalStatus} → 新狀態：${pc.newStatus}`;
                
                if (pc.remainingAmount > 0) {
                    alertMessage += `\n剩餘金額：NT$ ${pc.remainingAmount}`;
                } else if (pc.paymentNotes && pc.paymentNotes.includes('退款')) {
                    alertMessage += `\n${pc.paymentNotes.split(';').pop().trim()}`;
                }
            }
            
            showAlert(alertMessage, 'success');
            closeCartModal();
            resetOrderForm();
            showSectionById('search');
        }

        function clearEditingState() {
            isEditingOrder = false;
            editingOrderId = null;
            clearCustomerForm();
            currentDeliveryDate = '';
            giftCart = [];
            cakeCart = [];
            giftboxCart = [];
            updateCartDisplay();
        }

        function editOrder(orderId) {
            google.script.run
                .withSuccessHandler(function(orderDetails) {
                    loadOrderForEditing(orderDetails);
                })
                .withFailureHandler(function(error) {
                    handleError(error);
                })
                .getOrderDetails(orderId);
        }

        function loadOrderForEditing(orderDetails) {
            // 設定編輯模式
            isEditingOrder = true;
            editingOrderId = orderDetails.orderId;

            // 清空現有購物車
            giftCart = [];
            cakeCart = [];
            giftboxCart = [];

            // 載入客戶資訊
            // 還原企業客戶狀態
            isCompanyCustomer = !!orderDetails.isCompanyCustomer;
            if (isCompanyCustomer) {
                document.getElementById('customerCompany').classList.add('active');
                document.getElementById('customerNormal').classList.remove('active');
            } else {
                document.getElementById('customerNormal').classList.add('active');
                document.getElementById('customerCompany').classList.remove('active');
            }

            currentCustomer = {
                name: orderDetails.customerName,
                contactType: orderDetails.customerContactType || (orderDetails.customerLineId ? 'line' : 'phone'),
                contactValue: orderDetails.customerContactValue || orderDetails.customerLineId || orderDetails.customerPhone || '',
                phone: orderDetails.customerPhone || '',
                lineId: orderDetails.customerLineId || '',
                address: orderDetails.customerAddress || '',
                recipientName: orderDetails.recipientName || '',
                recipientPhone: orderDetails.recipientPhone || '',
                deliveryType: orderDetails.deliveryType || '外送',
                isCompanyCustomer: isCompanyCustomer
            };
            // 拆分姓名與稱謂
            let loadedName = currentCustomer.name || '';
            document.querySelectorAll('#nameTitleGroup .name-title-btn').forEach(b => b.classList.remove('active'));
            if (loadedName.endsWith('先生') || loadedName.endsWith('小姐')) {
                const title = loadedName.slice(-2);
                loadedName = loadedName.slice(0, -2);
                const btn = document.querySelector(`#nameTitleGroup .name-title-btn[data-title="${title}"]`);
                if (btn) btn.classList.add('active');
            }
            document.getElementById('customerName').value = loadedName;
            selectContactMethod(currentCustomer.contactType, false);
            document.getElementById('customerPhone').value = currentCustomer.contactType === 'line' ? 'LINE' : currentCustomer.contactValue;
            document.getElementById('customerAddress').value = currentCustomer.address;
            document.getElementById('recipientName').value = currentCustomer.recipientName;
            document.getElementById('recipientPhone').value = currentCustomer.recipientPhone;
            
            // 設定配送方式（同步 grove 按鈕與 hidden input，並套用欄位顯示邏輯）
            const deliveryType = orderDetails.deliveryType || '外送';
            const deliveryBtnMap = { '外送': 'deliveryHome', '寄貨': 'deliveryShipping', '自取': 'deliveryPickup' };
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
            currentDeliveryDate = orderDetails.deliveryDate;
            
            // 處理日期格式 - 確保正確顯示
            if (currentDeliveryDate) {
                try {
                    let dateValue;
                    if (currentDeliveryDate instanceof Date) {
                        dateValue = currentDeliveryDate.toISOString().split('T')[0];
                    } else if (typeof currentDeliveryDate === 'string') {
                        const parsedDate = new Date(currentDeliveryDate);
                        if (!isNaN(parsedDate.getTime())) {
                            dateValue = parsedDate.toISOString().split('T')[0];
                        } else {
                            dateValue = currentDeliveryDate;
                        }
                    } else {
                        dateValue = currentDeliveryDate;
                    }
                    document.getElementById('deliveryDate').value = dateValue;
                } catch (error) {
                    console.log('日期格式轉換錯誤:', error);
                    document.getElementById('deliveryDate').value = currentDeliveryDate;
                }
            }

            // 載入訂單項目到購物車
            orderDetails.items.forEach(item => {
                if (item.isGiftBox && item.giftBoxDetails) {
                    // 禮盒項目 - 修復數量計算問題
                    const giftboxItem = {
                        type: 'giftbox',
                        id: generateUniqueId('GB'),
                        name: item.productName,
                        size: Object.values(item.giftBoxDetails.products || {}).reduce((sum, qty) => sum + parseInt(qty || 0), 0),
                        products: item.giftBoxDetails.products || {},
                        price: parseFloat(item.unitPrice) || 0,
                        quantity: parseInt(item.quantity) || 1 // 確保數量為整數
                    };
                    giftboxCart.push(giftboxItem);
                } else {
                    // 一般商品項目 - 優化產品匹配邏輯
                    let product = allProducts.find(p => p.productId === item.productId);
                    if (!product) {
                        // 如果找不到產品ID，嘗試用名稱匹配
                        product = allProducts.find(p => p.productName === item.productName);
                    }
                    
                    if (product) {
                        const cartItem = {
                            ...product,
                            quantity: parseInt(item.quantity) || 1, // 確保數量為整數
                            price: parseFloat(item.unitPrice) || product.price, // 使用訂單中的實際價格
                            originalPrice: item.originalPrice || product.price, // 使用訂單中記錄的原價
                            isSpecialPrice: item.isSpecialPrice || false // 使用訂單中記錄的特價狀態
                        };
                        if (product.category === '伴手禮') {
                            giftCart.push(cartItem);
                        } else if (product.category === '喜餅') {
                            cakeCart.push(cartItem);
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
                            giftBoxEnabled: '是'
                        };
                        giftCart.push(tempProduct);
                    }
                }
            });

            // 確保購物車顯示正確更新
            updateCartDisplay();
            showAlert(`已載入訂單 ${orderDetails.orderId} 進行編輯`, 'success');
            showSectionById('customer');
        }

        function updateOrderStatus(orderId, newStatus) {
            // 由按鈕觸發時顯示按鈕載入狀態；由滑動元件觸發時 event.target 不是按鈕
            const updateBtn = window.event?.currentTarget?.tagName === 'BUTTON' ? window.event.currentTarget : null;
            if (updateBtn) setButtonLoading(updateBtn, true, '更新中...');

            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function(result) {
                        if (updateBtn) setButtonLoading(updateBtn, false);
                        showAlert(`訂單狀態已更新為: ${newStatus}`, 'success');

                        // 即時更新頁面上的訂單狀態顯示
                        refreshOrderDisplays(orderId, newStatus);
                    })
                    .withFailureHandler(function(error) {
                        if (updateBtn) setButtonLoading(updateBtn, false);
                        handleError(error);
                    })
                    .updateOrderStatus(orderId, newStatus);
            } else {
                if (updateBtn) setButtonLoading(updateBtn, false);
                showAlert('尚未連接 Firebase，無法更新訂單', 'error');
            }
        }

        // 新增函數：即時更新頁面上的訂單狀態顯示
        function refreshOrderDisplays(orderId, newStatus) {
            const cachedOrder = currentSearchOrders.find(order => (order.id || order.orderId) === orderId);
            if (cachedOrder) cachedOrder.status = newStatus;

            // 更新搜尋結果表格中的狀態標籤
            const searchResults = document.getElementById('searchResults');
            if (searchResults) {
                searchResults.querySelectorAll('tbody tr').forEach(row => {
                    const detailBtn = row.querySelector(`button[data-oid="${orderId}"]`);
                    if (detailBtn) {
                        const pill = row.querySelector('.status-pill');
                        if (pill) {
                            pill.textContent = newStatus;
                            pill.className = 'status-pill ' + getStatusPillClass(newStatus);
                        }
                    }
                });
            }

            // 如果有打開的訂單詳情modal，也要更新
            const orderDetailModals = document.querySelectorAll('.modal.active');
            orderDetailModals.forEach(modal => {
                const modalContent = modal.textContent;
                if (modalContent.includes(orderId)) {
                    // 更新modal中的狀態標籤
                    modal.querySelectorAll('.order-info-item').forEach(item => {
                        const label = item.querySelector('.order-info-label');
                        const pill = item.querySelector('.status-pill');
                        if (label && pill && label.textContent.includes('訂單狀態')) {
                            pill.textContent = newStatus;
                            pill.className = 'status-pill ' + getStatusPillClass(newStatus);
                        }
                    });

                    // 更新modal中的按鈕狀態
                    const modalFooter = modal.querySelector('.modal-footer');
                    if (modalFooter) {
                        updateModalButtons(modalFooter, orderId, newStatus);
                    }
                }
            });
        }

        // 根據狀態返回對應的圓角標籤樣式 class
        function getStatusPillClass(status) {
            switch (status) {
                case '已確認': return 'pill-blue';
                case '已付訂金': return 'pill-amber';
                case '已付清': return 'pill-green';
                case '已付款': return 'pill-green'; // 向下相容
                case '完成': return 'pill-deep-green';
                case '取消': return 'pill-red';
                default: return 'pill-gray';
            }
        }

        // 新增函數：更新modal中的按鈕
        function updateModalButtons(modalFooter, orderId, newStatus) {
            // 移除舊的狀態按鈕
            const existingButtons = modalFooter.querySelectorAll('.btn-success');
            existingButtons.forEach(btn => {
                if (btn.textContent.includes('已付款') || btn.textContent.includes('完成')) {
                    btn.remove();
                }
            });

            // 根據新狀態添加對應按鈕
            const editBtn = modalFooter.querySelector('button[onclick*="editOrder"]');
            if (editBtn && newStatus !== '已付款' && newStatus !== '完成') {
                if (newStatus !== '已付款') {
                    const paymentBtn = document.createElement('button');
                    paymentBtn.className = 'btn btn-success';
                    paymentBtn.textContent = '已付款';
                    paymentBtn.onclick = function() {
                        updateOrderStatus(orderId, '已付款');
                        this.closest('.modal').remove();
                    };
                    modalFooter.insertBefore(paymentBtn, editBtn.nextSibling);
                }
            }

            if (newStatus !== '完成') {
                const completeBtn = document.createElement('button');
                completeBtn.className = 'btn btn-success';
                completeBtn.textContent = '完成';
                completeBtn.onclick = function() {
                    updateOrderStatus(orderId, '完成');
                    this.closest('.modal').remove();
                };
                modalFooter.insertBefore(completeBtn, modalFooter.lastElementChild);
            }
        }

        function handleOrderSubmitted(result) {
            const orderId = result && result.orderId ? result.orderId : '';

            // 先關購物車並清空所有暫存資料，避免使用者以為沒送出而重複建立
            closeCartModal();
            resetOrderForm();

            // 回到客戶資訊頁，可直接建立下一筆
            showSectionById('customer');
            showAlert(`訂單 ${orderId} 建立成功!`, 'success', 5000);
        }

        /**
         * 送單成功後的完整重置：客戶、收件人、配送、運費、交貨日期、日曆、購物車
         */
        function resetOrderForm() {
            try {
                clearEditingState();

                // 交貨日期（隱藏原生 input + 自訂日曆）
                currentDeliveryDate = '';
                const deliveryDateInput = document.getElementById('deliveryDate');
                if (deliveryDateInput) deliveryDateInput.value = '';

                calendarState.selectedDateStr = null;
                calendarState.currYear = new Date().getFullYear();
                calendarState.currMonth = new Date().getMonth();
                if (typeof renderCalendar === 'function') renderCalendar();

                const dateDisplay = document.getElementById('selected-date-display');
                if (dateDisplay) dateDisplay.textContent = '目前尚未選擇日期';

                const confirmDateBtn = document.getElementById('btn-confirm-date');
                if (confirmDateBtn) {
                    confirmDateBtn.disabled = true;
                    confirmDateBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'shadow-lg');
                    confirmDateBtn.classList.add('bg-gray-300', 'cursor-not-allowed');
                    confirmDateBtn.innerHTML = '請先選擇日期';
                }

                // 禮盒暫存狀態
                currentGiftboxSize = 0;
                giftboxSelection = {};
                currentGiftboxCombo = null;
                editingGiftboxIndex = -1;
                currentOrderRequestId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : generateUniqueId('REQ');

                updateCartDisplay();
                clearOrderDraft();
            } catch (e) {
                console.error('重置訂單表單失敗:', e);
                showAlert('訂單已建立，但表單重置失敗，請重新整理頁面', 'warning');
            }
        }

        function searchOrders() {
            const searchBtn = document.querySelector('.btn-search');
            const rawContact = document.getElementById('searchPhone').value.trim();
            const criteria = {
                contact: rawContact,
                contactType: document.getElementById('searchContactType')?.value || 'phone',
                name: document.getElementById('searchName').value.trim(),
                date: document.getElementById('searchDate').value,
                status: document.getElementById('searchStatus')?.value || '',
                pageSize: 30,
                cursor: null,
                paginated: true,
            };
            if (!criteria.contact && !criteria.name && !criteria.date && !criteria.status) {
                showAlert('請至少提供一個搜尋條件', 'error');
                return;
            }
            lastSearchCriteria = criteria;
            searchNextCursor = null;
            setButtonLoading(searchBtn, true, '搜尋中...');
            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function(result) {
                        setButtonLoading(searchBtn, false);
                        const page = Array.isArray(result) ? { orders: result, pagination: {} } : result;
                        searchNextCursor = page?.pagination?.nextCursor || null;
                        handleSearchResults(page?.orders || []);
                    })
                    .withFailureHandler(function(error) {
                        setButtonLoading(searchBtn, false);
                        renderSearchError(error);
                    })
                    .searchOrders(criteria);
            } else {
                setButtonLoading(searchBtn, false);
                renderSearchError(new Error('尚未連接 Firebase'));
            }
        }

        function renderSearchError(error) {
            document.getElementById('searchResults').innerHTML = `<div class="search-error" role="alert"><i class="fas fa-wifi"></i><strong>無法取得訂單</strong><span>${escapeHtml(error?.message || '請檢查連線後重試')}</span><button type="button" onclick="searchOrders()">重新搜尋</button></div>`;
        }

        function loadMoreOrders() {
            if (!lastSearchCriteria || !searchNextCursor || isLoadingMoreOrders) return;
            isLoadingMoreOrders = true;
            const button = document.getElementById('searchLoadMore');
            if (button) setButtonLoading(button, true, '載入中...');
            google.script.run
                .withSuccessHandler(function(result) {
                    isLoadingMoreOrders = false;
                    const page = Array.isArray(result) ? { orders: result, pagination: {} } : result;
                    searchNextCursor = page?.pagination?.nextCursor || null;
                    currentSearchOrders = currentSearchOrders.concat(page?.orders || []);
                    displayOrderTable(currentSearchOrders, 'searchResults', 'search');
                })
                .withFailureHandler(function(error) {
                    isLoadingMoreOrders = false;
                    if (button) setButtonLoading(button, false);
                    showAlert(error?.message || '載入下一頁失敗', 'error');
                })
                .searchOrders({ ...lastSearchCriteria, cursor: searchNextCursor });
        }

        function handleSearchResults(orders) {
            displayOrderTable(orders, 'searchResults', 'search');
        }

        function displayOrderTable(orders, containerId, type = 'search') {
            const container = document.getElementById(containerId);
            currentOrderTableType = type;

            if (type === 'search') {
                currentSearchOrders = orders || [];
                const stillExists = currentSearchOrders.some(order => (order.id || order.orderId) === expandedSearchOrderId);
                if (!stillExists) expandedSearchOrderId = null;
                const collapsingStillExists = currentSearchOrders.some(order => (order.id || order.orderId) === collapsingSearchOrderId);
                if (!collapsingStillExists) collapsingSearchOrderId = null;
            }

            if (!orders || orders.length === 0) {
                const message = type === 'overdue' ?
                    '<div class="result-banner success"><i class="fas fa-check-circle"></i><span>目前沒有過期未完成的訂單</span></div>' :
                    '<div class="result-banner neutral"><i class="fas fa-inbox"></i><span>未找到符合條件的訂單</span></div>';
                container.innerHTML = message;
                return;
            }

            // 根據類型設定標題和警告
            let headerContent = '';
            if (type === 'overdue') {
                headerContent = `
                    <div class="result-banner danger"><i class="fas fa-exclamation-triangle"></i><span>發現 ${orders.length} 筆過期未完成的訂單</span></div>
                    <h3 class="result-title">過期未完成訂單 (${orders.length} 筆)</h3>`;
            } else {
                headerContent = `<h3 class="result-title">搜尋結果 (${orders.length} 筆)</h3>`;
            }

            // 動態生成表頭
            let tableHeaders = '<th>姓名</th><th>聯絡方式</th><th>交貨日</th>';
            if (type === 'overdue') {
                tableHeaders += '<th>逾期天數</th>';
            }
            tableHeaders += '<th>運費</th><th>總金額</th><th>已付訂金</th><th>剩餘金額</th><th>狀態</th><th>操作</th>';

            // 生成表格內容
            const tableRows = orders.map(order => {
                const isOverdue = type === 'overdue';
                let overdueDays = 0;
                const rowClasses = [];

                if (isOverdue) {
                    const deliveryDate = new Date(order.deliveryDate);
                    const today = new Date();
                    overdueDays = Math.floor((today - deliveryDate) / (1000 * 60 * 60 * 24));
                    rowClasses.push(overdueDays > 7 ? 'row-overdue-severe' : 'row-overdue-mild');
                }

                const contactType = order.customerContactType || (order.customerLineId ? 'line' : 'phone');
                const contactValue = order.customerContactValue || order.customerLineId || order.customerPhone || '-';
                const contactDisplay = contactType === 'line' ? 'LINE' : contactValue;
                let cells = `
                    <td data-label="姓名">${escapeHtml(order.customerName)}</td>
                    <td data-label="聯絡方式">${escapeHtml(contactDisplay)}</td>
                    <td data-label="交貨日">${formatDisplayDate(order.deliveryDate)}</td>`;

                if (isOverdue) {
                    cells += `
                        <td style="text-align: center;">
                            <span class="overdue-badge ${overdueDays > 7 ? 'severe' : 'mild'}">${overdueDays} 天</span>
                        </td>`;
                }

                const orderId = order.id || order.orderId;
                const depositAmount = order.depositAmount || 0;
                const remainingAmount = order.remainingAmount || order.totalAmount;
                const canExpandItems = type === 'search' && Array.isArray(order.items);
                const isExpanded = canExpandItems && expandedSearchOrderId === orderId;
                const isCollapsing = canExpandItems && collapsingSearchOrderId === orderId;
                if (canExpandItems) rowClasses.push('order-summary-row');
                if (isExpanded) rowClasses.push('is-expanded');

                // 運費顯示
                const hasFee = order.shippingFee > 0;
                const shippingFeeDisplay = hasFee ? `NT$ ${order.shippingFee}` :
                                         (order.shippingNotes === '免運' || order.deliveryType === '自取') ? '免運' : '-';

                cells += `
                    <td data-label="運費" class="td-fee${hasFee ? ' has-fee' : ''}">${shippingFeeDisplay}</td>
                    <td data-label="總金額" class="td-amount">NT$ ${order.totalAmount}</td>
                    <td data-label="已付訂金" class="td-deposit${depositAmount > 0 ? ' paid' : ''}">NT$ ${depositAmount}</td>
                    <td data-label="剩餘金額" class="td-remaining ${remainingAmount > 0 ? 'due' : 'clear'}">NT$ ${remainingAmount}</td>
                    <td data-label="狀態"><span class="status-pill ${getStatusPillClass(order.status)}">${escapeHtml(order.status)}</span></td>
                    <td data-label="操作">
                        <button class="btn-table btn-table-view" data-oid="${escapeAttr(orderId)}" onclick="event.stopPropagation(); viewOrderDetails(this.dataset.oid)">詳情</button>
                        ${document.body.dataset.shopRole === 'viewer' ? '' : `<button class="btn-table btn-table-delete requires-editor" data-oid="${escapeAttr(orderId)}" data-cname="${escapeAttr(order.customerName)}" onclick="event.stopPropagation(); showDeleteConfirm(this.dataset.oid, this.dataset.cname)">刪除</button>`}
                    </td>`;

                const rowClassAttr = rowClasses.length ? ` class="${rowClasses.join(' ')}"` : '';
                const rowClickAttr = canExpandItems ? ` onclick="toggleOrderItems('${escapeAttr(orderId)}')"` : '';
                const expandedItemsRow = (isExpanded || isCollapsing)
                    ? renderExpandedOrderItems(order.items, tableHeaders.split('</th>').length - 1, isCollapsing)
                    : '';

                return `<tr${rowClassAttr}${rowClickAttr}>${cells}</tr>${expandedItemsRow}`;
            }).join('');

            container.innerHTML = `
                ${headerContent}
                <div class="table-responsive">
                    <table class="table">
                        <thead><tr>${tableHeaders}</tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                ${type === 'search' && searchNextCursor ? '<div class="search-pagination"><button id="searchLoadMore" type="button" onclick="loadMoreOrders()">載入更多訂單</button></div>' : ''}`;
        }

        function toggleOrderItems(orderId) {
            if (orderItemsTransitionTimer) return;

            const nextOrderId = expandedSearchOrderId === orderId ? null : orderId;
            if (!expandedSearchOrderId) {
                expandedSearchOrderId = nextOrderId;
                displayOrderTable(currentSearchOrders, 'searchResults', 'search');
                return;
            }

            collapsingSearchOrderId = expandedSearchOrderId;
            expandedSearchOrderId = null;
            displayOrderTable(currentSearchOrders, 'searchResults', 'search');

            orderItemsTransitionTimer = setTimeout(function() {
                collapsingSearchOrderId = null;
                expandedSearchOrderId = nextOrderId;
                orderItemsTransitionTimer = null;
                displayOrderTable(currentSearchOrders, 'searchResults', 'search');
            }, 500);
        }

        function renderExpandedOrderItems(items, columnCount, isCollapsing = false) {
            const collapsingClass = isCollapsing ? ' is-collapsing' : '';
            if (!items || items.length === 0) {
                return `<tr class="order-items-row${collapsingClass}"><td colspan="${columnCount}"><div class="order-items-expand"><div class="order-items-empty">此訂單沒有商品明細</div></div></td></tr>`;
            }

            let itemsHtml = '';
            items.forEach(item => {
                if (item.isGiftBox && item.giftBoxDetails) {
                    itemsHtml += `
                        <tr class="giftbox-row">
                            <td colspan="4"><strong>${escapeHtml(item.productName)} x ${item.quantity}</strong></td>
                        </tr>`;

                    Object.entries(item.giftBoxDetails.products || {}).forEach(([productId, qty]) => {
                        const product = allProducts.find(p => p.productId === productId);
                        const productName = product ? product.productName : `商品ID: ${productId}`;
                        const totalQty = (parseInt(qty) || 0) * (parseInt(item.quantity) || 1);
                        itemsHtml += `
                            <tr class="giftbox-subitem-row">
                                <td>└ ${escapeHtml(productName)}</td>
                                <td>${totalQty}</td>
                                <td>-</td>
                                <td>-</td>
                            </tr>`;
                    });

                    if (item.giftBoxDetails.notes) {
                        itemsHtml += `
                            <tr class="giftbox-note-row">
                                <td colspan="4">備註: ${escapeHtml(item.giftBoxDetails.notes)}</td>
                            </tr>`;
                    }

                    let giftboxPriceDisplay = `NT$ ${item.unitPrice}`;
                    if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
                        giftboxPriceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span><br><span class="special-price-text">特價 NT$ ${item.unitPrice}</span>`;
                    }

                    itemsHtml += `
                        <tr class="giftbox-subtotal-row">
                            <td>禮盒小計</td>
                            <td>-</td>
                            <td>${giftboxPriceDisplay}</td>
                            <td>NT$ ${item.subtotal}</td>
                        </tr>`;
                } else {
                    let priceDisplay = `NT$ ${item.unitPrice}`;
                    if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
                        priceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span> <span class="special-price-text">特價 NT$ ${item.unitPrice}</span>`;
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
                                    <thead><tr><th>商品</th><th>數量</th><th>單價</th><th>小計</th></tr></thead>
                                    <tbody>${itemsHtml}</tbody>
                                </table>
                            </div>
                        </div>
                    </td>
                </tr>`;
        }

        // 新增函數：格式化顯示日期
        function formatDisplayDate(dateValue) {
            try {
                if (!dateValue) return '未設定';
                
                let date;
                if (dateValue instanceof Date) {
                    date = dateValue;
                } else if (typeof dateValue === 'string') {
                    date = new Date(dateValue);
                    if (isNaN(date.getTime())) {
                        return dateValue; // 如果無法解析，返回原始值
                    }
                } else {
                    return dateValue.toString();
                }
                
                // 格式化為 YYYY-MM-DD
                return date.toISOString().split('T')[0];
            } catch (error) {
                console.log('日期格式化錯誤:', error);
                return dateValue.toString();
            }
        }

        function clearSearch() {
            document.getElementById('searchPhone').value = '';
            document.getElementById('searchName').value = '';
            if (searchDatepickerInstance) {
                searchDatepickerInstance.clear();
            } else {
                document.getElementById('searchDate').value = '';
            }
            document.getElementById('searchResults').innerHTML = '';
            const status = document.getElementById('searchStatus');
            if (status) status.value = '';
            const contactType = document.getElementById('searchContactType');
            if (contactType) contactType.value = 'phone';
            document.getElementById('searchPhone').placeholder = '輸入電話號碼';
            searchNextCursor = null;
            lastSearchCriteria = null;
        }

        function searchOverdueOrders() {
            const searchBtn = window.event?.currentTarget || document.querySelector('.btn-overdue');
            setButtonLoading(searchBtn, true, '檢索中...');

            // 檢查是否在 Google Apps Script 環境中
            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function(orders) {
                        setButtonLoading(searchBtn, false);
                        try {
                            handleOverdueResults(orders);
                        } catch (clientError) {
                            console.error('處理過期訂單結果時發生錯誤:', clientError);
                            showAlert('處理過期訂單結果時發生錯誤: ' + clientError.message, 'error');
                        }
                    })
                    .withFailureHandler(function(error) {
                        setButtonLoading(searchBtn, false);
                        handleError(error);
                    })
                    .searchOverdueOrders();
            } else {
                setButtonLoading(searchBtn, false);
                renderSearchError(new Error('尚未連接 Firebase'));
            }
        }

        function handleOverdueResults(orders) {
            // 清空搜尋結果，在同一個表格中顯示過期訂單
            document.getElementById('searchResults').innerHTML = '';
            displayOrderTable(orders, 'searchResults', 'overdue');
        }

        function viewOrderDetails(orderId) {
            const cachedDetails = currentOrderTableType === 'search'
                ? currentSearchOrders.find(order => (order.id || order.orderId) === orderId)
                : null;
            if (cachedDetails && Array.isArray(cachedDetails.items)) {
                handleOrderDetails(cachedDetails);
                return;
            }

            const detailBtn = window.event?.currentTarget || window.event?.target;
            setButtonLoading(detailBtn, true, '載入中...');

            // 檢查是否在 Google Apps Script 環境中
            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function(details) {
                        setButtonLoading(detailBtn, false);
                        handleOrderDetails(details);
                    })
                    .withFailureHandler(function(error) {
                        setButtonLoading(detailBtn, false);
                        handleError(error);
                    })
                    .getOrderDetails(orderId);
            } else {
                setButtonLoading(detailBtn, false);
                showAlert('尚未連接 Firebase，無法讀取訂單明細', 'error');
            }
        }

        function handleOrderDetails(details) {
            const detailModal = document.createElement('div');
            detailModal.className = 'modal active';
            detailModal.setAttribute('role', 'dialog');
            detailModal.setAttribute('aria-modal', 'true');
            // 設定 no-op onclick：避免點背景誤關，也讓 initializeModalCloseHandlers 不套用預設關閉行為
            detailModal.onclick = function() {};

            let itemsHtml = '';
            details.items.forEach(item => {
                if (item.isGiftBox && item.giftBoxDetails) {
                    // 禮盒項目顯示
                    itemsHtml += `
                        <tr style="background-color: #f0f8ff;">
                            <td colspan="4"><strong>${item.productName} x ${item.quantity}</strong></td>
                        </tr>`;

                    // 顯示禮盒內容物
                    for (const [productId, qty] of Object.entries(item.giftBoxDetails.products || {})) {
                        const product = allProducts.find(p => p.productId === productId);
                        const productName = product ? product.productName : `商品ID: ${productId}`;
                        const totalQty = (parseInt(qty) || 0) * (parseInt(item.quantity) || 1);
                        itemsHtml += `
                            <tr style="padding-left: 20px; color: #666; font-size: 0.9em;">
                                <td style="padding-left: 30px;">└ ${productName}</td>
                                <td>${totalQty}</td>
                                <td>-</td>
                                <td>-</td>
                            </tr>`;
                    }

                    // 禮盒備註
                    if (item.giftBoxDetails.notes) {
                        itemsHtml += `
                            <tr style="color: #888; font-style: italic;">
                                <td colspan="4" style="padding-left: 30px;">備註: ${item.giftBoxDetails.notes}</td>
                            </tr>`;
                    }

                    // 禮盒小計
                    let giftboxPriceDisplay = `NT$ ${item.unitPrice}`;
                    if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
                        giftboxPriceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span><br><span class="special-price-text">特價 NT$ ${item.unitPrice}</span>`;
                    }
                    
                    itemsHtml += `
                        <tr style="background-color: #f0f8ff; font-weight: bold;">
                            <td style="padding-left: 30px;">禮盒小計</td>
                            <td>-</td>
                            <td>${giftboxPriceDisplay}</td>
                            <td>NT$ ${item.subtotal}</td>
                        </tr>`;
                } else {
                    // 一般商品項目
                    let priceDisplay = `NT$ ${item.unitPrice}`;
                    if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
                        priceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span> <span class="special-price-text">特價 NT$ ${item.unitPrice}</span>`;
                    }
                    
                    itemsHtml += `
                        <tr>
                            <td>${item.productName}</td>
                            <td>${item.quantity}</td>
                            <td>${priceDisplay}</td>
                            <td>NT$ ${item.subtotal}</td>
                        </tr>`;
                }
            });

            // 建立狀態按鈕的邏輯
            let statusButtons = '';
            
            // 只有在未完成的情況下才顯示完成按鈕
            // 支援所有付款狀態：已確認、已付訂金、已付清、已付款（舊版）
            const canEditOrders = document.body.dataset.shopRole !== 'viewer';
            if (canEditOrders && details.status !== '完成') {
                statusButtons += `<button class="btn btn-success" onclick="showStatusConfirm('${details.orderId}', '完成'); this.closest('.modal').remove();">完成</button>`;
            }

            detailModal.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>訂單詳情 - ${details.orderId}</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="order-info-grid">
                        <div class="order-info-item">
                            <span class="order-info-label">客戶</span>
                            <span class="order-info-value">${escapeHtml(details.customerName)} (${escapeHtml((details.customerContactType === 'line' || details.customerLineId) ? 'LINE' : (details.customerContactValue || details.customerPhone || '-'))})</span>
                        </div>
                        ${(details.recipientName || details.recipientPhone) && details.deliveryType !== '自取' ? `
                        <div class="order-info-item">
                            <span class="order-info-label">收件人</span>
                            <span class="order-info-value">${details.recipientName || '-'} ${details.recipientPhone ? `(${details.recipientPhone})` : ''}</span>
                        </div>` : ''}
                        <div class="order-info-item">
                            <span class="order-info-label">地址</span>
                            <span class="order-info-value">${details.customerAddress || '未提供'}</span>
                        </div>
                        <div class="order-info-item">
                            <span class="order-info-label">配送方式</span>
                            <span class="order-info-value delivery-badge">${details.deliveryType || '外送'}</span>
                        </div>
                        ${details.isCompanyCustomer ? `<div class="order-info-item">
                            <span class="order-info-label">客戶類型</span>
                            <span class="order-info-value" style="color: #4f46e5; font-weight: 600;">企業客戶</span>
                        </div>` : ''}
                        <div class="order-info-item">
                            <span class="order-info-label">交貨日期</span>
                            <span class="order-info-value">${formatDisplayDate(details.deliveryDate)}</span>
                        </div>
                        <div class="order-info-item">
                            <span class="order-info-label">訂單狀態</span>
                            <span class="status-pill ${getStatusPillClass(details.status)}">${escapeHtml(details.status)}</span>
                        </div>
                    </div>

                    <h4>訂單明細</h4>
                    <div class="table-responsive">
                        <table class="table">
                            <thead><tr><th>商品</th><th>數量</th><th>單價</th><th>小計</th></tr></thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>
                    </div>

                    <div class="payment-status-box">
                        <h4>付款狀態</h4>
                        <div class="payment-grid">
                            <div class="payment-item">
                                <span class="payment-label">總金額</span>
                                <span class="payment-value primary">NT$ ${Math.round(details.totalAmount).toLocaleString()}</span>
                            </div>
                            <div class="payment-item">
                                <span class="payment-label">已付訂金</span>
                                <span class="payment-value ${details.depositAmount > 0 ? 'success' : ''}">NT$ ${details.depositAmount || 0}</span>
                            </div>
                            <div class="payment-item">
                                <span class="payment-label">剩餘金額</span>
                                <span class="payment-value ${details.remainingAmount > 0 ? 'danger' : 'success'}">NT$ ${details.remainingAmount || details.totalAmount}</span>
                            </div>
                            ${(details.shippingFee > 0 || details.shippingNotes) ? `
                            <div class="payment-item">
                                <span class="payment-label">運費</span>
                                <span class="payment-value info">${details.shippingFee > 0 ? `NT$ ${details.shippingFee}` : '免運'}</span>
                            </div>` : ''}
                        </div>
                        ${canEditOrders && details.status !== '完成' ? `
                        <div class="deposit-action">
                            <button class="btn btn-deposit" onclick="showDepositModal('${details.orderId}', ${details.totalAmount}, ${details.depositAmount || 0}); this.closest('.modal').remove();">
                                <i class="fas fa-coins"></i> 設定訂金
                            </button>
                        </div>` : ''}
                    </div>

                    <div class="order-total">
                        <span>總計</span>
                        <span class="total-amount">NT$ ${details.totalAmount}</span>
                    </div>
                </div>
                <div class="modal-footer">
                    ${canEditOrders ? `<button class="btn btn-edit requires-editor" onclick="editOrder('${details.orderId}'); this.closest('.modal').remove();"><i class="fas fa-edit"></i> 編輯</button>` : ''}
                    ${statusButtons}
                    <button class="btn btn-close-modal" onclick="this.closest('.modal').remove()">關閉</button>
                </div>
            </div>`;
            document.body.appendChild(detailModal);

            // 確保動態創建的modal有正確的關閉處理器
            setTimeout(() => initializeModalCloseHandlers(), 50);
        }

        // 商品編輯視窗的按鈕群組選擇器（寫入對應 hidden input）
        function selectProductOption(inputId, button) {
            button.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(inputId).value = button.dataset.value;
        }

        // 依 hidden input 的值同步按鈕群組的 active 狀態
        function syncProductOptionButtons(inputId) {
            const value = document.getElementById(inputId).value;
            const group = document.getElementById(inputId + 'Group');
            if (!group) return;
            group.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.value === value));
        }

        function showAddProduct() {
            document.getElementById('productEditModalTitle').textContent = '新增商品';
            document.getElementById('editProductId').value = '';
            document.getElementById('productName').value = '';
            document.getElementById('productPrice').value = '';
            document.getElementById('productSpecialPrice').value = '';
            document.getElementById('productCompanyPrice').value = '';
            document.getElementById('productDescription').value = '';
            document.getElementById('productCategory').value = '伴手禮';
            document.getElementById('productStatus').value = '啟用';
            document.getElementById('productGiftBoxEnabled').value = '是';
            syncProductOptionButtons('productCategory');
            syncProductOptionButtons('productStatus');
            syncProductOptionButtons('productGiftBoxEnabled');
            document.getElementById('productEditModal').classList.add('active');
            // 確保modal有正確的關閉處理器
            setTimeout(() => initializeModalCloseHandlers(), 50);
        }

        function closeProductEditModal() {
            document.getElementById('productEditModal').classList.remove('active');
        }

        function saveProduct() {
            const saveBtn = window.event?.currentTarget || window.event?.target;
            const specialPriceValue = document.getElementById('productSpecialPrice').value.trim();
            const data = {
                productId: document.getElementById('editProductId').value,
                productName: document.getElementById('productName').value.trim(),
                category: document.getElementById('productCategory').value,
                price: parseInt(document.getElementById('productPrice').value),
                status: document.getElementById('productStatus').value,
                description: document.getElementById('productDescription').value.trim(),
                giftBoxEnabled: document.getElementById('productGiftBoxEnabled').value,
                specialPrice: specialPriceValue ? parseInt(specialPriceValue) : '',
                companyPrice: document.getElementById('productCompanyPrice').value.trim() ? parseInt(document.getElementById('productCompanyPrice').value.trim()) : ''
            };
            if (!data.productName || !data.price) {
                showAlert('請填寫商品名稱和價格', 'error');
                return;
            }

            setButtonLoading(saveBtn, true, '儲存中...');

            google.script.run
                .withSuccessHandler(function(result) {
                    setButtonLoading(saveBtn, false);
                    handleProductSaved(result);
                })
                .withFailureHandler(function(error) {
                    setButtonLoading(saveBtn, false);
                    handleError(error);
                })
                .saveProduct(data);
        }

        function handleProductSaved(result) {
            if (result?.product) {
                const index = allProducts.findIndex(p => p.productId === result.product.productId);
                if (index >= 0) allProducts[index] = { ...allProducts[index], ...result.product };
                else allProducts.push(result.product);
                allProducts.sort((a, b) => String(a.productName).localeCompare(String(b.productName), 'zh-TW'));
                renderProductCards();
                updateProductDisplays();
                updateNavVisibility();
            }
            showAlert('商品已儲存', 'success');
            closeProductEditModal();
        }

        function editProduct(productId) {
            const p = allProducts.find(p => p.productId === productId);
            if (!p) return;

            document.getElementById('productEditModalTitle').textContent = '編輯商品';
            document.getElementById('editProductId').value = p.productId;
            document.getElementById('productName').value = p.productName;
            document.getElementById('productCategory').value = p.category;
            document.getElementById('productPrice').value = p.price;
            document.getElementById('productSpecialPrice').value = p.specialPrice || '';
            document.getElementById('productCompanyPrice').value = p.companyPrice || '';
            document.getElementById('productStatus').value = p.status;
            document.getElementById('productDescription').value = p.description || '';
            document.getElementById('productGiftBoxEnabled').value = p.giftBoxEnabled || '是';
            syncProductOptionButtons('productCategory');
            syncProductOptionButtons('productStatus');
            syncProductOptionButtons('productGiftBoxEnabled');
            document.getElementById('productEditModal').classList.add('active');
            // 確保modal有正確的關閉處理器
            setTimeout(() => initializeModalCloseHandlers(), 50);
        }

        function deleteProduct(productId) {
            showConfirmModal('確定要刪除此商品嗎？', () => {
                google.script.run
                    .withSuccessHandler(function() {
                        closeConfirmModal();
                        showAlert('商品已刪除', 'success');
                        allProducts = allProducts.filter(p => p.productId !== productId);
                        renderProductCards();
                        updateProductDisplays();
                        updateNavVisibility();
                    })
                    .withFailureHandler(function(error) {
                        closeConfirmModal();
                        handleError(error);
                    })
                    .deleteProduct(productId);
            });
        }

        // ==========================================
        //        訂單搜尋 日期選擇器
        // ==========================================

        let searchDatepickerInstance = null;

        function initSearchDatepicker() {
            if (searchDatepickerInstance) return;
            const el = document.getElementById('searchDate');
            if (!el) return;
            searchDatepickerInstance = new AirDatepicker(el, {
                locale: demandDateLocaleZh,
                dateFormat: 'yyyy-MM-dd',
                autoClose: true,
                buttons: [
                    {
                        content: '今天',
                        onClick: function(dp) {
                            dp.selectDate(new Date());
                        }
                    },
                    {
                        content: '清除',
                        onClick: function(dp) {
                            dp.clear();
                        }
                    }
                ]
            });
        }

        // ==========================================
        //        營業報表
        // ==========================================

        let reportDatepickerInstance = null;

        function initReportDatepicker() {
            if (reportDatepickerInstance) return;
            const el = document.getElementById('reportDatePicker');
            if (!el) return;
            reportDatepickerInstance = new AirDatepicker(el, {
                locale: demandDateLocaleZh,
                dateFormat: 'yyyy-MM-dd',
                autoClose: true,
                buttons: [
                    {
                        content: '今天',
                        onClick: function(dp) {
                            dp.selectDate(new Date());
                        }
                    },
                    {
                        content: '清除',
                        onClick: function(dp) {
                            dp.clear();
                        }
                    }
                ]
            });
        }

        function generateReport() {
            var date = document.getElementById('reportDatePicker').value.trim();
            if (!date) {
                showAlert('請選擇報表日期', 'error');
                return;
            }

            var btn = document.getElementById('btnReport');
            setButtonLoading(btn, true, '產生中...');

            google.script.run
                .withSuccessHandler(function(report) {
                    setButtonLoading(btn, false);
                    handleReportGenerated(report);
                })
                .withFailureHandler(function(error) {
                    setButtonLoading(btn, false);
                    handleError(error);
                })
                .generateDailyReport(date);
        }

        function handleReportGenerated(report) {
            var container = document.getElementById('reportResults');
            var dateLabel = report.date || '';

            if (report.totalOrders === 0) {
                container.innerHTML =
                    '<div class="report-date-label">' +
                        '<i class="fas fa-calendar-check" style="margin-right:6px;"></i>' + dateLabel +
                    '</div>' +
                    '<p style="padding:20px;text-align:center;color:#64748b;">當日無營業記錄</p>';
                return;
            }

            var totalRevenue = Math.round(report.totalRevenue);
            var avgOrder = report.totalOrders > 0 ? Math.round(totalRevenue / report.totalOrders) : 0;
            var html = '';

            // 日期標示
            html += '<div class="report-date-label"><i class="fas fa-calendar-check" style="margin-right:6px;"></i>' + dateLabel + '，共 ' + report.totalOrders + ' 筆訂單</div>';

            // 摘要卡片
            html += '<div class="report-summary-cards">';
            html += '<div class="report-summary-card revenue">' +
                        '<div class="card-label">總營業額</div>' +
                        '<div class="card-value">$' + totalRevenue.toLocaleString() + '</div>' +
                    '</div>';
            html += '<div class="report-summary-card orders">' +
                        '<div class="card-label">訂單數</div>' +
                        '<div class="card-value">' + report.totalOrders + '</div>' +
                    '</div>';
            html += '<div class="report-summary-card items">' +
                        '<div class="card-label">商品總數</div>' +
                        '<div class="card-value">' + report.totalItems + '</div>' +
                    '</div>';
            html += '<div class="report-summary-card avg">' +
                        '<div class="card-label">平均客單價</div>' +
                        '<div class="card-value">$' + avgOrder.toLocaleString() + '</div>' +
                    '</div>';
            html += '</div>';

            // 商品銷售明細
            if (report.productSales && report.productSales.length > 0) {
                html += '<div class="demand-section-title"><i class="fas fa-chart-bar" style="margin-right:8px;"></i>商品銷售明細</div>';
                html += '<table class="demand-stats-table"><thead><tr><th>商品名稱</th><th>數量</th><th>金額</th><th>佔比</th></tr></thead><tbody>';
                for (var i = 0; i < report.productSales.length; i++) {
                    var p = report.productSales[i];
                    var amount = Math.round(p.amount);
                    var pct = totalRevenue > 0 ? ((amount / totalRevenue) * 100).toFixed(1) : '0.0';
                    html += '<tr>' +
                        '<td>' + p.productName + '</td>' +
                        '<td>' + p.quantity + '</td>' +
                        '<td class="qty-cell">$' + amount.toLocaleString() + '</td>' +
                        '<td>' + pct + '%</td>' +
                    '</tr>';
                }
                html += '</tbody></table>';
            } else {
                html += '<p style="padding:20px;text-align:center;color:#64748b;">當日無商品銷售明細</p>';
            }

            container.innerHTML = html;
        }

        function handleError(error) {
            showAlert('發生錯誤: ' + error.message, 'error');
            console.error('Error:', error);
        }

        // --- Alert System ---
        function showAlert(message, type = 'success', duration = 0) {
            const alertContainer = document.getElementById('alertContainer');
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert alert-${type}`;

            const iconMap = {
                success: 'fa-check',
                error: 'fa-exclamation',
                warning: 'fa-exclamation',
                info: 'fa-info'
            };
            const icon = document.createElement('div');
            icon.className = 'alert-icon';
            icon.innerHTML = `<i class="fas ${iconMap[type] || iconMap.info}"></i>`;

            const text = document.createElement('div');
            text.className = 'alert-message';
            text.textContent = message;

            const close = document.createElement('div');
            close.className = 'alert-close';
            close.innerHTML = '<i class="fas fa-times"></i>';

            alertDiv.appendChild(icon);
            alertDiv.appendChild(text);
            alertDiv.appendChild(close);
            alertContainer.prepend(alertDiv);

            let removed = false;
            function dismiss() {
                if (removed) return;
                removed = true;
                alertDiv.style.opacity = '0';
                alertDiv.style.transform = 'translateX(30%)';
                setTimeout(() => alertDiv.remove(), 300);
            }
            // 點擊即關閉
            alertDiv.addEventListener('click', dismiss);

            // 錯誤與多行重要訊息停留較久；呼叫端可用 duration 指定
            const holdTime = duration > 0 ? duration
                           : ((type === 'error' || message.includes('\n')) ? 6000 : 3000);
            setTimeout(dismiss, holdTime);
        }

        // --- Button Loading State Management ---
        function setButtonLoading(button, isLoading = true, loadingText = '') {
            if (typeof button === 'string') {
                button = document.getElementById(button);
            }

            if (!button) return;

            // 檢查是否為禮盒規格按鈕（不需要隱藏內容）
            const isGiftboxSizeBtn = button.closest('#giftboxStep1') !== null;

            if (isLoading) {
                // 保存原始內容
                if (!button.dataset.originalContent) {
                    button.dataset.originalContent = button.innerHTML;
                }

                // 設置載入狀態
                button.disabled = true;
                button.classList.add('loading');

                if (loadingText) {
                    button.dataset.loadingText = loadingText;
                    // 禮盒規格按鈕保持內容可見，只顯示 spinner overlay
                    if (!isGiftboxSizeBtn) {
                        button.innerHTML = `<span class="btn-text btn-text-hidden">${button.dataset.originalContent}</span>`;
                    }
                }
            } else {
                // 恢復原始狀態
                button.disabled = false;
                button.classList.remove('loading');

                if (button.dataset.originalContent) {
                    button.innerHTML = button.dataset.originalContent;
                    delete button.dataset.originalContent;
                }

                if (button.dataset.loadingText) {
                    delete button.dataset.loadingText;
                }
            }
        }

        function withButtonLoading(button, asyncFunction, loadingText = '處理中...') {
            return async function(...args) {
                setButtonLoading(button, true, loadingText);
                try {
                    const result = await asyncFunction.apply(this, args);
                    return result;
                } catch (error) {
                    throw error;
                } finally {
                    setButtonLoading(button, false);
                }
            };
        }

        // 防重複點擊機制
        const buttonClickStates = new Set();

        function preventDoubleClick(buttonId, func, delay = 1000) {
            return function(...args) {
                if (buttonClickStates.has(buttonId)) {
                    return; // 如果正在處理，直接返回
                }

                buttonClickStates.add(buttonId);

                try {
                    const result = func.apply(this, args);

                    // 如果是Promise，等待完成後清除狀態
                    if (result && typeof result.then === 'function') {
                        result.finally(() => {
                            setTimeout(() => buttonClickStates.delete(buttonId), delay);
                        });
                    } else {
                        // 同步函數，延遲清除狀態
                        setTimeout(() => buttonClickStates.delete(buttonId), delay);
                    }

                    return result;
                } catch (error) {
                    setTimeout(() => buttonClickStates.delete(buttonId), delay);
                    throw error;
                }
            };
        }

        // === 禮盒功能函數 ===
        function selectGiftboxSize(size, btnElement) {
            const sizeBtn = btnElement || window.event?.currentTarget || window.event?.target?.closest('button');

            // 防止重複點擊
            if (sizeBtn.classList.contains('loading')) return;

            setButtonLoading(sizeBtn, true, '準備中...');

            currentGiftboxSize = size;
            giftboxSelection = {};

            // 更新按鈕狀態
            document.querySelectorAll('.giftbox-size-btn').forEach(btn => {
                btn.classList.remove('selected');
                setButtonLoading(btn, false);
            });
            sizeBtn.classList.add('selected');

            document.getElementById('giftboxStep1').classList.remove('active');
            document.getElementById('giftboxStep2').classList.add('active');
            document.getElementById('giftboxStep2Title').textContent = `步驟2: 選擇商品組合 (${size}粒裝)`;
            document.getElementById('targetCount').textContent = size;
            loadGiftboxProducts();
            setButtonLoading(sizeBtn, false);
        }

        function loadGiftboxProducts() {
            const giftboxProducts = allProducts.filter(p => p.status === '啟用' && p.giftBoxEnabled === '是');
            const container = document.getElementById('giftboxProducts');

            if (giftboxProducts.length === 0) {
                container.innerHTML = '<p style="text-align: center; padding: 20px; color: #6b7280;">目前沒有可用於禮盒的商品</p>';
                return;
            }

            container.innerHTML = `<div class="giftbox-product-grid">${giftboxProducts.map(p => {
                const eprice = getEffectivePrice(p);
                const isCompanyPriceActive = isCompanyCustomer && p.companyPrice && parseFloat(p.companyPrice) > 0 && parseFloat(p.companyPrice) !== parseFloat(p.price);
                return `
                <div class="giftbox-product-card" id="card_${p.productId}">
                    <div class="giftbox-product-icon">
                        <i class="fas fa-cookie-bite"></i>
                    </div>
                    <div class="giftbox-product-info">
                        <h4>${p.productName}</h4>
                        <span class="price">${isCompanyPriceActive ? '<span class="company-original-price">NT$ ' + p.price + '</span>' : ''}NT$ ${eprice}${isCompanyPriceActive ? '<span class="company-price-tag">企業價</span>' : ''}</span>
                    </div>
                    <div class="giftbox-quantity-control">
                        <button type="button" class="giftbox-qty-btn" onclick="adjustGiftboxQty('${p.productId}', -1)">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" inputmode="numeric" min="0" class="giftbox-qty-display" id="display_${p.productId}" value="0" onfocus="this.select()" onchange="setGiftboxQty('${p.productId}', this.value)">
                        <button type="button" class="giftbox-qty-btn" onclick="adjustGiftboxQty('${p.productId}', 1)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <input type="hidden" class="giftbox-product-input" id="qty_${p.productId}" value="0">
                </div>`;
            }).join('')}</div>`;

            updateGiftboxProgress();
        }

        function adjustGiftboxQty(productId, change) {
            const input = document.getElementById('qty_' + productId);
            const display = document.getElementById('display_' + productId);
            const card = document.getElementById('card_' + productId);
            let currentVal = parseInt(input.value) || 0;

            // 計算目前已選總數
            const currentTotal = Object.values(giftboxSelection).reduce((sum, qty) => sum + qty, 0);

            // 如果是增加數量，檢查是否會超過限制
            if (change > 0 && currentTotal >= currentGiftboxSize) {
                // 已達上限，顯示提示並禁止增加
                showAlert(`已達${currentGiftboxSize}入上限`, 'warning');
                return;
            }

            let newVal = Math.max(0, currentVal + change);

            input.value = newVal;
            display.value = newVal;

            // 更新視覺狀態
            if (newVal > 0) {
                display.classList.add('has-value');
                card.classList.add('has-quantity');
            } else {
                display.classList.remove('has-value');
                card.classList.remove('has-quantity');
            }

            updateGiftboxSelection(productId, newVal);
        }

        // 直接輸入數量（onchange 觸發，超過上限時自動裁切為剩餘可選數）
        function setGiftboxQty(productId, rawValue) {
            const input = document.getElementById('qty_' + productId);
            const display = document.getElementById('display_' + productId);
            const card = document.getElementById('card_' + productId);

            let newVal = Math.max(0, parseInt(rawValue, 10) || 0);

            // 其他商品已選的總數
            const otherTotal = Object.entries(giftboxSelection)
                .filter(([id]) => id !== productId)
                .reduce((sum, [, qty]) => sum + qty, 0);

            if (otherTotal + newVal > currentGiftboxSize) {
                newVal = Math.max(0, currentGiftboxSize - otherTotal);
                showAlert(`已達${currentGiftboxSize}入上限，已自動調整為 ${newVal}`, 'warning');
            }

            input.value = newVal;
            display.value = newVal;
            display.classList.toggle('has-value', newVal > 0);
            card.classList.toggle('has-quantity', newVal > 0);

            updateGiftboxSelection(productId, newVal);
        }

        function updateGiftboxSelection(productId, quantity) {
            const qty = parseInt(quantity) || 0;
            if (qty > 0) {
                giftboxSelection[productId] = qty;
            } else {
                delete giftboxSelection[productId];
            }
            updateGiftboxProgress();
        }

        function updateGiftboxProgress() {
            const totalSelected = Object.values(giftboxSelection).reduce((sum, qty) => sum + qty, 0);
            document.getElementById('selectedCount').textContent = totalSelected;

            // 移除按鈕鎖定，改為顏色提示
            if (totalSelected > currentGiftboxSize) {
                document.querySelector('.giftbox-progress').style.color = '#c66b6b';
                document.querySelector('.giftbox-progress').style.borderLeftColor = '#c66b6b';
            } else if (totalSelected === currentGiftboxSize) {
                document.querySelector('.giftbox-progress').style.color = '#2ecc71';
                document.querySelector('.giftbox-progress').style.borderLeftColor = '#2ecc71';
            } else {
                document.querySelector('.giftbox-progress').style.color = 'var(--primary-dark)';
                document.querySelector('.giftbox-progress').style.borderLeftColor = 'var(--primary-color)';
            }
        }

        function proceedToStep3() {
            const totalSelected = Object.values(giftboxSelection).reduce((sum, qty) => sum + qty, 0);

            // 檢查數量是否符合要求
            if (totalSelected === 0) {
                showAlert('請選擇至少一個商品', 'error');
                return;
            }

            if (totalSelected < currentGiftboxSize) {
                showAlert(`還需要選擇 ${currentGiftboxSize - totalSelected} 個商品`, 'error');
                return;
            }

            if (totalSelected > currentGiftboxSize) {
                showAlert(`商品數量超過限制，請減少 ${totalSelected - currentGiftboxSize} 個商品`, 'error');
                return;
            }

            // 數量正確，繼續下一步
            const proceedBtn = document.getElementById('proceedStep3');
            setButtonLoading(proceedBtn, true, '計算中...');

            document.getElementById('giftboxStep2').classList.remove('active');
            document.getElementById('giftboxStep3').classList.add('active');
            updateGiftboxSummary();
            setButtonLoading(proceedBtn, false);

                // 編輯模式時更新按鈕文字
                const addBtn = document.querySelector('.btn-add-cart');
                if (addBtn) {
                    if (editingGiftboxIndex >= 0) {
                        addBtn.innerHTML = '<i class="fas fa-save"></i> 更新禮盒';
                    } else {
                        addBtn.innerHTML = '<i class="fas fa-cart-plus"></i> 加入購物車';
                    }
                }
        }

        function updateGiftboxSummary() {
            const summaryContainer = document.getElementById('giftboxSummary');
            const sizeLabel = document.getElementById('giftboxSizeLabel');
            let summaryHtml = '';
            let totalPrice = 0;

            // 更新標題中的規格標籤
            if (sizeLabel) {
                sizeLabel.textContent = `${currentGiftboxSize}粒裝禮盒`;
            }

            for (const [productId, quantity] of Object.entries(giftboxSelection)) {
                const product = allProducts.find(p => p.productId === productId);
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
                                    <div class="product-name">${product.productName}</div>
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
                    <span class="total-label"><i class="fas fa-calculator"></i> 單組禮盒總價</span>
                    <span class="total-price">NT$ ${totalPrice}</span>
                </div>
            `;

            summaryContainer.innerHTML = summaryHtml;

            // 保存當前組合資訊
            currentGiftboxCombo = {
                size: currentGiftboxSize,
                products: { ...giftboxSelection },
                unitPrice: totalPrice
            };
        }

        function addGiftboxToCart() {
            const addBtn = window.event?.currentTarget || window.event?.target?.closest('button') || window.event?.target;
            const quantity = parseInt(document.getElementById('giftboxQuantity').value) || 1;
            const notes = document.getElementById('giftboxNotes').value.trim();
            const isEditing = editingGiftboxIndex >= 0;

            if (!currentGiftboxCombo) {
                showAlert('禮盒組合資訊錯誤', 'error');
                return;
            }

            // 檢查是否有設定特價
            const specialPriceInput = document.getElementById('giftboxSpecialPriceInput');
            const specialPrice = parseFloat(specialPriceInput.value) || 0;

            let finalPrice = currentGiftboxCombo.unitPrice;
            let isSpecialPrice = false;

            if (specialPrice > 0) {
                finalPrice = specialPrice;
                isSpecialPrice = true;
            }

            const loadingText = isEditing ? '更新中...' : '加入中...';
            setButtonLoading(addBtn, true, loadingText);

            if (isEditing) {
                    // 編輯模式：更新現有禮盒
                    const existingItem = giftboxCart[editingGiftboxIndex];
                    giftboxCart[editingGiftboxIndex] = {
                        ...existingItem,
                        name: `${currentGiftboxCombo.size}粒裝禮盒`,
                        size: currentGiftboxCombo.size,
                        products: currentGiftboxCombo.products,
                        price: finalPrice,
                        originalPrice: currentGiftboxCombo.unitPrice,
                        isSpecialPrice: isSpecialPrice,
                        quantity: quantity,
                        notes: notes
                    };
                    showAlert('禮盒已更新', 'success');
                } else {
                    // 新增模式：添加新禮盒
                    const giftboxItem = {
                        type: 'giftbox',
                        id: generateUniqueId('GB'),
                        name: `${currentGiftboxCombo.size}粒裝禮盒`,
                        size: currentGiftboxCombo.size,
                        products: currentGiftboxCombo.products,
                        price: finalPrice,
                        originalPrice: currentGiftboxCombo.unitPrice,
                        isSpecialPrice: isSpecialPrice,
                        quantity: quantity,
                        notes: notes
                    };
                    giftboxCart.push(giftboxItem);
                    showAlert(`已將 ${quantity} 組禮盒加入購物車`, 'success');
                }

                updateCartDisplay();
                setButtonLoading(addBtn, false);

                // 重置禮盒狀態
            resetGiftboxState();
        }

        function resetGiftboxState() {
            currentGiftboxSize = 0;
            giftboxSelection = {};
            currentGiftboxCombo = null;
            editingGiftboxIndex = -1; // 重置編輯模式

            // 重置到步驟1
            document.querySelectorAll('.giftbox-step').forEach(step => step.classList.remove('active'));
            document.getElementById('giftboxStep1').classList.add('active');

            // 重置按鈕狀態
            document.querySelectorAll('.giftbox-size-btn').forEach(btn => btn.classList.remove('selected'));

            // 重置表單
            document.getElementById('giftboxQuantity').value = 1;
            document.getElementById('giftboxNotes').value = '';

            // 重置特價相關欄位
            document.getElementById('giftboxSpecialPriceInput').value = '';
            document.getElementById('giftboxPriceComparison').style.display = 'none';

            // 重置加入購物車按鈕文字
            const addBtn = document.querySelector('.btn-add-cart');
            if (addBtn) {
                addBtn.innerHTML = '<i class="fas fa-cart-plus"></i> 加入購物車';
            }
        }

        function editGiftboxItem(cartIndex) {
            // 找到 giftboxCart 中的對應項目
            const allItems = [...giftCart, ...cakeCart, ...giftboxCart];
            const item = allItems[cartIndex];

            if (!item || item.type !== 'giftbox') {
                showAlert('找不到禮盒項目', 'error');
                return;
            }

            // 找到在 giftboxCart 中的實際索引
            const giftboxIndex = giftboxCart.findIndex(g => g.id === item.id);
            if (giftboxIndex === -1) {
                showAlert('找不到禮盒項目', 'error');
                return;
            }

            // 設置編輯模式
            editingGiftboxIndex = giftboxIndex;

            // 關閉購物車 modal
            closeCartModal();

            // 導航到禮盒頁面
            showSectionById('giftbox');

            // 設置禮盒規格
            currentGiftboxSize = item.size;
            giftboxSelection = { ...item.products };

            // 更新按鈕狀態
            document.querySelectorAll('.giftbox-size-btn').forEach(btn => btn.classList.remove('selected'));

            // 直接跳到步驟2
            document.querySelectorAll('.giftbox-step').forEach(step => step.classList.remove('active'));
                document.getElementById('giftboxStep2').classList.add('active');
                document.getElementById('giftboxStep2Title').textContent = `步驟2: 選擇商品組合 (${item.size}粒裝)`;
                document.getElementById('targetCount').textContent = item.size;

                // 載入產品並填入已選擇的數量
                loadGiftboxProductsForEdit(item.products);

                // 填入數量和備註
                document.getElementById('giftboxQuantity').value = item.quantity;
                document.getElementById('giftboxNotes').value = item.notes || '';

                // 如果有特價，填入特價
                if (item.isSpecialPrice) {
                    document.getElementById('giftboxSpecialPriceInput').value = item.price;
                }

            showAlert('正在編輯禮盒，修改後請點擊「更新禮盒」', 'info');
        }

        function loadGiftboxProductsForEdit(existingProducts) {
            const giftboxProducts = allProducts.filter(p => p.status === '啟用' && p.giftBoxEnabled === '是');
            const container = document.getElementById('giftboxProducts');

            if (giftboxProducts.length === 0) {
                container.innerHTML = '<p style="text-align: center; padding: 20px; color: #6b7280;">目前沒有可用於禮盒的商品</p>';
                return;
            }

            container.innerHTML = `<div class="giftbox-product-grid">${giftboxProducts.map(p => {
                const existingQty = existingProducts[p.productId] || 0;
                const hasQty = existingQty > 0;
                const eprice = getEffectivePrice(p);
                const isCompanyPriceActive = isCompanyCustomer && p.companyPrice && parseFloat(p.companyPrice) > 0 && parseFloat(p.companyPrice) !== parseFloat(p.price);
                return `
                <div class="giftbox-product-card ${hasQty ? 'has-quantity' : ''}" id="card_${p.productId}">
                    <div class="giftbox-product-icon">
                        <i class="fas fa-cookie-bite"></i>
                    </div>
                    <div class="giftbox-product-info">
                        <h4>${p.productName}</h4>
                        <span class="price">${isCompanyPriceActive ? '<span class="company-original-price">NT$ ' + p.price + '</span>' : ''}NT$ ${eprice}${isCompanyPriceActive ? '<span class="company-price-tag">企業價</span>' : ''}</span>
                    </div>
                    <div class="giftbox-quantity-control">
                        <button type="button" class="giftbox-qty-btn" onclick="adjustGiftboxQty('${p.productId}', -1)">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" inputmode="numeric" min="0" class="giftbox-qty-display ${hasQty ? 'has-value' : ''}" id="display_${p.productId}" value="${existingQty}" onfocus="this.select()" onchange="setGiftboxQty('${p.productId}', this.value)">
                        <button type="button" class="giftbox-qty-btn" onclick="adjustGiftboxQty('${p.productId}', 1)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <input type="hidden" class="giftbox-product-input" id="qty_${p.productId}" value="${existingQty}">
                </div>
            `}).join('')}</div>`;

            updateGiftboxProgress();
        }

        function backToStep1() {
            document.querySelectorAll('.giftbox-step').forEach(step => step.classList.remove('active'));
            document.getElementById('giftboxStep1').classList.add('active');
            if (typeof resetGiftboxState === 'function') {
                resetGiftboxState();
            }
        }

        function backToStep2() {
            document.getElementById('giftboxStep3').classList.remove('active');
            document.getElementById('giftboxStep2').classList.add('active');
        }

        // ==========================================
        //        確認Modal適配器
        // ==========================================

        function showConfirmModal(message, callback) {
            document.getElementById('confirmModalMessage').textContent = message;
            confirmCallback = callback;
            document.getElementById('confirmModal').classList.add('active');
        }

        function closeConfirmModal() {
            document.getElementById('confirmModal').classList.remove('active');
            confirmCallback = null;
        }

        function executeConfirmCallback() {
            if (confirmCallback) {
                confirmCallback();
            }
        }

        // ==========================================
        //    狀態更新/刪除 Slider 功能
        // ==========================================

        // 注意：deleteOrderId, currentDepositOrderId,
        // currentDepositTotalAmount, currentDepositAmount 已在主 JavaScript 中聲明
        let currentStatusOrderId = null;
        let currentStatusValue = null;

        // 統一的滑動確認元件：滑到底放開即執行 onConfirm（Pointer Events 同時支援滑鼠與觸控）
        function initConfirmSlider(thumbId, progressId, onConfirm) {
            const thumb = document.getElementById(thumbId);
            const progressBar = document.getElementById(progressId);
            if (!thumb) return null;

            const track = thumb.parentElement;
            let dragging = false;
            let confirmed = false;
            let startX = 0;

            function maxX() {
                return track.offsetWidth - thumb.offsetWidth - 4;
            }

            function setPosition(x) {
                thumb.style.left = x + 'px';
                if (progressBar) {
                    progressBar.style.width = (x <= 2 ? 0 : Math.min(track.offsetWidth, x + thumb.offsetWidth)) + 'px';
                }
            }

            function setSnapping(enabled) {
                thumb.classList.toggle('snapping', enabled);
                if (progressBar) progressBar.classList.toggle('snapping', enabled);
            }

            thumb.addEventListener('pointerdown', function(e) {
                if (confirmed) return;
                dragging = true;
                startX = e.clientX - thumb.offsetLeft;
                setSnapping(false);
                try { thumb.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件無作用中的 pointer，略過 */ }
                e.preventDefault();
            });

            thumb.addEventListener('pointermove', function(e) {
                if (!dragging || confirmed) return;
                setPosition(Math.max(2, Math.min(maxX(), e.clientX - startX)));
            });

            thumb.addEventListener('pointerup', function() {
                if (!dragging || confirmed) return;
                dragging = false;
                setSnapping(true);

                if (thumb.offsetLeft >= maxX() * 0.8) {
                    // 放開時已滑過八成即視為確認：吸附到底並執行
                    confirmed = true;
                    setPosition(maxX());
                    thumb.classList.add('completed');
                    thumb.innerHTML = '<i class="fas fa-check"></i>';
                    if (onConfirm) onConfirm();
                } else {
                    // 未達門檻：動畫回彈
                    setPosition(2);
                }
            });

            thumb.addEventListener('pointercancel', function() {
                if (!dragging || confirmed) return;
                dragging = false;
                setSnapping(true);
                setPosition(2);
            });

            return {
                reset: function() {
                    dragging = false;
                    confirmed = false;
                    setSnapping(false);
                    thumb.classList.remove('completed');
                    thumb.innerHTML = '<i class="fas fa-chevron-right"></i>';
                    setPosition(2);
                }
            };
        }

        let statusSliderCtrl = null;

        function showStatusConfirm(orderId, newStatus) {
            currentStatusOrderId = orderId;
            currentStatusValue = newStatus;

            // 更新顯示資訊
            document.getElementById('statusOrderId').textContent = `訂單編號：${orderId}`;
            document.getElementById('statusUpdateInfo').textContent = `將更新為：${newStatus}`;
            document.getElementById('statusUpdateStatus').textContent = '';
            document.getElementById('statusUpdateStatus').className = 'status-update-status';

            // 滑到底放開才執行更新。
            if (!statusSliderCtrl) {
                statusSliderCtrl = initConfirmSlider('statusSliderThumb', 'statusSliderProgress', function() {
                    const statusEl = document.getElementById('statusUpdateStatus');
                    statusEl.textContent = '已確認，正在更新...';
                    statusEl.classList.add('success');
                    setTimeout(executeStatusUpdate, 350);
                });
            }
            statusSliderCtrl.reset();

            document.getElementById('statusConfirmModal').classList.add('active');
        }

        function executeStatusUpdate() {
            if (!currentStatusOrderId || !currentStatusValue) return;
            updateOrderStatus(currentStatusOrderId, currentStatusValue);
            closeStatusConfirmModal();
        }

        function closeStatusConfirmModal() {
            document.getElementById('statusConfirmModal').classList.remove('active');
            currentStatusOrderId = null;
            currentStatusValue = null;
        }

        let deleteSliderCtrl = null;

        function showDeleteConfirm(orderId, customerName) {
            deleteOrderId = orderId;

            // 更新顯示資訊
            document.getElementById('deleteOrderId').textContent = `訂單編號：${orderId}`;
            document.getElementById('deleteCustomerName').textContent = `客戶：${customerName}`;

            const status = document.getElementById('deleteStatus');
            status.textContent = '';
            status.classList.remove('show', 'success');

            // 滑到底放開才執行刪除。
            if (!deleteSliderCtrl) {
                deleteSliderCtrl = initConfirmSlider('deleteSliderThumb', 'deleteSliderProgress', function() {
                    executeDelete();
                });
            }
            deleteSliderCtrl.reset();

            document.getElementById('deleteConfirmModal').classList.add('active');
        }

        function closeDeleteConfirmModal() {
            document.getElementById('deleteConfirmModal').classList.remove('active');
            deleteOrderId = null;
        }

        // ==========================================
        //        訂金Modal適配器
        // ==========================================

        function showDepositModal(orderId, totalAmount, depositAmount) {
            currentDepositOrderId = orderId;
            currentDepositTotalAmount = totalAmount;
            currentDepositAmount = depositAmount;

            document.getElementById('depositOrderInfo').textContent = `訂單編號：${orderId} - 總金額：NT$ ${totalAmount}`;
            document.getElementById('depositAmountInput').value = depositAmount || '';
            document.getElementById('paymentNotesInput').value = '';

            updateDepositCalculation();

            document.getElementById('depositModal').classList.add('active');
        }

        function closeDepositModal() {
            document.getElementById('depositModal').classList.remove('active');
            currentDepositOrderId = null;
            currentDepositTotalAmount = 0;
            currentDepositAmount = 0;
        }

        function updateDepositCalculation() {
            const depositInput = document.getElementById('depositAmountInput');
            const newDepositAmount = parseFloat(depositInput.value) || 0;
            const calculationResult = document.getElementById('depositCalculationResult');

            if (newDepositAmount > currentDepositTotalAmount) {
                depositInput.style.borderColor = '#e74c3c';
                calculationResult.style.display = 'none';
                return;
            } else {
                depositInput.style.borderColor = '#e5e7eb';
            }

            if (newDepositAmount > 0) {
                calculationResult.style.display = 'block';

                const remainingAmount = currentDepositTotalAmount - newDepositAmount;

                let newStatus = '已確認';
                let statusColor = '#1f6f5f';
                if (newDepositAmount > 0 && newDepositAmount < currentDepositTotalAmount) {
                    newStatus = '已付訂金';
                    statusColor = '#f39c12';
                } else if (newDepositAmount === currentDepositTotalAmount) {
                    newStatus = '已付清';
                    statusColor = '#27ae60';
                }

                document.getElementById('currentDepositText').textContent = `NT$ ${newDepositAmount}`;
                document.getElementById('remainingAmountText').textContent = `NT$ ${remainingAmount}`;
                document.getElementById('remainingAmountText').style.color = remainingAmount > 0 ? '#e74c3c' : '#27ae60';

                const statusText = document.getElementById('newStatusText');
                statusText.textContent = newStatus;
                statusText.style.backgroundColor = statusColor;
                statusText.style.color = 'white';
            } else {
                calculationResult.style.display = 'none';
            }
        }

        function confirmDepositUpdate() {
            const depositAmount = parseFloat(document.getElementById('depositAmountInput').value) || 0;
            const paymentNotes = document.getElementById('paymentNotesInput').value.trim();
            
            if (!currentDepositOrderId) {
                showAlert('訂單資訊錯誤', 'error');
                return;
            }
            
            if (depositAmount > currentDepositTotalAmount) {
                showAlert('訂金不能超過總金額', 'error');
                return;
            }
            
            const confirmBtn = document.getElementById('confirmDepositBtn');
            setButtonLoading(confirmBtn, true, '設定中...');
            
            google.script.run
                .withSuccessHandler(function(result) {
                    setButtonLoading(confirmBtn, false);
                    const cachedOrder = currentSearchOrders.find(order => (order.id || order.orderId) === result.orderId);
                    if (cachedOrder) {
                        cachedOrder.depositAmount = result.depositAmount;
                        cachedOrder.remainingAmount = result.remainingAmount;
                    }
                    showAlert(`訂金已設定：NT$ ${result.depositAmount}，狀態更新為：${result.newStatus}`, 'success');
                    closeDepositModal();
                    
                    // 刷新頁面顯示
                    refreshOrderDisplays(result.orderId, result.newStatus);
                })
                .withFailureHandler(function(error) {
                    setButtonLoading(confirmBtn, false);
                    handleError(error);
                })
                .updateOrderDeposit(currentDepositOrderId, depositAmount, paymentNotes);
        }

        function executeDelete() {
            if (!deleteOrderId) return;

            const orderId = deleteOrderId;
            const status = document.getElementById('deleteStatus');
            status.textContent = '正在刪除訂單...';
            status.classList.add('show');
            status.classList.remove('success');

            const onDeleteSuccess = function() {
                // 只移除該筆訂單列，保留其餘搜尋結果
                const rowsToRemove = new Set();
                document.querySelectorAll(`#searchResults button[data-oid="${orderId}"]`).forEach(function(btn) {
                    const tr = btn.closest('tr');
                    if (tr) rowsToRemove.add(tr);
                });
                rowsToRemove.forEach(function(tr) {
                    const expandedRow = tr.nextElementSibling;
                    if (expandedRow && expandedRow.classList.contains('order-items-row')) expandedRow.remove();
                    tr.remove();
                });
                currentSearchOrders = currentSearchOrders.filter(order => (order.id || order.orderId) !== orderId);
                if (expandedSearchOrderId === orderId) expandedSearchOrderId = null;
                closeDeleteConfirmModal();
                showAlert('訂單已刪除', 'success');
            };

            const onDeleteFailure = function(error) {
                // 失敗時重置滑動元件，讓使用者可重試
                status.textContent = '';
                status.classList.remove('show');
                if (deleteSliderCtrl) deleteSliderCtrl.reset();
                handleError(error);
            };

            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(onDeleteSuccess)
                    .withFailureHandler(onDeleteFailure)
                    .deleteOrder(orderId);
            } else {
                onDeleteFailure(new Error('尚未連接 Firebase'));
            }
        }


        // ==========================================
        //        新 UI 適配層
        // ==========================================

        // Grove Button 選擇器 - 配送方式
        function selectDeliveryType(button, value) {
            const parent = button.parentElement;
            parent.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            document.getElementById('deliveryTypeValue').value = value;
            toggleShippingField();
        }

        // Grove Button 選擇器 - 運費設定
        function selectShippingFee(button, value) {
            const parent = button.parentElement;
            parent.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            document.getElementById('shippingOption').value = value;
            toggleShippingFeeInput();
        }

        // Grove Button 選擇器 - 客戶類型
        function selectCustomerType(button, isCompany) {
            const parent = button.parentElement;
            parent.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            isCompanyCustomer = isCompany;
            updateProductDisplays();
            recalcCartPricesForCustomerType();
        }

        // 重新計算購物車中非特價品項的價格
        function recalcCartPricesForCustomerType() {
            let hasChanges = false;
            [giftCart, cakeCart].forEach(cart => {
                cart.forEach(item => {
                    if (item.type !== 'giftbox' && !item.isSpecialPrice) {
                        const product = allProducts.find(p => p.productId === item.productId);
                        if (product) {
                            const newPrice = getEffectivePrice(product);
                            if (item.price !== newPrice) {
                                item.price = newPrice;
                                item.isCompanyPrice = isCompanyCustomer;
                                hasChanges = true;
                            }
                        }
                    }
                });
            });
            if (hasChanges) {
                updateCartDisplay();
                const modeText = isCompanyCustomer ? '企業' : '一般';
                showAlert('已切換為' + modeText + '價格', 'success');
            }
        }

        // 適配舊版的 radio button 邏輯
        function toggleShippingField() {
            const deliveryType = document.getElementById('deliveryTypeValue').value;
            const isPickup = deliveryType === '自取';

            const addressGroup = document.getElementById('customerAddress').closest('.mb-8') || document.getElementById('customerAddress').parentElement;
            const shippingFeeGroup = document.getElementById('shippingFeeGroup');
            const recipientInfoGroup = document.getElementById('recipientInfoGroup');

            if (isPickup) {
                addressGroup.style.display = 'none';
                shippingFeeGroup.style.display = 'none';
                recipientInfoGroup.style.display = 'none';
                document.getElementById('customerAddress').value = '';
                document.getElementById('shippingFee').value = '';
                document.getElementById('recipientName').value = '';
                document.getElementById('recipientPhone').value = '';
            } else {
                addressGroup.style.display = 'block';
                recipientInfoGroup.style.display = 'grid';
                shippingFeeGroup.style.display = 'grid';
            }

            updateOrderTotal();
        }

        function toggleShippingFeeInput() {
            const shippingOption = document.getElementById('shippingOption').value;
            const isCharge = shippingOption === 'charge';
            const shippingFeeInput = document.getElementById('shippingFeeInput');

            if (isCharge) {
                shippingFeeInput.style.display = 'block';
            } else {
                shippingFeeInput.style.display = 'none';
                document.getElementById('shippingFee').value = '';
            }

            updateOrderTotal();
        }

        // ==========================================
        //           日曆功能 (新UI)
        // ==========================================

        let calendarState = {
            currDate: new Date(),
            currYear: new Date().getFullYear(),
            currMonth: new Date().getMonth(),
            selectedDateStr: null
        };

        const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

        function renderCalendar(skipCapacityLoad) {
            const grid = document.getElementById('calendar-grid');
            const monthYearLabel = document.getElementById('calendar-month-year');

            if (!grid || !monthYearLabel) return;

            grid.innerHTML = "";
            monthYearLabel.innerText = `${calendarState.currYear}年 ${monthNames[calendarState.currMonth]}`;

            const firstDay = new Date(calendarState.currYear, calendarState.currMonth, 1).getDay();
            const daysInMonth = new Date(calendarState.currYear, calendarState.currMonth + 1, 0).getDate();

            for (let i = 0; i < firstDay; i++) {
                const emptyCell = document.createElement('div');
                grid.appendChild(emptyCell);
            }

            for (let i = 1; i <= daysInMonth; i++) {
                const dayBtn = document.createElement('div');
                dayBtn.className = 'calendar-day';

                const thisDateStr = `${calendarState.currYear}-${String(calendarState.currMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

                const dayNum = document.createElement('span');
                dayNum.textContent = i;
                dayBtn.appendChild(dayNum);

                dayBtn.dataset.date = thisDateStr;

                if (thisDateStr === calendarState.selectedDateStr) {
                    dayBtn.classList.add('selected');
                }

                const checkDate = new Date(calendarState.currYear, calendarState.currMonth, i);
                checkDate.setHours(23,59,59);
                if (checkDate < new Date().setHours(0,0,0,0)) {
                    dayBtn.classList.add('disabled');
                } else {
                    dayBtn.onclick = () => selectCalendarDate(i);
                }

                grid.appendChild(dayBtn);
            }

            // 將產能指標套用到已渲染的日曆格子
            function applyCapacityIndicators(capData) {
                if (!capData) return;
                const cells = grid.querySelectorAll('.calendar-day');
                cells.forEach(function(cell) {
                    const dateStr = cell.dataset.date;
                    if (dateStr && capData[dateStr]) {
                        const indicator = getCapacityIndicatorHtml(capData[dateStr]);
                        if (indicator) {
                            const existing = cell.querySelector('.cap-indicator');
                            if (existing) existing.remove();
                            cell.insertAdjacentHTML('beforeend', indicator);
                        }
                    }
                });
            }

            // 快取已有 → 同步套用；否則背景載入後再套用
            const capKey = calendarState.currYear + '-' + (calendarState.currMonth + 1);
            if (monthCapacityCache[capKey]) {
                applyCapacityIndicators(monthCapacityCache[capKey]);
            } else if (!skipCapacityLoad) {
                loadMonthCapacity(calendarState.currYear, calendarState.currMonth + 1, applyCapacityIndicators);
            }
        }

        function changeMonth(offset) {
            calendarState.currMonth += offset;
            if (calendarState.currMonth > 11) {
                calendarState.currMonth = 0;
                calendarState.currYear++;
            } else if (calendarState.currMonth < 0) {
                calendarState.currMonth = 11;
                calendarState.currYear--;
            }
            renderCalendar();
        }

        function selectCalendarDate(day) {
            calendarState.selectedDateStr = `${calendarState.currYear}-${String(calendarState.currMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            renderCalendar();

            const weekDay = new Date(calendarState.currYear, calendarState.currMonth, day).getDay();
            const weekStr = ['日','一','二','三','四','五','六'][weekDay];
            document.getElementById('selected-date-display').innerHTML =
                `已選擇：<span class="text-blue-600 font-bold text-xl">${calendarState.currYear}/${calendarState.currMonth + 1}/${day} (週${weekStr})</span>`;

            // 同步到隱藏的原生日期選擇器
            document.getElementById('deliveryDate').value = calendarState.selectedDateStr;

            const btn = document.getElementById('btn-confirm-date');
            btn.disabled = false;
            btn.classList.remove('bg-gray-300', 'cursor-not-allowed');
            btn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'shadow-lg');
            btn.innerHTML = `確認日期 <i class="fas fa-check ml-2"></i>`;
        }

        function confirmDateSelection() {
            if (!calendarState.selectedDateStr) return;
            setDeliveryDate();
        }

        // ==========================================
        //        導航和區塊切換 (新UI)
        // ==========================================

        function showSection(sectionName, navElement) {
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            document.getElementById(sectionName).classList.add('active');

            // 主捲動容器改為 main，切換頁面時捲回頂端
            const mainScroller = document.querySelector('main');
            if (mainScroller) mainScroller.scrollTop = 0;

            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('bg-blue-100', 'text-blue-700');
                item.classList.add('text-gray-600');
            });
            if (navElement) {
                navElement.classList.remove('text-gray-600');
                navElement.classList.add('bg-blue-100', 'text-blue-700');
            }

            const floatingCart = document.querySelector('.floating-cart');
            if (floatingCart) {
                if (sectionName === 'search' || sectionName === 'settings') {
                    floatingCart.style.display = 'none';
                } else {
                    floatingCart.style.display = 'flex';
                }
            }

            // 如果離開禮盒頁，重置禮盒編輯狀態
            if (sectionName !== 'giftbox' && editingGiftboxIndex >= 0) {
                resetGiftboxState();
            }

            // 如果切換到日期頁，渲染日曆
            if (sectionName === 'date') {
                setTimeout(() => renderCalendar(), 100);
            }

            // 如果切換到搜尋頁，初始化日期選擇器
            if (sectionName === 'search') {
                initSearchDatepicker();
            }
        }

        // ==========================================
        //        需求統計
        // ==========================================

        const demandDateLocaleZh = {
            days: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
            daysShort: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
            daysMin: ['日', '一', '二', '三', '四', '五', '六'],
            months: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
            monthsShort: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
            today: '今天',
            clear: '清除',
            dateFormat: 'yyyy-MM-dd',
            timeFormat: 'HH:mm',
            firstDay: 0
        };

        var overrideDatepickerInstance = null;

        function initOverrideDatepicker() {
            if (overrideDatepickerInstance) return;
            var el = document.getElementById('overrideDate');
            if (!el) return;
            overrideDatepickerInstance = new AirDatepicker(el, {
                locale: demandDateLocaleZh,
                range: true,
                dateFormat: 'yyyy-MM-dd',
                multipleDatesSeparator: ' ~ ',
                autoClose: true,
                buttons: [
                    {
                        content: '今天',
                        onClick: function(dp) {
                            dp.selectDate(new Date());
                            dp.selectDate(new Date());
                        }
                    },
                    {
                        content: '清除',
                        onClick: function(dp) {
                            dp.clear();
                        }
                    }
                ]
            });
        }

        let demandDatepickerInstance = null;

        function initDemandDatepicker() {
            if (demandDatepickerInstance) return;
            const el = document.getElementById('demandDatePicker');
            if (!el) return;
            demandDatepickerInstance = new AirDatepicker(el, {
                locale: demandDateLocaleZh,
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
                        }
                    },
                    {
                        content: '清除',
                        onClick: (dp) => {
                            dp.clear();
                        }
                    }
                ]
            });
        }

        function generateDemandStats() {
            const el = document.getElementById('demandDatePicker');
            const raw = el.value.trim();
            if (!raw) {
                showAlert('請先選擇日期', 'error');
                return;
            }

            let startDate, endDate;
            if (raw.includes('~')) {
                const parts = raw.split('~').map(s => s.trim());
                startDate = parts[0];
                endDate = parts[1] || parts[0];
            } else {
                startDate = raw;
                endDate = raw;
            }

            const btn = document.getElementById('btnDemandStats');
            setButtonLoading(btn, true, '統計中...');

            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function(result) {
                        setButtonLoading(btn, false);
                        renderDemandResults(result, startDate, endDate);
                    })
                    .withFailureHandler(function(error) {
                        setButtonLoading(btn, false);
                        handleError(error);
                    })
                    .getDemandStats(startDate, endDate);
            } else {
                setButtonLoading(btn, false);
                showAlert('尚未連接 Firebase，無法產生需求統計', 'error');
            }
        }

        function renderDemandResults(result, startDate, endDate) {
            const container = document.getElementById('demandResults');

            if (!result || result.orderCount === 0) {
                container.innerHTML = '<p style="padding: 20px; text-align: center; color: #64748b;">此期間無訂單資料</p>';
                return;
            }

            const dateLabel = startDate === endDate
                ? startDate
                : startDate + ' ~ ' + endDate;

            let html = '';

            // 日期區間標示
            html += `<div class="demand-date-range-label"><i class="fas fa-calendar-check" style="margin-right:6px;"></i>${dateLabel}，共 ${result.orderCount} 筆訂單</div>`;

            // 各商品需求量
            if (result.productStats.length > 0) {
                html += '<div class="demand-section-title"><i class="fas fa-boxes-stacked" style="margin-right:8px;"></i>各商品需求量</div>';
                html += '<table class="demand-stats-table"><thead><tr><th>商品名稱</th><th>散裝</th><th>禮盒內</th><th>合計</th></tr></thead><tbody>';
                result.productStats.forEach(p => {
                    html += `<tr>
                        <td>${p.name}</td>
                        <td>${p.loose || 0}</td>
                        <td>${p.inbox || 0}</td>
                        <td class="qty-cell">${p.total}</td>
                    </tr>`;
                });
                html += '</tbody></table>';
            }

            // 禮盒規格統計
            if (result.giftboxStats.length > 0) {
                html += '<div class="demand-section-title"><i class="fas fa-box" style="margin-right:8px;"></i>禮盒規格統計</div>';
                html += '<div class="demand-summary-cards">';
                result.giftboxStats.forEach(g => {
                    html += `<div class="demand-summary-card">
                        <div class="card-label">${g.size}</div>
                        <div class="card-value">${g.count}</div>
                        <div class="card-label">盒</div>
                    </div>`;
                });
                html += '</div>';
            }

            container.innerHTML = html;
        }

        function showSettingsSection(sectionName, navElement) {
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            const target = document.getElementById('settings' + sectionName.charAt(0).toUpperCase() + sectionName.slice(1));
            target.classList.add('active');
            target.style.display = '';

            document.querySelectorAll('.settings-nav-btn').forEach(item => {
                item.classList.remove('active');
            });
            if (navElement) {
                navElement.classList.add('active');
            }

            document.querySelector('.settings-layout').classList.add('drilled-in');

            if (sectionName === 'demand') {
                initDemandDatepicker();
            }
            if (sectionName === 'reports') {
                initReportDatepicker();
            }
            if (sectionName === 'capacity') {
                initOverrideDatepicker();
                loadCapacitySettings();
            }
        }

        function settingsBack() {
            document.querySelector('.settings-layout').classList.remove('drilled-in');
        }

        // ==========================================
        //        產能設定
        // ==========================================

        const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
        let capacitySettings = { weekday: {}, dateOverrides: [] };
        let capacitySettingsLoaded = false;
        let monthCapacityCache = {};
        let pendingOrderData = null;

        function calculateOrderUnits(items) {
            let total = 0;
            items.forEach(item => {
                const qty = parseInt(item.quantity) || 0;
                if (item.type === 'giftbox') {
                    const size = item.size || 0;
                    if (size > 0) {
                        total += size * qty;
                    } else if (item.products) {
                        let boxTotal = 0;
                        for (const pqty of Object.values(item.products)) {
                            boxTotal += parseInt(pqty) || 0;
                        }
                        total += boxTotal * qty;
                    } else {
                        total += qty;
                    }
                } else {
                    total += qty;
                }
            });
            return total;
        }

        function loadCapacitySettings(forceReload) {
            if (capacitySettingsLoaded && !forceReload) {
                renderCapacitySettingsUI();
                return;
            }
            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function(result) {
                        capacitySettings = result;
                        capacitySettingsLoaded = true;
                        renderCapacitySettingsUI();
                    })
                    .withFailureHandler(function(error) {
                        console.warn('載入產能設定失敗', error);
                        capacitySettings = { weekday: {}, dateOverrides: [] };
                        capacitySettingsLoaded = true;
                        renderCapacitySettingsUI();
                        showAlert('產能設定載入失敗，請重新整理後再試', 'error');
                    })
                    .getCapacitySettings();
            } else {
                capacitySettings = { weekday: {}, dateOverrides: [] };
                capacitySettingsLoaded = true;
                renderCapacitySettingsUI();
            }
        }

        function renderCapacitySettingsUI() {
            var grid = document.getElementById('capacityWeekdayGrid');
            if (!grid) return;

            grid.innerHTML = '';
            for (var i = 0; i < 7; i++) {
                var setting = capacitySettings.weekday[i.toString()] || { dayOfWeek: i, maxQuantity: '', enabled: false };
                var isActive = setting.enabled;
                var col = document.createElement('div');
                col.className = 'capacity-day-col' + (isActive ? ' active' : '');
                var val = (setting.maxQuantity === '' || setting.maxQuantity === null) ? '' : setting.maxQuantity;
                col.innerHTML =
                    '<div class="day-name">' + escapeHtml(weekdayNames[i]) + '</div>' +
                    '<input type="number" min="0" placeholder="0" value="' + val + '" data-day="' + i + '" id="capDay' + i + '">' +
                    '<label class="day-toggle">' +
                    '<input type="checkbox" ' + (isActive ? 'checked' : '') + ' data-day="' + i + '" id="capDayEnabled' + i + '">' +
                    '<span class="slider"></span>' +
                    '</label>';
                grid.appendChild(col);
            }

            grid.querySelectorAll('input[type="number"], input[type="checkbox"]').forEach(function(el) {
                el.addEventListener('change', function() {
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

        function renderOverrideTable() {
            const tbody = document.getElementById('overrideTableBody');
            if (!tbody) return;

            if (!capacitySettings.dateOverrides || capacitySettings.dateOverrides.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #9ca3af; padding: 24px;">尚無日期覆寫設定</td></tr>';
                return;
            }

            var todayStr = new Date().toISOString().slice(0, 10);
            var upcoming = [];
            var expired = [];
            capacitySettings.dateOverrides.forEach(function(o) {
                if (o.date >= todayStr) {
                    upcoming.push(o);
                } else {
                    expired.push(o);
                }
            });
            upcoming.sort(function(a, b) { return a.date.localeCompare(b.date); });
            expired.sort(function(a, b) { return a.date.localeCompare(b.date); });
            var sorted = upcoming.concat(expired);

            tbody.innerHTML = sorted.map(function(o) {
                var isExpired = o.date < todayStr;
                var d = new Date(o.date);
                var dayStr = isNaN(d.getTime()) ? '-' : '週' + weekdayNames[d.getDay()];
                var maxStr = (o.maxQuantity === '' || o.maxQuantity === null || o.maxQuantity === 0) ? '不限制' : o.maxQuantity;
                var statusBadge;
                if (isExpired) {
                    statusBadge = '<span style="color: #9ca3af;">已過期</span>';
                } else if (o.enabled) {
                    statusBadge = '<span style="color: #16a34a; font-weight: 600;">啟用</span>';
                } else {
                    statusBadge = '<span style="color: #9ca3af;">停用</span>';
                }
                var rowStyle = isExpired ? ' style="opacity: 0.5;"' : '';
                var deleteButton = document.body.dataset.shopRole === 'viewer' ? '' :
                    '<button class="requires-editor" aria-label="刪除 ' + escapeAttr(o.date) + ' 日期覆寫" onclick="deleteDateOverrideById(\'' + escapeAttr(o.id) + '\')" style="padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 0.8rem; cursor: pointer;">' +
                    '<i class="fas fa-trash-alt" aria-hidden="true"></i>' +
                    '</button>';
                return '<tr' + rowStyle + '>' +
                    '<td>' + escapeHtml(o.date) + '</td>' +
                    '<td>' + dayStr + '</td>' +
                    '<td style="font-weight: 600;">' + maxStr + '</td>' +
                    '<td>' + statusBadge + '</td>' +
                    '<td style="text-align: center;">' + deleteButton + '</td></tr>';
            }).join('');
        }

        var _weekdayCapacityDebounceTimer = null;
        function debouncedSaveWeekdayCapacity() {
            clearTimeout(_weekdayCapacityDebounceTimer);
            var statusEl = document.getElementById('weekdayAutoSaveStatus');
            if (statusEl) statusEl.textContent = '儲存中...';
            _weekdayCapacityDebounceTimer = setTimeout(function() {
                saveWeekdayCapacitySettings();
            }, 600);
        }

        function saveWeekdayCapacitySettings() {
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
                    enabled: checkbox ? checkbox.checked : false
                });
            }

            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function() {
                        if (statusEl) statusEl.textContent = '已自動儲存';
                        setTimeout(function() { if (statusEl) statusEl.textContent = ''; }, 2000);
                        settings.forEach(function(s) {
                            capacitySettings.weekday[s.dayOfWeek.toString()] = s;
                        });
                        invalidateCapacityCache();
                    })
                    .withFailureHandler(function(error) {
                        if (statusEl) { statusEl.style.color = '#dc2626'; statusEl.textContent = '儲存失敗: ' + error.message; }
                        setTimeout(function() { if (statusEl) { statusEl.style.color = '#9ca3af'; statusEl.textContent = ''; } }, 3000);
                    })
                    .saveWeekdayCapacity(settings);
            } else {
                if (statusEl) { statusEl.style.color = '#dc2626'; statusEl.textContent = '尚未連接 Firebase，未儲存'; }
            }
        }

        function parseOverrideDateRange(raw) {
            var dates = [];
            var startDate, endDate;
            if (raw.includes('~')) {
                var parts = raw.split('~').map(function(s) { return s.trim(); });
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

        function addDateOverride() {
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
            var settings = dates.map(function(d) {
                return { date: d, maxQuantity: maxQty, enabled: true };
            });

            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function() {
                        var msg = dates.length === 1
                            ? '日期覆寫設定已新增'
                            : '已新增 ' + dates.length + ' 天覆寫設定';
                        showAlert(msg, 'success');
                        if (overrideDatepickerInstance) overrideDatepickerInstance.clear();
                        qtyInput.value = '';
                        settings.forEach(function(s) {
                            capacitySettings.dateOverrides = capacitySettings.dateOverrides.filter(function(o) { return o.date !== s.date; });
                            capacitySettings.dateOverrides.push({ ...s, id: s.date });
                        });
                        capacitySettings.dateOverrides.sort(function(a, b) { return a.date.localeCompare(b.date); });
                        renderOverrideTable();
                        invalidateCapacityCache();
                    })
                    .withFailureHandler(function(error) {
                        showAlert('新增失敗: ' + error.message, 'error');
                    })
                    .saveDateOverrideCapacityBatch(settings);
            } else {
                showAlert('尚未連接 Firebase，設定未儲存', 'error');
            }
        }

        function deleteDateOverrideById(id) {
            if (document.body.dataset.shopRole === 'viewer') {
                showAlert('此帳號只有檢視權限', 'error');
                return;
            }
            if (!confirm('確定要刪除此日期覆寫設定？')) return;

            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function() {
                        showAlert('已刪除日期覆寫設定', 'success');
                        capacitySettings.dateOverrides = capacitySettings.dateOverrides.filter(function(o) { return o.id !== id && o.date !== id; });
                        renderOverrideTable();
                        invalidateCapacityCache();
                    })
                    .withFailureHandler(function(error) {
                        showAlert('刪除失敗: ' + error.message, 'error');
                    })
                    .deleteDateOverrideCapacity(id);
            } else {
                showAlert('尚未連接 Firebase，設定未刪除', 'error');
            }
        }

        // ==========================================
        //        日曆產能指標
        // ==========================================

        // 正在請求中的月份 key -> callback 佇列，防止重複請求
        const capacityInflight = {};

        function loadMonthCapacity(year, month, callback) {
            const key = year + '-' + month;

            // 已有快取，直接回傳
            if (monthCapacityCache[key]) {
                if (callback) callback(monthCapacityCache[key]);
                return;
            }

            // 已有同月份的請求正在進行中，把 callback 排入佇列
            if (capacityInflight[key]) {
                if (callback) capacityInflight[key].push(callback);
                return;
            }

            // 標記為進行中
            capacityInflight[key] = callback ? [callback] : [];

            function resolveCallbacks(data) {
                monthCapacityCache[key] = data;
                const cbs = capacityInflight[key] || [];
                delete capacityInflight[key];
                cbs.forEach(function(cb) { cb(data); });
            }

            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(function(result) {
                        resolveCallbacks(result);
                    })
                    .withFailureHandler(function(error) {
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
        function invalidateCapacityCache() {
            monthCapacityCache = {};
        }

        function getCapacityIndicatorHtml(info) {
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

        // ==========================================
        //        產能檢查 & 警告 Modal
        // ==========================================

        // ---- 送單狀態控制 ----
        let orderSubmitWatchdog = null;

        /**
         * 開始送單：上鎖 + 按鈕載入 + 全螢幕處理中遮罩 + 逾時保護
         */
        function beginOrderSubmit() {
            isSubmittingOrder = true;
            const text = isEditingOrder ? '訂單更新中...' : '訂單建立中...';
            setButtonLoading(document.getElementById('checkoutBtn'), true, isEditingOrder ? '更新中...' : '建立中...');
            showOrderSubmitOverlay(text);

            // 逾時保護：避免後端無回應時畫面永久卡在處理中
            clearTimeout(orderSubmitWatchdog);
            orderSubmitWatchdog = setTimeout(function() {
                if (isSubmittingOrder) {
                    finishOrderSubmit();
                    showAlert('訂單送出逾時，請到訂單查詢確認是否已建立，避免重複送單', 'error');
                }
            }, 60000);
        }

        function showOrderSubmitOverlay(text) {
            const overlay = document.getElementById('orderSubmitOverlay');
            if (!overlay) return;
            document.getElementById('orderSubmitOverlayText').textContent = text || '訂單處理中...';
            overlay.classList.add('active');
        }

        function hideOrderSubmitOverlay() {
            const overlay = document.getElementById('orderSubmitOverlay');
            if (overlay) overlay.classList.remove('active');
        }

        // 結束送單狀態：解鎖、關閉遮罩、還原按鈕
        function finishOrderSubmit() {
            isSubmittingOrder = false;
            clearTimeout(orderSubmitWatchdog);
            orderSubmitWatchdog = null;
            hideOrderSubmitOverlay();
            setButtonLoading(document.getElementById('checkoutBtn'), false);
        }

        function checkCapacityAndSubmit(orderData) {
            if (typeof google !== 'undefined' && google.script && google.script.run) {
                submitOrderRequest(orderData, false);
            } else {
                finishOrderSubmit();
                showAlert('尚未連接 Firebase，訂單草稿已保留但不會送出', 'error');
            }
        }

        function showCapacityWarningModal(capacityStatus, orderData) {
            pendingOrderData = orderData;
            // 產能警告需使用者決定，先收起處理中遮罩（送單鎖維持到使用者確認或取消）
            hideOrderSubmitOverlay();
            setButtonLoading(document.getElementById('checkoutBtn'), false);
            closeCartModal();
            const body = document.getElementById('capacityWarningBody');
            const cs = capacityStatus;

            body.innerHTML =
                '<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; margin-bottom: 16px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">' +
                '<div style="display: flex; flex-direction: column;">' +
                '<span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">交貨日期</span>' +
                '<span style="font-size: 1rem; font-weight: 700; color: #1f2937;">' + escapeHtml(cs.date) + '</span>' +
                '</div>' +
                '<div style="display: flex; flex-direction: column;">' +
                '<span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">每日上限</span>' +
                '<span style="font-size: 1rem; font-weight: 700; color: #1f2937;">' + cs.limit + ' 件</span>' +
                '</div>' +
                '<div style="display: flex; flex-direction: column;">' +
                '<span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">目前已排定</span>' +
                '<span style="font-size: 1rem; font-weight: 700; color: #1f2937;">' + cs.currentQuantity + ' 件</span>' +
                '</div>' +
                '<div style="display: flex; flex-direction: column;">' +
                '<span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">本次訂單</span>' +
                '<span style="font-size: 1rem; font-weight: 700; color: #1f6f5f;">' + cs.newOrderQuantity + ' 件</span>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; display: flex; align-items: flex-start; gap: 12px;">' +
                '<i class="fas fa-exclamation-circle" style="color: #dc2626; margin-top: 2px; flex-shrink: 0;"></i>' +
                '<div>' +
                '<div style="font-weight: 700; color: #991b1b; margin-bottom: 4px;">送出後預計總量: ' + cs.projectedQuantity + ' 件，超出上限 ' + cs.exceededQuantity + ' 件</div>' +
                '<div style="font-size: 0.85rem; color: #7f1d1d;">此警告不會阻擋訂單建立，請確認是否繼續送出，或返回修改交貨日期。</div>' +
                '</div>' +
                '</div>';

            document.getElementById('capacityWarningModal').classList.add('active');
        }

        function closeCapacityWarningModal() {
            document.getElementById('capacityWarningModal').classList.remove('active');
            pendingOrderData = null;
            finishOrderSubmit();
        }

        function confirmCapacityOverride() {
            if (!pendingOrderData) return;
            const orderData = pendingOrderData;
            pendingOrderData = null;
            document.getElementById('capacityWarningModal').classList.remove('active');
            orderData.capacityOverrideConfirmed = true;
            if (typeof google !== 'undefined' && google.script && google.script.run) submitOrderRequest(orderData, true);
            else doSubmitOrder(orderData);
        }

        function submitOrderRequest(orderData, confirmed) {
            beginOrderSubmit();
            google.script.run
                .withSuccessHandler(function(result) {
                    if (result.needConfirm) {
                        showCapacityWarningModal(result.capacityStatus, orderData);
                        return;
                    }
                    finishOrderSubmit();
                    invalidateCapacityCache();
                    if (isEditingOrder) handleOrderUpdated(result);
                    else handleOrderSubmitted(result);
                })
                .withFailureHandler(function(error) {
                    finishOrderSubmit();
                    handleError(error);
                })
                .submitOrder(orderData, {
                    orderId: isEditingOrder ? editingOrderId : null,
                    confirmed: confirmed
                });
        }

        function doSubmitOrder(orderData) {
            finishOrderSubmit();
            showAlert('尚未連接 Firebase，訂單草稿已保留但不會送出', 'error');
        }
