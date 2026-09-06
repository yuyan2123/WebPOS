(function initializeFirebaseRpcBridge() {
    'use strict';

    const SDK_VERSION = '12.18.0';
    const REGION = 'asia-east1';
    let firebaseStatePromise = null;
    let authWaiters = [];
    let activeUid = null;
    let activeShop = null;
    let availableShops = [];
    let shopSelectionPromise = null;
    let resolveShopSelection = null;
    let sessionBootstrapPromise = null;
    let shopsLoaded = false;
    const GLOBAL_METHODS = new Set(['listMyShops', 'createShop', 'registerDeviceSession']);

    function installAuthOverlay() {
        if (document.getElementById('firebaseAuthOverlay')) return;
        const style = document.createElement('style');
        style.textContent = `
            #firebaseAuthOverlay { position: fixed; inset: 0; z-index: 100000; display: none;
                place-items: center; padding: 24px; background: rgba(15, 23, 42, .72); backdrop-filter: blur(8px); }
            #firebaseAuthOverlay.active { display: grid; }
            .firebase-auth-card { width: min(420px, 100%); padding: 32px; border-radius: 22px; background: #fff;
                box-shadow: 0 24px 70px rgba(15, 23, 42, .3); text-align: center; font-family: inherit; }
            .firebase-auth-card i { color: #1f6f5f; font-size: 2.4rem; margin-bottom: 16px; }
            .firebase-auth-card h2 { margin: 0 0 10px; color: #1f2937; font-size: 1.5rem; }
            .firebase-auth-card p { margin: 0 0 22px; color: #64748b; line-height: 1.6; }
            #firebaseGoogleSignIn { width: 100%; border: 0; border-radius: 12px; padding: 14px 18px;
                color: #fff; background: #1f6f5f; font-size: 1rem; font-weight: 700; cursor: pointer; }
            #firebaseEmailAuth { display: grid; gap: 9px; margin-bottom: 14px; }
            #firebaseEmailAuth input { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 11px;
                padding: 12px 13px; color: #1f2937; background: #fff; font: 500 .95rem/1.2 inherit; }
            .firebase-auth-row { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
            .firebase-auth-primary { border: 0; border-radius: 11px; padding: 12px 14px; color: #fff;
                background: #1f6f5f; font-size: .94rem; font-weight: 700; cursor: pointer; }
            .firebase-auth-primary.firebase-auth-create { color: #175448; background: #e4f1ec; }
            #firebaseResetPassword { border: 0; padding: 2px; color: #64748b; background: transparent;
                font: 600 .82rem/1.2 inherit; cursor: pointer; }
            .firebase-auth-divider { display: flex; align-items: center; gap: 10px; margin: 13px 0; color: #94a3b8; font-size: .8rem; }
            .firebase-auth-divider::before, .firebase-auth-divider::after { content: ''; height: 1px; flex: 1; background: #e2e8f0; }
            #firebaseVerificationActions { display: none; gap: 9px; }
            #firebaseVerificationActions.active { display: grid; }
            .firebase-auth-secondary { width: 100%; border: 0; border-radius: 12px; padding: 12px 16px;
                color: #175448; background: #e4f1ec; font-size: .94rem; font-weight: 700; cursor: pointer; }
            .firebase-auth-secondary.firebase-auth-muted { color: #475569; background: #f1f5f9; }
            .firebase-auth-card button:disabled { opacity: .58; cursor: wait; }
            #firebaseAuthError { min-height: 22px; margin-top: 12px; color: #dc2626; font-size: .9rem; }
            #firebaseAccountBadge { position: fixed; left: 12px; bottom: 12px; z-index: 90000; display: none;
                align-items: center; gap: 8px; max-width: min(360px, calc(100vw - 24px)); padding: 7px 9px 7px 12px;
                border: 1px solid #e2e8f0; border-radius: 999px; background: rgba(255,255,255,.94);
                box-shadow: 0 6px 24px rgba(15,23,42,.12); color: #475569; font: 600 .75rem/1.2 inherit; }
            #firebaseAccountBadge.active { display: flex; }
            #firebaseAccountEmail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            #firebaseSignOut { border: 0; border-radius: 999px; padding: 6px 9px; color: #475569;
                background: #f1f5f9; font: 700 .72rem/1 inherit; cursor: pointer; white-space: nowrap; }
            #firebaseShopButton { border: 0; border-radius: 999px; padding: 6px 9px; color: #175448;
                background: #e4f1ec; font: 700 .72rem/1 inherit; cursor: pointer; white-space: nowrap; }
            #firebaseShopOverlay { position: fixed; inset: 0; z-index: 100001; display: none; place-items: center;
                padding: 20px; background: rgba(15,23,42,.72); backdrop-filter: blur(8px); }
            #firebaseShopOverlay.active { display: grid; }
            .firebase-shop-card { width: min(680px, 100%); max-height: min(820px, calc(100vh - 40px)); overflow: auto;
                padding: 26px; border-radius: 22px; background: #fff; box-shadow: 0 24px 70px rgba(15,23,42,.3); font-family: inherit; }
            .firebase-shop-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
            .firebase-shop-head h2 { margin: 0; color: #1f2937; font-size: 1.45rem; }
            #firebaseShopClose { border: 0; background: #f1f5f9; color: #64748b; width: 36px; height: 36px;
                border-radius: 50%; font-size: 1.2rem; cursor: pointer; }
            #firebaseShopClose:disabled { display: none; }
            #firebaseShopList { display: grid; gap: 9px; margin-bottom: 20px; }
            .firebase-shop-option { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px;
                padding: 13px 15px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; color: #334155;
                text-align: left; cursor: pointer; }
            .firebase-shop-option.active { border-color: #1f6f5f; background: #f1f8f5; color: #175448; }
            .firebase-shop-role { flex: none; padding: 3px 8px; border-radius: 999px; background: #f1f5f9; font-size: .72rem; }
            .firebase-shop-form { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
            .firebase-shop-form input, .firebase-shop-form select { min-width: 0; padding: 10px 12px; border: 1px solid #cbd5e1;
                border-radius: 9px; background: #fff; color: #334155; }
            .firebase-shop-form button, .firebase-shop-action { border: 0; border-radius: 9px; padding: 10px 14px;
                background: #1f6f5f; color: #fff; font-weight: 700; cursor: pointer; }
            #firebaseShopAdmin { display: none; margin-top: 22px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
            #firebaseShopAdmin.active { display: block; }
            .firebase-shop-meta { margin: 4px 0 14px; color: #64748b; font-size: .78rem; word-break: break-all; }
            .firebase-member-row { display: grid; grid-template-columns: minmax(0,1fr) auto auto; align-items: center; gap: 8px;
                padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
            .firebase-member-email { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #334155; font-size: .88rem; }
            .firebase-member-row select { padding: 7px; border: 1px solid #cbd5e1; border-radius: 8px; }
            .firebase-member-remove { border: 0; border-radius: 8px; padding: 8px; color: #dc2626; background: #fef2f2; cursor: pointer; }
            #firebaseShopMessage { min-height: 22px; margin-top: 10px; color: #dc2626; font-size: .85rem; }
            @media (max-width: 560px) {
                .firebase-shop-form { grid-template-columns: 1fr; }
                .firebase-member-row { grid-template-columns: minmax(0,1fr) auto; }
                .firebase-member-remove { grid-column: 2; }
            }
        `;
        document.head.appendChild(style);
        const overlay = document.createElement('div');
        overlay.id = 'firebaseAuthOverlay';
        overlay.innerHTML = `
            <div class="firebase-auth-card">
                <i class="fas fa-cash-register" aria-hidden="true"></i>
                <h2 id="firebaseAuthTitle">登入WebPOS</h2>
                <p id="firebaseAuthDescription">請使用已授權的 Google 帳號登入，才能存取訂單與客戶資料。</p>
                <div id="firebaseEmailAuth">
                    <input id="firebaseAuthEmail" type="email" autocomplete="email" placeholder="Email" aria-label="Email">
                    <input id="firebaseAuthPassword" type="password" minlength="6" autocomplete="current-password" placeholder="密碼（至少 6 個字元）" aria-label="密碼">
                    <div class="firebase-auth-row">
                        <button id="firebaseEmailSignIn" class="firebase-auth-primary" type="button">Email 登入</button>
                        <button id="firebaseEmailRegister" class="firebase-auth-primary firebase-auth-create" type="button">建立帳號</button>
                    </div>
                    <button id="firebaseResetPassword" type="button">忘記密碼？寄送重設信</button>
                </div>
                <div id="firebaseAuthDivider" class="firebase-auth-divider">或</div>
                <button id="firebaseGoogleSignIn" type="button">使用 Google 帳號登入</button>
                <div id="firebaseVerificationActions">
                    <button id="firebaseSendVerification" class="firebase-auth-secondary" type="button">重新寄送驗證信</button>
                    <button id="firebaseRefreshVerification" class="firebase-auth-secondary" type="button">我已驗證，重新檢查</button>
                    <button id="firebaseVerificationSignOut" class="firebase-auth-secondary firebase-auth-muted" type="button">改用其他帳號</button>
                </div>
                <div id="firebaseAuthError" role="alert"></div>
            </div>`;
        document.body.appendChild(overlay);
        const badge = document.createElement('div');
        badge.id = 'firebaseAccountBadge';
        badge.innerHTML = '<span id="firebaseAccountEmail"></span><button id="firebaseShopButton" type="button">選擇店鋪</button><button id="firebaseSignOut" type="button">登出</button>';
        document.body.appendChild(badge);

        const shopOverlay = document.createElement('div');
        shopOverlay.id = 'firebaseShopOverlay';
        shopOverlay.innerHTML = `
            <div class="firebase-shop-card">
                <div class="firebase-shop-head">
                    <h2>我的店鋪</h2>
                    <button id="firebaseShopClose" type="button" aria-label="關閉">&times;</button>
                </div>
                <div id="firebaseShopList"></div>
                <div class="firebase-shop-form">
                    <input id="firebaseNewShopName" type="text" maxlength="60" placeholder="新店鋪名稱">
                    <button id="firebaseCreateShop" type="button">建立店鋪</button>
                </div>
                <div id="firebaseShopAdmin">
                    <h3 style="margin:0;color:#334155;">店鋪與成員管理</h3>
                    <div id="firebaseShopMeta" class="firebase-shop-meta"></div>
                    <div class="firebase-shop-form" style="padding-top:0;border-top:0;margin-bottom:14px;">
                        <input id="firebaseRenameShopName" type="text" maxlength="60" placeholder="店鋪名稱">
                        <button id="firebaseRenameShop" type="button">重新命名</button>
                    </div>
                    <div class="firebase-shop-form" style="grid-template-columns:minmax(0,1fr) auto auto;">
                        <input id="firebaseMemberEmail" type="email" placeholder="成員帳號 Email">
                        <select id="firebaseMemberRole"><option value="editor">可編輯</option><option value="viewer">僅檢視</option></select>
                        <button id="firebaseAddMember" type="button">新增成員</button>
                    </div>
                    <div id="firebaseMemberList" style="margin-top:12px;"></div>
                </div>
                <div id="firebaseShopMessage" role="alert"></div>
            </div>`;
        document.body.appendChild(shopOverlay);
    }

    function showAuthOverlay(message, mode, user) {
        installAuthOverlay();
        const verificationMode = mode === 'verify';
        const title = document.getElementById('firebaseAuthTitle');
        const description = document.getElementById('firebaseAuthDescription');
        const emailAuth = document.getElementById('firebaseEmailAuth');
        const divider = document.getElementById('firebaseAuthDivider');
        const googleButton = document.getElementById('firebaseGoogleSignIn');
        const verificationActions = document.getElementById('firebaseVerificationActions');
        if (title) title.textContent = verificationMode ? '請驗證 Email' : '登入WebPOS';
        if (description) {
            description.textContent = verificationMode
                ? `驗證信已寄到 ${user?.email || '您的信箱'}。完成驗證前，系統不會讀取任何店鋪資料。`
                : '請使用 Email 或 Google 帳號登入。完成 Email 驗證後才能存取店鋪資料。';
        }
        if (emailAuth) emailAuth.style.display = verificationMode ? 'none' : 'grid';
        if (divider) divider.style.display = verificationMode ? 'none' : 'flex';
        if (googleButton) googleButton.style.display = verificationMode ? 'none' : 'block';
        verificationActions?.classList.toggle('active', verificationMode);
        const error = document.getElementById('firebaseAuthError');
        if (error) error.textContent = message || '';
        document.getElementById('firebaseAuthOverlay').classList.add('active');
    }

    function hideAuthOverlay() {
        document.getElementById('firebaseAuthOverlay')?.classList.remove('active');
    }

    function escapeMarkup(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function roleLabel(role) {
        return role === 'owner' ? '擁有者' : role === 'editor' ? '可編輯' : '僅檢視';
    }

    function setShopMessage(message, success) {
        const element = document.getElementById('firebaseShopMessage');
        if (!element) return;
        element.textContent = message || '';
        element.style.color = success ? '#047857' : '#dc2626';
    }

    function shopStorageKey() {
        return `ginJiaPos.activeShop.${activeUid || 'anonymous'}`;
    }

    async function rawRpc(state, method, args, shopId) {
        const remote = state.functionsSdk.httpsCallable(state.functions, 'posRpc');
        const result = await remote({ method, args: args || [], shopId: shopId || null });
        return result.data;
    }

    function getOrCreateDeviceId() {
        const key = 'ginJiaPos.deviceId';
        const existing = localStorage.getItem(key);
        if (/^[A-Za-z0-9._-]{16,128}$/.test(existing || '')) return existing;
        const generated = typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : Array.from(crypto.getRandomValues(new Uint8Array(24)), (value) => value.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(key, generated);
        return generated;
    }

    async function ensureSessionBootstrap(state) {
        const uid = state.auth.currentUser?.uid;
        if (!uid) return;
        if (!sessionBootstrapPromise || sessionBootstrapPromise.uid !== uid) {
            const promise = rawRpc(state, 'initializeSession', [{
                deviceId: getOrCreateDeviceId(),
                userAgent: navigator.userAgent || '',
            }], null);
            promise.uid = uid;
            sessionBootstrapPromise = promise;
        }
        try {
            const result = await sessionBootstrapPromise;
            availableShops = result?.shops || [];
            shopsLoaded = true;
            renderShopList();
        } catch (error) {
            sessionBootstrapPromise = null;
            shopsLoaded = false;
            throw error;
        }
    }

    function updateShopBadge() {
        const button = document.getElementById('firebaseShopButton');
        if (button) button.textContent = activeShop ? activeShop.name : '選擇店鋪';
    }

    function setAccountBadgeVisible(visible) {
        document.getElementById('firebaseAccountBadge')?.classList.toggle('active', Boolean(visible));
        document.body.classList.toggle('account-badge-visible', Boolean(visible));
    }

    async function activateShop(shop, reloadWhenChanged) {
        const changed = Boolean(activeShop && activeShop.shopId !== shop.shopId);
        if (changed && typeof window.saveOrderDraftNow === 'function') {
            try { await window.saveOrderDraftNow(); } catch (error) { console.warn('切換店鋪前保存草稿失敗', error); }
        }
        activeShop = shop;
        document.body.dataset.shopRole = shop.role || 'viewer';
        document.body.dataset.shopId = shop.shopId;
        localStorage.setItem(shopStorageKey(), shop.shopId);
        updateShopBadge();
        window.posCapabilities = Object.freeze({
            role: shop.role || 'viewer',
            canRead: true,
            canEdit: shop.role === 'owner' || shop.role === 'editor',
            canManageShop: shop.role === 'owner',
        });
        window.dispatchEvent(new CustomEvent('pos:shop-changed', { detail: { shop: { ...shop } } }));
        document.getElementById('firebaseShopOverlay')?.classList.remove('active');
        if (resolveShopSelection) {
            resolveShopSelection(shop);
            resolveShopSelection = null;
            shopSelectionPromise = null;
        }
        if (changed && reloadWhenChanged) location.reload();
    }

    function renderShopList() {
        const list = document.getElementById('firebaseShopList');
        if (!list) return;
        if (availableShops.length === 0) {
            list.innerHTML = '<div style="padding:18px;border-radius:12px;background:#f8fafc;color:#64748b;text-align:center;">尚未建立店鋪，請先建立第一間店鋪。</div>';
            return;
        }
        list.innerHTML = availableShops.map((shop) => `
            <button type="button" class="firebase-shop-option ${activeShop?.shopId === shop.shopId ? 'active' : ''}" data-shop-id="${escapeMarkup(shop.shopId)}">
                <span><strong>${escapeMarkup(shop.name)}</strong></span>
                <span class="firebase-shop-role">${shop.role === 'owner' && shop.ownerUid && shop.ownerUid !== activeUid ? 'admin' : roleLabel(shop.role)}</span>
            </button>`).join('');
        list.querySelectorAll('.firebase-shop-option').forEach((button) => {
            button.addEventListener('click', () => {
                const shop = availableShops.find((item) => item.shopId === button.dataset.shopId);
                if (shop) activateShop(shop, true);
            });
        });
    }

    function showShopOverlay(required) {
        renderShopList();
        const close = document.getElementById('firebaseShopClose');
        if (close) close.disabled = Boolean(required);
        document.getElementById('firebaseShopOverlay').classList.add('active');
    }

    async function refreshShops(state) {
        availableShops = await rawRpc(state, 'listMyShops', [], null);
        shopsLoaded = true;
        renderShopList();
        return availableShops;
    }

    async function ensureActiveShop(state) {
        if (activeShop) return activeShop;
        if (shopSelectionPromise) return shopSelectionPromise;
        shopSelectionPromise = (async function() {
            const shops = shopsLoaded ? availableShops : await refreshShops(state);
            const savedId = localStorage.getItem(shopStorageKey());
            const preferred = shops.find((shop) => shop.shopId === savedId) || (shops.length === 1 ? shops[0] : null);
            if (preferred) {
                await activateShop(preferred, false);
                shopSelectionPromise = null;
                return preferred;
            }
            showShopOverlay(true);
            return new Promise((resolve) => { resolveShopSelection = resolve; });
        })();
        return shopSelectionPromise;
    }

    function renderMembers(members) {
        const list = document.getElementById('firebaseMemberList');
        if (!list) return;
        list.innerHTML = members.map((member) => {
            const owner = member.role === 'owner';
            return `<div class="firebase-member-row" data-member-uid="${escapeMarkup(member.uid)}">
                <div class="firebase-member-email"><strong>${escapeMarkup(member.email || member.name || member.uid)}</strong></div>
                ${owner
                    ? '<span class="firebase-shop-role">擁有者</span>'
                    : `<select class="firebase-member-role"><option value="editor" ${member.role === 'editor' ? 'selected' : ''}>可編輯</option><option value="viewer" ${member.role === 'viewer' ? 'selected' : ''}>僅檢視</option></select>
                       <button type="button" class="firebase-member-remove" aria-label="移除成員"><i class="fas fa-trash"></i></button>`}
            </div>`;
        }).join('');
        list.querySelectorAll('.firebase-member-role').forEach((select) => {
            select.addEventListener('change', async () => {
                const row = select.closest('.firebase-member-row');
                const state = await ensureSignedIn();
                try {
                    await rawRpc(state, 'updateShopMemberRole', [{ uid: row.dataset.memberUid, role: select.value }], activeShop.shopId);
                    setShopMessage('成員權限已更新', true);
                } catch (error) {
                    setShopMessage(error.message);
                    await loadMembers(state);
                }
            });
        });
        list.querySelectorAll('.firebase-member-remove').forEach((button) => {
            button.addEventListener('click', async () => {
                const row = button.closest('.firebase-member-row');
                if (!confirm('確定要移除此店鋪成員？')) return;
                const state = await ensureSignedIn();
                try {
                    await rawRpc(state, 'removeShopMember', [row.dataset.memberUid], activeShop.shopId);
                    setShopMessage('成員已移除', true);
                    await loadMembers(state);
                } catch (error) {
                    setShopMessage(error.message);
                }
            });
        });
    }

    async function loadMembers(state) {
        if (!activeShop || activeShop.role !== 'owner') return;
        const members = await rawRpc(state, 'listShopMembers', [], activeShop.shopId);
        renderMembers(members);
    }

    async function openShopManager(required) {
        const state = await ensureSignedIn();
        await refreshShops(state);
        const current = activeShop && availableShops.find((shop) => shop.shopId === activeShop.shopId);
        activeShop = current || null;
        updateShopBadge();
        showShopOverlay(Boolean(required || !activeShop));
        const admin = document.getElementById('firebaseShopAdmin');
        if (activeShop?.role === 'owner') {
            admin.classList.add('active');
            document.getElementById('firebaseShopMeta').textContent = `店鋪 ID：${activeShop.shopId}`;
            document.getElementById('firebaseRenameShopName').value = activeShop.name;
            await loadMembers(state);
        } else {
            admin.classList.remove('active');
        }
    }

    function installShopEventHandlers() {
        document.getElementById('firebaseShopButton').addEventListener('click', () => {
            openShopManager(false).catch((error) => setShopMessage(error.message));
        });
        document.getElementById('firebaseShopClose').addEventListener('click', () => {
            document.getElementById('firebaseShopOverlay').classList.remove('active');
        });
        document.getElementById('firebaseCreateShop').addEventListener('click', async function() {
            const nameInput = document.getElementById('firebaseNewShopName');
            const name = nameInput.value.trim();
            this.disabled = true;
            try {
                const state = await ensureSignedIn();
                const result = await rawRpc(state, 'createShop', [{ name }], null);
                availableShops.push(result.shop);
                nameInput.value = '';
                activateShop(result.shop, Boolean(activeShop));
                setShopMessage('店鋪已建立', true);
            } catch (error) {
                setShopMessage(error.message);
            } finally {
                this.disabled = false;
            }
        });
        document.getElementById('firebaseRenameShop').addEventListener('click', async function() {
            const name = document.getElementById('firebaseRenameShopName').value.trim();
            try {
                const state = await ensureSignedIn();
                await rawRpc(state, 'renameShop', [name], activeShop.shopId);
                activeShop.name = name;
                availableShops = availableShops.map((shop) => shop.shopId === activeShop.shopId ? { ...shop, name } : shop);
                updateShopBadge();
                renderShopList();
                setShopMessage('店鋪名稱已更新', true);
            } catch (error) {
                setShopMessage(error.message);
            }
        });
        document.getElementById('firebaseAddMember').addEventListener('click', async function() {
            const emailInput = document.getElementById('firebaseMemberEmail');
            const roleInput = document.getElementById('firebaseMemberRole');
            this.disabled = true;
            try {
                const state = await ensureSignedIn();
                await rawRpc(state, 'addShopMember', [{ email: emailInput.value.trim(), role: roleInput.value }], activeShop.shopId);
                emailInput.value = '';
                setShopMessage('成員已加入店鋪', true);
                await loadMembers(state);
            } catch (error) {
                setShopMessage(error.message);
            } finally {
                this.disabled = false;
            }
        });
    }

    async function loadFirebaseConfig() {
        if (window.__FIREBASE_CONFIG__) return window.__FIREBASE_CONFIG__;
        const response = await fetch('/__/firebase/init.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('找不到 Firebase 專案設定。請透過 Firebase Hosting 或 Emulator 開啟此頁面。');
        }
        return response.json();
    }

    async function initializeFirebase() {
        if (firebaseStatePromise) return firebaseStatePromise;
        firebaseStatePromise = (async function() {
            const [appSdk, authSdk, functionsSdk, config] = await Promise.all([
                import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
                import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
                import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-functions.js`),
                loadFirebaseConfig(),
            ]);
            const app = appSdk.initializeApp(config);
            const auth = authSdk.getAuth(app);
            const appCheckSiteKey = String(window.__POS_RUNTIME_CONFIG__?.appCheckSiteKey || '').trim();
            if (appCheckSiteKey) {
                const appCheckSdk = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-check.js`);
                appCheckSdk.initializeAppCheck(app, {
                    provider: new appCheckSdk.ReCaptchaEnterpriseProvider(appCheckSiteKey),
                    isTokenAutoRefreshEnabled: true,
                });
            }
            const functions = functionsSdk.getFunctions(app, REGION);
            await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);

            const localHost = ['localhost', '127.0.0.1'].includes(location.hostname);
            if (localHost) {
                authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
                functionsSdk.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
            }

            installAuthOverlay();
            installShopEventHandlers();
            async function withEmailCredentials(button, action) {
                const email = document.getElementById('firebaseAuthEmail').value.trim();
                const password = document.getElementById('firebaseAuthPassword').value;
                if (!email || password.length < 6) {
                    showAuthOverlay('請輸入有效的 Email，密碼至少需要 6 個字元。');
                    return;
                }
                button.disabled = true;
                try {
                    await action(email, password);
                } catch (error) {
                    showAuthOverlay(error.message || '帳號操作失敗，請稍後再試');
                } finally {
                    button.disabled = false;
                }
            }
            document.getElementById('firebaseEmailSignIn').addEventListener('click', function() {
                return withEmailCredentials(this, async (email, password) => {
                    const credential = await authSdk.signInWithEmailAndPassword(auth, email, password);
                    if (!credential.user.emailVerified) showAuthOverlay('', 'verify', credential.user);
                });
            });
            document.getElementById('firebaseEmailRegister').addEventListener('click', function() {
                return withEmailCredentials(this, async (email, password) => {
                    const credential = await authSdk.createUserWithEmailAndPassword(auth, email, password);
                    await authSdk.sendEmailVerification(credential.user);
                    showAuthOverlay('驗證信已寄出，請開啟信中的連結。', 'verify', credential.user);
                });
            });
            document.getElementById('firebaseResetPassword').addEventListener('click', async function() {
                const email = document.getElementById('firebaseAuthEmail').value.trim();
                if (!email) {
                    showAuthOverlay('請先輸入要重設密碼的 Email。');
                    return;
                }
                this.disabled = true;
                try {
                    await authSdk.sendPasswordResetEmail(auth, email);
                    showAuthOverlay('如果此帳號存在，密碼重設信將寄到該信箱。');
                } catch (_error) {
                    showAuthOverlay('如果此帳號存在，密碼重設信將寄到該信箱。');
                } finally {
                    this.disabled = false;
                }
            });
            document.getElementById('firebaseGoogleSignIn').addEventListener('click', async function() {
                const button = this;
                button.disabled = true;
                try {
                    await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider());
                } catch (error) {
                    showAuthOverlay(error.message || '登入失敗，請稍後再試');
                } finally {
                    button.disabled = false;
                }
            });
            document.getElementById('firebaseSignOut').addEventListener('click', async function() {
                await authSdk.signOut(auth);
                location.reload();
            });
            document.getElementById('firebaseSendVerification').addEventListener('click', async function() {
                const button = this;
                button.disabled = true;
                try {
                    if (!auth.currentUser) throw new Error('登入狀態已失效，請重新登入');
                    await authSdk.sendEmailVerification(auth.currentUser);
                    showAuthOverlay('驗證信已重新寄出，請檢查收件匣與垃圾郵件。', 'verify', auth.currentUser);
                } catch (error) {
                    showAuthOverlay(error.message || '無法寄送驗證信，請稍後再試', 'verify', auth.currentUser);
                } finally {
                    button.disabled = false;
                }
            });
            document.getElementById('firebaseRefreshVerification').addEventListener('click', async function() {
                const button = this;
                button.disabled = true;
                try {
                    if (!auth.currentUser) throw new Error('登入狀態已失效，請重新登入');
                    await auth.currentUser.reload();
                    await auth.currentUser.getIdToken(true);
                    if (auth.currentUser.emailVerified) location.reload();
                    else showAuthOverlay('尚未確認驗證完成，請開啟信中的驗證連結。', 'verify', auth.currentUser);
                } catch (error) {
                    showAuthOverlay(error.message || '無法更新驗證狀態', 'verify', auth.currentUser);
                } finally {
                    button.disabled = false;
                }
            });
            document.getElementById('firebaseVerificationSignOut').addEventListener('click', async function() {
                await authSdk.signOut(auth);
                location.reload();
            });

            await new Promise((resolve) => {
                let initialStateResolved = false;
                authSdk.onAuthStateChanged(auth, (user) => {
                    if (user?.emailVerified) {
                        if (activeUid && activeUid !== user.uid) {
                            location.reload();
                            return;
                        }
                        activeUid = user.uid;
                        document.body.dataset.userId = user.uid;
                        hideAuthOverlay();
                        document.getElementById('firebaseAccountEmail').textContent = `✓ ${user.email || user.uid}`;
                        setAccountBadgeVisible(true);
                        authWaiters.splice(0).forEach((waiter) => waiter.resolve(user));
                    } else if (user) {
                        activeUid = user.uid;
                        document.body.dataset.userId = user.uid;
                        activeShop = null;
                        availableShops = [];
                        updateShopBadge();
                        setAccountBadgeVisible(false);
                        showAuthOverlay('', 'verify', user);
                    } else {
                        activeUid = null;
                        delete document.body.dataset.userId;
                        delete document.body.dataset.shopId;
                        delete document.body.dataset.shopRole;
                        activeShop = null;
                        availableShops = [];
                        updateShopBadge();
                        setAccountBadgeVisible(false);
                        showAuthOverlay();
                    }
                    if (!initialStateResolved) {
                        initialStateResolved = true;
                        resolve();
                    }
                });
            });
            return { auth, functions, functionsSdk };
        })().catch((error) => {
            showAuthOverlay(error.message);
            throw error;
        });
        return firebaseStatePromise;
    }

    async function ensureSignedIn() {
        const state = await initializeFirebase();
        if (state.auth.currentUser?.emailVerified) return state;
        if (state.auth.currentUser) showAuthOverlay('', 'verify', state.auth.currentUser);
        else showAuthOverlay();
        await new Promise((resolve, reject) => authWaiters.push({ resolve, reject }));
        return state;
    }

    async function invoke(functionName, args) {
        const state = await ensureSignedIn();
        try {
            await ensureSessionBootstrap(state);
            if (GLOBAL_METHODS.has(functionName)) {
                return await rawRpc(state, functionName, args, null);
            }
            const shop = await ensureActiveShop(state);
            return await rawRpc(state, functionName, args, shop.shopId);
        } catch (error) {
            if (String(error.code || '').includes('unauthenticated')) showAuthOverlay();
            if (String(error.code || '').includes('failed-precondition') && /Email|驗證/.test(error.message || '')) {
                showAuthOverlay(error.message, 'verify', state.auth.currentUser);
            }
            throw error;
        }
    }

    function createRunner() {
        let successHandler = function() {};
        let failureHandler = function(error) { console.error(error); };
        return new Proxy({}, {
            get: function(_target, property) {
                if (property === 'withSuccessHandler') {
                    return function(handler) { successHandler = handler || successHandler; return this; };
                }
                if (property === 'withFailureHandler') {
                    return function(handler) { failureHandler = handler || failureHandler; return this; };
                }
                return function(...args) {
                    invoke(String(property), args).then(successHandler).catch(failureHandler);
                };
            }
        });
    }

    window.posApi = Object.freeze({ call: invoke });
    window.google = window.google || {};
    window.google.script = window.google.script || {};
    Object.defineProperty(window.google.script, 'run', {
        configurable: false,
        enumerable: true,
        get: createRunner,
    });

    document.addEventListener('DOMContentLoaded', function() {
        initializeFirebase().catch(console.error);
    });
})();
