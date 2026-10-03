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
    let shopManagerLoading = false;
    let shopManagerRequired = false;
    let shopManagerView = 'select';
    let shopViewRevision = 0;
    let shopMembers = null;
    let shopMembersShopId = null;
    let membersLoading = false;
    let selectedMember = null;
    let passwordSetupUid = null;
    const GLOBAL_METHODS = new Set(['listMyShops', 'createShop', 'registerDeviceSession']);

    function authFailureMessage(error, fallback = '登入失敗，請稍後再試。') {
        const messages = new Map([
            ['auth/invalid-credential', 'Email 或密碼不正確，請確認後再試。'],
            ['auth/wrong-password', 'Email 或密碼不正確，請確認後再試。'],
            ['auth/user-not-found', 'Email 或密碼不正確，請確認後再試。'],
            ['auth/invalid-email', 'Email 格式不正確，請確認後再試。'],
            ['auth/network-request-failed', '目前無法連線，請檢查網路後重試。'],
            ['auth/too-many-requests', '嘗試次數過多，請稍後再試。'],
            ['auth/popup-blocked', '瀏覽器封鎖了 Google 登入視窗，請允許彈出式視窗後重試。'],
            ['auth/popup-closed-by-user', 'Google 登入已取消，可重新登入。'],
            ['auth/email-already-in-use', '此 Email 已有帳號，請直接登入。若曾使用 Google 登入，請先用 Google 登入，再從「使用者帳號 → 設定登入密碼」新增密碼。'],
            ['auth/weak-password', '密碼強度不足，請改用較長的密碼並搭配字母、數字與符號。'],
            ['auth/password-does-not-meet-requirements', '密碼不符合要求，請改用較長的密碼並搭配字母、數字與符號。'],
            ['auth/operation-not-allowed', '目前未啟用 Email／密碼登入，請聯絡管理者確認登入設定。'],
            ['auth/requires-recent-login', '請登出後重新使用 Google 登入，再設定登入密碼。'],
            ['auth/provider-already-linked', '此帳號已有登入密碼，請使用 Email 登入或重設密碼。'],
            ['auth/credential-already-in-use', '此 Email 已連結到其他帳號，請使用原本的帳號登入。'],
        ]);
        return messages.get(error?.code) || (String(error?.code || '').startsWith('auth/') ? fallback : error?.message || fallback);
    }

    function installAuthOverlay() {
        if (document.getElementById('firebaseAuthOverlay')) return;
        const style = document.createElement('style');
        style.textContent = `
            #firebaseAuthOverlay { position: fixed; inset: 0; z-index: 100000; display: none;
                place-items: center; padding: 24px; background: rgba(15, 23, 42, .72); backdrop-filter: blur(8px); }
            #firebaseAuthOverlay.active { display: grid; }
            .firebase-auth-card { width: min(420px, 100%); padding: 32px; border-radius: 22px; background: var(--gj-surface);
                box-shadow: 0 24px 70px rgba(15, 23, 42, .3); text-align: center; font-family: inherit; }
            .firebase-auth-card i { color: var(--gj-primary); font-size: 2.4rem; margin-bottom: 16px; }
            .firebase-auth-card h2 { margin: 0 0 10px; color: var(--gj-text); font-size: 1.5rem; }
            .firebase-auth-card p { margin: 0 0 22px; color: var(--gj-muted); line-height: 1.6; }
            #firebaseGoogleSignIn { width: 100%; min-height: 48px; display: flex; align-items: center; justify-content: center; gap: 10px;
                border: 1px solid var(--gj-border); border-radius: var(--gj-input-radius, 8px); padding: 12px 24px;
                color: var(--gj-text); background: var(--gj-input-surface); font-size: 14px; line-height: 20px; font-weight: 500; cursor: pointer; }
            #firebaseEmailAuth { display: grid; gap: 9px; margin-bottom: 14px; }
            #firebaseEmailAuth input { width: 100%; box-sizing: border-box; border: 1px solid var(--gj-border); border-radius: 11px;
                padding: 12px 13px; color: var(--gj-text); background: var(--gj-surface); font: 500 .95rem/1.2 inherit; }
            .firebase-auth-row { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
            .firebase-auth-primary { border: 0; border-radius: 11px; padding: 12px 14px; color: var(--gj-on-primary);
                background: var(--gj-primary); font-size: .94rem; font-weight: 700; cursor: pointer; }
            .firebase-auth-primary.firebase-auth-create { color: var(--gj-primary); background: var(--gj-primary-soft); }
            #firebaseResetPassword { border: 0; padding: 2px; color: var(--gj-muted); background: transparent;
                font: 600 .82rem/1.2 inherit; cursor: pointer; }
            #firebaseEmailSignIn[hidden], #firebaseResetPassword[hidden], #firebasePasswordSetupCancel[hidden], #firebaseSetPassword[hidden] { display: none !important; }
            .firebase-auth-divider { display: flex; align-items: center; gap: 10px; margin: 13px 0; color: var(--gj-muted); font-size: .8rem; }
            .firebase-auth-divider::before, .firebase-auth-divider::after { content: ''; height: 1px; flex: 1; background: var(--gj-border); }
            #firebaseVerificationActions { display: none; gap: 9px; }
            #firebaseVerificationActions.active { display: grid; }
            .firebase-auth-secondary { width: 100%; border: 0; border-radius: 12px; padding: 12px 16px;
                color: var(--gj-primary); background: var(--gj-primary-soft); font-size: .94rem; font-weight: 700; cursor: pointer; }
            .firebase-auth-secondary.firebase-auth-muted { color: var(--gj-muted); background: var(--gj-bg); }
            .firebase-auth-card button:disabled { opacity: .58; cursor: wait; }
            #firebaseAuthError { min-height: 22px; margin-top: 12px; color: var(--gj-danger); font-size: .9rem; }
            #firebaseAccountBadge { position: fixed; left: 12px; bottom: 12px; z-index: 90000; display: none;
                align-items: center; gap: 8px; max-width: min(360px, calc(100vw - 24px)); padding: 7px 9px 7px 12px;
                border: 1px solid var(--gj-border); border-radius: 999px; background: rgba(255,255,255,.94);
                box-shadow: 0 6px 24px rgba(15,23,42,.12); color: var(--gj-muted); font: 600 .75rem/1.2 inherit; }
            #firebaseAccountBadge.active { display: flex; }
            #firebaseAccountEmail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            #firebaseSignOut, #firebaseSetPassword { border: 0; border-radius: 999px; padding: 6px 9px; color: var(--gj-muted);
                background: var(--gj-bg); font: 700 .72rem/1 inherit; cursor: pointer; white-space: nowrap; }
            #firebaseSetPassword { min-height: 44px; font-size: 14px; }
            #firebaseShopButton { border: 0; border-radius: 999px; padding: 6px 9px; color: var(--gj-primary);
                background: var(--gj-primary-soft); font: 700 .72rem/1 inherit; cursor: pointer; white-space: nowrap; }
            #firebaseShopOverlay { position: fixed; inset: 0; z-index: 100001; display: none; place-items: center;
                padding: 20px; background: rgba(15,23,42,.72); backdrop-filter: blur(8px); }
            #firebaseShopOverlay.active { display: grid; }
            .firebase-loading-dots { display: inline-flex; font-size: 22px; font-weight: 700; line-height: 1; }
            .firebase-loading-dots span { animation: firebaseLoadingDot 1.2s ease-in-out infinite; }
            .firebase-loading-dots span:nth-child(2) { animation-delay: .15s; }
            .firebase-loading-dots span:nth-child(3) { animation-delay: .3s; }
            @keyframes firebaseLoadingDot { 0%, 60%, 100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
            @media (prefers-reduced-motion: reduce) { .firebase-loading-dots span { animation: none; } }
        `;
        document.head.appendChild(style);
        const overlay = document.createElement('div');
        overlay.id = 'firebaseAuthOverlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'firebaseAuthTitle');
        overlay.innerHTML = `
            <div class="firebase-auth-card">
                <img class="firebase-auth-brand" src="/icons/icon-192.png" width="48" height="48" alt="">
                <h2 id="firebaseAuthTitle">登入 WebPOS</h2>
                <p id="firebaseAuthDescription">請使用已授權的 Google 帳號登入，才能存取訂單與客戶資料。</p>
                <form id="firebaseEmailAuth" novalidate>
                    <div id="firebaseAuthValidation" class="gj-form-feedback" tabindex="-1" role="alert" aria-labelledby="firebaseAuthValidationTitle" hidden></div>
                    <div class="gj-field">
                        <label for="firebaseAuthEmail" class="gj-field-label">Email</label>
                        <input id="firebaseAuthEmail" type="email" required autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="name@example.com" class="gj-input">
                        <p id="firebaseAuthEmailError" class="gj-field-error" hidden></p>
                    </div>
                    <div class="gj-field">
                        <label for="firebaseAuthPassword" class="gj-field-label">密碼</label>
                        <div class="firebase-password-control">
                            <input id="firebaseAuthPassword" type="password" required minlength="6" autocomplete="current-password" aria-describedby="firebasePasswordHint" class="gj-input">
                            <button id="firebasePasswordToggle" type="button" aria-label="顯示密碼" aria-pressed="false">顯示</button>
                        </div>
                        <p id="firebaseAuthPasswordError" class="gj-field-error" hidden></p>
                        <p id="firebasePasswordHint" class="firebase-auth-hint">至少 6 個字元</p>
                    </div>
                    <button id="firebaseResetPassword" type="button">忘記密碼？寄送重設信</button>
                </form>
                <div class="firebase-auth-row gj-actions" id="firebaseCredentialActions">
                    <button id="firebasePasswordSetupCancel" class="gj-btn gj-btn--quiet" data-action="dismiss" type="button" hidden>取消</button>
                    <button id="firebaseEmailRegister" class="firebase-auth-primary firebase-auth-create gj-btn gj-btn--tonal" data-action="secondary" type="button">建立帳號</button>
                    <button id="firebaseEmailSignIn" class="firebase-auth-primary gj-btn gj-btn--primary" data-action="primary" type="submit" form="firebaseEmailAuth">Email 登入</button>
                </div>
                <div id="firebaseAuthDivider" class="firebase-auth-divider">或</div>
                <button id="firebaseGoogleSignIn" class="gj-social-button" type="button"><span class="gj-social-logo" aria-hidden="true"><img src="/icons/google-signin.png" width="20" height="20" alt=""></span><span class="firebase-auth-action-label">使用 Google 帳號登入</span></button>
                <div id="firebaseVerificationActions">
                    <button id="firebaseSendVerification" class="firebase-auth-secondary" type="button">重新寄送驗證信</button>
                    <div class="gj-actions">
                        <button id="firebaseVerificationSignOut" class="gj-btn gj-btn--quiet" data-action="dismiss" type="button">改用其他帳號</button>
                        <button id="firebaseRefreshVerification" class="gj-btn gj-btn--primary" data-action="primary" type="button">我已驗證，重新檢查</button>
                    </div>
                </div>
                <div id="firebaseAuthError" role="alert"></div>
                <p id="firebaseAuthProgress" class="firebase-auth-hint" role="status" hidden></p>
            </div>`;
        document.body.appendChild(overlay);
        const badge = document.createElement('div');
        badge.id = 'firebaseAccountBadge';
        badge.innerHTML = `
            <button id="firebasePrinterStatus" type="button" hidden><i class="fas fa-print" aria-hidden="true"></i><span class="printer-connection-mark" aria-hidden="true"></span><span class="sr-only" aria-live="polite"></span></button>
            <button id="firebaseShopButton" type="button">選擇店鋪</button>
            <button id="firebaseAccountToggle" type="button" aria-label="使用者帳號" aria-expanded="false" aria-controls="firebaseAccountMenu"><i class="fas fa-user" aria-hidden="true"></i></button>
            <div id="firebaseAccountMenu" hidden>
                <span id="firebaseAccountEmail"></span>
                <button id="firebaseSetPassword" type="button" hidden>設定登入密碼</button>
                <button id="firebaseSignOut" type="button">登出</button>
            </div>`;
        document.body.appendChild(badge);
        const accountToggle = document.getElementById('firebaseAccountToggle');
        accountToggle.addEventListener('click', () => {
            setAccountMenuOpen(accountToggle.getAttribute('aria-expanded') !== 'true');
        });
        document.addEventListener('click', (event) => {
            if (!accountToggle.contains(event.target) && !document.getElementById('firebaseAccountMenu').contains(event.target)) {
                setAccountMenuOpen(false);
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && accountToggle.getAttribute('aria-expanded') === 'true') {
                setAccountMenuOpen(false);
                accountToggle.focus();
            }
        });
        badge.addEventListener('focusout', (event) => {
            if (!badge.contains(event.relatedTarget)) setAccountMenuOpen(false);
        });

        const shopOverlay = document.createElement('div');
        shopOverlay.id = 'firebaseShopOverlay';
        shopOverlay.setAttribute('role', 'dialog');
        shopOverlay.setAttribute('aria-modal', 'true');
        shopOverlay.setAttribute('aria-labelledby', 'firebaseShopTitle');
        shopOverlay.setAttribute('aria-describedby', 'firebaseShopSubtitle');
        shopOverlay.innerHTML = `
            <div class="firebase-shop-card" data-view="select">
                <span class="firebase-shop-handle" aria-hidden="true"></span>
                <div class="firebase-shop-head">
                    <button id="firebaseShopBack" class="firebase-shop-icon-button" type="button" aria-label="返回店鋪列表" hidden><svg class="gj-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>
                    <div class="firebase-shop-heading"><h2 id="firebaseShopTitle" tabindex="-1">切換店鋪</h2><p id="firebaseShopSubtitle">選擇要使用的店鋪</p></div>
                    <button id="firebaseShopClose" class="firebase-shop-icon-button" type="button" aria-label="關閉店鋪視窗"><svg class="gj-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
                </div>
                <div id="firebaseShopTabs" class="firebase-shop-tabs" role="tablist" aria-label="店鋪設定" hidden>
                    <button id="firebaseShopDetailsTab" type="button" role="tab" aria-selected="true" aria-controls="firebaseShopDetails">店鋪資料</button>
                    <button id="firebaseShopMembersTab" type="button" role="tab" aria-selected="false" aria-controls="firebaseShopMembers" tabindex="-1">成員與權限</button>
                </div>
                <div class="firebase-shop-body">
                    <section data-shop-view="select" aria-label="店鋪列表">
                        <div id="firebaseShopLoading" role="status" hidden>載入店鋪資料中<span class="firebase-loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></div>
                        <div id="firebaseShopList"></div>
                    </section>
                    <section data-shop-view="create" aria-label="建立店鋪" hidden>
                        <form id="firebaseCreateShopForm" class="firebase-shop-form" novalidate>
                            <label for="firebaseNewShopName">店鋪名稱</label>
                            <input id="firebaseNewShopName" type="text" required minlength="2" maxlength="60" placeholder="例如：金家餅店" autocomplete="off" aria-describedby="firebaseNewShopHint" class="gj-input">
                            <p id="firebaseNewShopHint" class="firebase-shop-help">建立後會直接切換到新店鋪。</p>
                        </form>
                    </section>
                    <section id="firebaseShopDetails" data-shop-view="settings" role="tabpanel" aria-labelledby="firebaseShopDetailsTab" hidden>
                        <form id="firebaseRenameShopForm" class="firebase-shop-form" novalidate>
                            <label for="firebaseRenameShopName">店鋪名稱</label>
                            <input id="firebaseRenameShopName" type="text" required minlength="2" maxlength="60" autocomplete="off" aria-describedby="firebaseRenameShopHint" class="gj-input">
                            <p id="firebaseRenameShopHint" class="firebase-shop-help">名稱會同步更新給所有店鋪成員。</p>
                        </form>
                    </section>
                    <section id="firebaseShopMembers" data-shop-view="members" role="tabpanel" aria-labelledby="firebaseShopMembersTab" hidden>
                        <div class="firebase-members-heading"><span id="firebaseMemberCount">店鋪成員</span><button id="firebaseMembersRetry" type="button" hidden>重新載入</button></div>
                        <div id="firebaseMembersLoading" class="firebase-shop-empty" role="status" hidden>載入成員中…</div>
                        <div id="firebaseMemberList"></div>
                    </section>
                    <section data-shop-view="invite" aria-label="新增成員" hidden>
                        <form id="firebaseAddMemberForm" class="firebase-shop-form" novalidate>
                            <label for="firebaseMemberEmail">成員 Email</label>
                            <input id="firebaseMemberEmail" type="email" required autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="name@example.com" aria-describedby="firebaseMemberHint" class="gj-input">
                            <p id="firebaseMemberHint" class="firebase-shop-help">請對方先登入一次，並完成 Email 驗證。</p>
                            <label for="firebaseMemberRole">使用權限</label>
                            <select id="firebaseMemberRole" class="gj-input"><option value="editor">可編輯</option><option value="viewer">僅檢視</option></select>
                        </form>
                    </section>
                    <section data-shop-view="member" aria-label="成員設定" hidden>
                        <p id="firebaseSelectedMemberEmail" class="firebase-member-identity"></p>
                        <form id="firebaseMemberSettingsForm" class="firebase-shop-form">
                            <label for="firebaseSelectedMemberRole">使用權限</label>
                            <select id="firebaseSelectedMemberRole" class="gj-input"><option value="editor">可編輯</option><option value="viewer">僅檢視</option></select>
                            <p class="firebase-shop-help">僅檢視成員無法建立或修改訂單。</p>
                        </form>
                        <button id="firebaseRemoveMember" class="firebase-shop-remove" type="button">移除此成員</button>
                    </section>
                </div>
                <div id="firebaseShopMessage" role="alert" hidden></div>
                <div class="firebase-shop-footer">
                    <div data-shop-actions="select" class="firebase-shop-entry-actions">
                        <button id="firebaseOpenCreateShop" class="firebase-shop-secondary" type="button"><svg class="gj-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>建立店鋪</button>
                        <button id="firebaseOpenShopSettings" class="firebase-shop-secondary" type="button"><svg class="gj-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h4m4 0h8M4 12h10m4 0h2M4 18h2m4 0h10"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg>店鋪設定</button>
                    </div>
                    <div id="firebaseShopFormActions" class="gj-actions" hidden>
                        <button id="firebaseShopCancel" class="gj-btn gj-btn--quiet" data-action="dismiss" type="button">取消</button>
                        <button id="firebaseCreateShop" data-shop-actions="create" data-action="primary" class="firebase-shop-action gj-btn gj-btn--primary" type="submit" form="firebaseCreateShopForm" hidden>建立並切換</button>
                        <button id="firebaseRenameShop" data-shop-actions="settings" data-action="primary" class="firebase-shop-action gj-btn gj-btn--primary" type="submit" form="firebaseRenameShopForm" hidden>儲存名稱</button>
                        <button id="firebaseOpenAddMember" data-shop-actions="members" data-action="primary" class="firebase-shop-action gj-btn gj-btn--primary" type="button" hidden>新增成員</button>
                        <button id="firebaseAddMember" data-shop-actions="invite" data-action="primary" class="firebase-shop-action gj-btn gj-btn--primary" type="submit" form="firebaseAddMemberForm" hidden>新增成員</button>
                        <button id="firebaseSaveMember" data-shop-actions="member" data-action="primary" class="firebase-shop-action gj-btn gj-btn--primary" type="submit" form="firebaseMemberSettingsForm" hidden>儲存變更</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(shopOverlay);
    }

    function showAuthOverlay(message, mode, user) {
        installAuthOverlay();
        const verificationMode = mode === 'verify';
        const passwordMode = mode === 'password' || mode === 'password-complete';
        const passwordComplete = mode === 'password-complete';
        passwordSetupUid = passwordMode ? user?.uid : null;
        const title = document.getElementById('firebaseAuthTitle');
        const description = document.getElementById('firebaseAuthDescription');
        const emailAuth = document.getElementById('firebaseEmailAuth');
        const divider = document.getElementById('firebaseAuthDivider');
        const googleButton = document.getElementById('firebaseGoogleSignIn');
        const verificationActions = document.getElementById('firebaseVerificationActions');
        if (title) title.textContent = passwordComplete ? '登入密碼已設定' : passwordMode ? '設定登入密碼' : verificationMode ? '請驗證 Email' : '登入 WebPOS';
        if (description) {
            description.textContent = passwordComplete
                ? '之後可使用 Google 或 Email 與密碼登入同一個帳號，店鋪資料與權限保持一致。'
                : passwordMode
                ? '為目前的 Google 帳號新增登入密碼，之後也能使用 Email 登入。'
                : verificationMode
                ? `驗證信已寄到 ${user?.email || '您的信箱'}。完成驗證前，系統不會讀取任何店鋪資料。`
                : '請使用 Email 或 Google 帳號登入。完成 Email 驗證後才能存取店鋪資料。';
        }
        if (emailAuth) emailAuth.style.display = verificationMode || passwordComplete ? 'none' : 'grid';
        if (divider) divider.style.display = verificationMode || passwordMode ? 'none' : 'flex';
        if (googleButton) googleButton.style.display = verificationMode || passwordMode ? 'none' : 'flex';
        const email = document.getElementById('firebaseAuthEmail');
        email.readOnly = passwordMode;
        if (passwordMode) email.value = user.email;
        document.getElementById('firebaseAuthPassword').autocomplete = passwordMode ? 'new-password' : 'current-password';
        document.getElementById('firebaseEmailSignIn').hidden = passwordMode || verificationMode;
        const register = document.getElementById('firebaseEmailRegister');
        register.textContent = passwordMode ? '設定登入密碼' : '建立帳號';
        register.hidden = passwordComplete || verificationMode;
        register.classList.toggle('firebase-auth-create', !passwordMode);
        register.classList.toggle('gj-btn--tonal', !passwordMode);
        register.classList.toggle('gj-btn--primary', passwordMode);
        register.dataset.action = passwordMode ? 'primary' : 'secondary';
        document.getElementById('firebaseCredentialActions').hidden = verificationMode;
        document.getElementById('firebaseResetPassword').hidden = passwordMode;
        const cancel = document.getElementById('firebasePasswordSetupCancel');
        cancel.hidden = !passwordMode;
        cancel.textContent = passwordComplete ? '返回工作台' : '取消';
        verificationActions?.classList.toggle('active', verificationMode);
        const error = document.getElementById('firebaseAuthError');
        if (error) error.textContent = message || '';
        document.getElementById('firebaseAuthOverlay').classList.add('active');
        if (verificationMode && !verificationActions?.contains(document.activeElement)) {
            verificationActions?.querySelector('button:not(:disabled)')?.focus();
        }
    }

    function hideAuthOverlay() {
        document.getElementById('firebaseAuthOverlay')?.classList.remove('active');
        passwordSetupUid = null;
        const email = document.getElementById('firebaseAuthEmail');
        if (email) email.readOnly = false;
        const password = document.getElementById('firebaseAuthPassword');
        if (password) {
            password.value = '';
            password.type = 'password';
        }
        const toggle = document.getElementById('firebasePasswordToggle');
        if (toggle) {
            toggle.textContent = '顯示';
            toggle.setAttribute('aria-label', '顯示密碼');
            toggle.setAttribute('aria-pressed', 'false');
        }
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
        element.hidden = !message;
        element.setAttribute('role', success ? 'status' : 'alert');
        element.style.color = success ? 'var(--gj-success)' : 'var(--gj-danger)';
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

    async function ensureSessionBootstrap(state, bootstrapOptions) {
        const uid = state.auth.currentUser?.uid;
        if (!uid) return;
        if (!sessionBootstrapPromise || sessionBootstrapPromise.uid !== uid) {
            const promise = rawRpc(state, 'initializeSession', [{
                deviceId: getOrCreateDeviceId(),
                userAgent: navigator.userAgent || '',
            }, bootstrapOptions].filter((value) => value !== undefined), null);
            promise.uid = uid;
            sessionBootstrapPromise = promise;
        }
        try {
            const result = await sessionBootstrapPromise;
            availableShops = result?.shops || [];
            shopsLoaded = true;
            renderShopList();
            return result;
        } catch (error) {
            sessionBootstrapPromise = null;
            shopsLoaded = false;
            throw error;
        }
    }

    function updateShopBadge() {
        const button = document.getElementById('firebaseShopButton');
        if (button) {
            const name = activeShop ? activeShop.name : '選擇店鋪';
            const characters = Array.from(name);
            button.textContent = characters.length > 5 ? `${characters.slice(0, 5).join('')}...` : name;
            button.title = name;
            button.setAttribute('aria-label', name);
        }
    }

    function setAccountMenuOpen(open) {
        const menu = document.getElementById('firebaseAccountMenu');
        if (menu) menu.hidden = !open;
        document.getElementById('firebaseAccountToggle')?.setAttribute('aria-expanded', String(open));
    }

    function setAccountBadgeVisible(visible) {
        if (!visible) setAccountMenuOpen(false);
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
            list.innerHTML = '<div class="firebase-shop-empty">尚未建立店鋪<br>建立第一間店鋪，就能開始使用。</div>';
            return;
        }
        list.innerHTML = availableShops.map((shop) => `
            <button type="button" class="firebase-shop-option ${activeShop?.shopId === shop.shopId ? 'active' : ''}" data-shop-id="${escapeMarkup(shop.shopId)}" ${activeShop?.shopId === shop.shopId ? 'aria-current="true"' : ''}>
                <span class="firebase-shop-symbol" aria-hidden="true"><svg class="gj-icon" viewBox="0 0 24 24"><path d="M3 10v10h18V10M3 4h18l2 6H1ZM9 20v-7h6v7"/></svg></span>
                <span class="firebase-shop-option-copy"><strong>${escapeMarkup(shop.name)}</strong><span>${shop.role === 'owner' && shop.ownerUid && shop.ownerUid !== activeUid ? '管理員' : roleLabel(shop.role)}</span></span>
                ${activeShop?.shopId === shop.shopId
                    ? '<span class="firebase-shop-current">目前使用<svg class="gj-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg></span>'
                    : '<svg class="gj-icon firebase-shop-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'}
            </button>`).join('');
        list.querySelectorAll('.firebase-shop-option').forEach((button) => {
            button.addEventListener('click', async () => {
                const shop = availableShops.find((item) => item.shopId === button.dataset.shopId);
                if (!shop) return;
                list.inert = true;
                try { await activateShop(shop, true); }
                catch (error) { setShopMessage(error.message); }
                finally { list.inert = false; }
            });
        });
    }

    function canSetPassword(user) {
        return Boolean(user?.emailVerified && user.email &&
            user.providerData?.some(provider => provider.providerId === 'google.com') &&
            !user.providerData?.some(provider => provider.providerId === 'password'));
    }

    function updatePasswordSetupButton(user) {
        document.getElementById('firebaseSetPassword').hidden = !canSetPassword(user);
    }

    function showShopView(view, focus = true) {
        const canManage = activeShop?.role === 'owner';
        if (['settings', 'members', 'invite', 'member'].includes(view) && !canManage) view = 'select';
        shopManagerView = view;
        shopViewRevision++;
        const overlay = document.getElementById('firebaseShopOverlay');
        overlay.querySelector('.firebase-shop-card').dataset.view = view;
        overlay.querySelectorAll('[data-shop-view]').forEach((panel) => { panel.hidden = panel.dataset.shopView !== view; });
        overlay.querySelectorAll('[data-shop-actions]').forEach((actions) => { actions.hidden = actions.dataset.shopActions !== view; });
        document.getElementById('firebaseShopFormActions').hidden = view === 'select';
        document.getElementById('firebaseShopCancel').textContent = view === 'members' ? '返回店鋪列表' : '取消';
        const titles = { select: '切換店鋪', create: '建立店鋪', settings: '店鋪設定', members: '店鋪設定', invite: '新增成員', member: '成員設定' };
        const title = document.getElementById('firebaseShopTitle');
        title.textContent = titles[view];
        document.getElementById('firebaseShopSubtitle').textContent = view === 'select' ? '選擇要使用的店鋪' : view === 'create' ? '為新的店鋪取個名稱' : activeShop?.name || '';
        const back = document.getElementById('firebaseShopBack');
        back.hidden = view === 'select';
        back.setAttribute('aria-label', ['invite', 'member'].includes(view) ? '返回成員列表' : '返回店鋪列表');
        document.getElementById('firebaseOpenShopSettings').hidden = !canManage;
        document.getElementById('firebaseShopTabs').hidden = !['settings', 'members'].includes(view);
        for (const [id, target] of [['firebaseShopDetailsTab', 'settings'], ['firebaseShopMembersTab', 'members']]) {
            const tab = document.getElementById(id);
            tab.setAttribute('aria-selected', String(view === target));
            tab.tabIndex = view === target ? 0 : -1;
        }
        overlay.querySelectorAll('[aria-invalid]').forEach((input) => {
            input.removeAttribute('aria-invalid');
            input.removeAttribute('aria-errormessage');
        });
        setShopMessage('');
        overlay.querySelector('.firebase-shop-body').scrollTop = 0;
        if (focus && overlay.classList.contains('active')) title.focus({ preventScroll: true });
    }

    function closeShopManager() {
        if (shopManagerRequired) return;
        const overlay = document.getElementById('firebaseShopOverlay');
        overlay.classList.remove('active');
        requestAnimationFrame(async () => {
            // The account badge fades back in after the dialog closes. Chrome
            // cannot focus its button until the visibility transition finishes.
            const badge = document.getElementById('firebaseAccountBadge');
            await Promise.all(badge.getAnimations().map((animation) => animation.finished.catch(() => {})));
            if (!overlay.classList.contains('active')) document.getElementById('firebaseShopButton').focus({ preventScroll: true });
        });
    }

    function showShopOverlay(required) {
        shopManagerRequired = Boolean(required || !activeShop);
        showShopView('select', false);
        renderShopList();
        const close = document.getElementById('firebaseShopClose');
        if (close) close.disabled = shopManagerRequired;
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
        document.getElementById('firebaseMemberCount').textContent = `${members.length} 位成員`;
        if (!members.length) {
            list.innerHTML = '<div class="firebase-shop-empty">尚無成員資料</div>';
            return;
        }
        list.innerHTML = [...members].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner')).map((member) => {
            const owner = member.role === 'owner';
            const email = member.email || member.name || member.uid;
            return `<div class="firebase-member-row" data-member-uid="${escapeMarkup(member.uid)}">
                <span class="firebase-member-avatar" aria-hidden="true">${escapeMarkup(Array.from(email)[0]?.toUpperCase() || 'M')}</span>
                <div class="firebase-member-copy"><strong class="firebase-member-email">${escapeMarkup(email)}</strong><span>${roleLabel(member.role)}${member.uid === activeUid ? ' · 你' : ''}</span></div>
                ${owner
                    ? '<svg class="gj-icon firebase-member-owner" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-5"/></svg>'
                    : `<button type="button" class="firebase-member-manage firebase-shop-icon-button" aria-label="管理 ${escapeMarkup(email)}"><svg class="gj-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`}
            </div>`;
        }).join('');
        list.querySelectorAll('.firebase-member-manage').forEach((button) => {
            button.addEventListener('click', () => {
                selectedMember = members.find((member) => member.uid === button.closest('.firebase-member-row').dataset.memberUid);
                document.getElementById('firebaseSelectedMemberEmail').textContent = selectedMember.email || selectedMember.name || selectedMember.uid;
                document.getElementById('firebaseSelectedMemberRole').value = selectedMember.role;
                showShopView('member');
            });
        });
    }

    async function loadMembers(state) {
        if (!activeShop || activeShop.role !== 'owner') return;
        const shopId = activeShop.shopId;
        const members = await rawRpc(state, 'listShopMembers', [], shopId);
        if (activeShop?.shopId !== shopId) return;
        shopMembers = members;
        shopMembersShopId = shopId;
        renderMembers(members);
    }

    async function showShopMembers() {
        showShopView('members');
        if (shopMembers && shopMembersShopId === activeShop?.shopId) {
            renderMembers(shopMembers);
            return;
        }
        if (membersLoading) return;
        membersLoading = true;
        document.getElementById('firebaseMemberCount').textContent = '店鋪成員';
        const loading = document.getElementById('firebaseMembersLoading');
        const list = document.getElementById('firebaseMemberList');
        const retry = document.getElementById('firebaseMembersRetry');
        list.hidden = true;
        list.setAttribute('aria-busy', 'true');
        loading.hidden = false;
        retry.hidden = true;
        document.getElementById('firebaseOpenAddMember').disabled = true;
        try { await loadMembers(await ensureSignedIn()); }
        catch (error) {
            if (shopManagerView === 'members') setShopMessage(error.message);
            retry.hidden = false;
        } finally {
            membersLoading = false;
            loading.hidden = true;
            list.hidden = false;
            list.setAttribute('aria-busy', 'false');
            document.getElementById('firebaseOpenAddMember').disabled = false;
        }
    }

    async function openShopManager(required) {
        if (shopManagerLoading) return;
        shopManagerLoading = true;
        setShopMessage('');
        showShopOverlay(Boolean(required || !activeShop));
        const list = document.getElementById('firebaseShopList');
        const loading = document.getElementById('firebaseShopLoading');
        const forms = document.querySelectorAll('#firebaseShopOverlay .firebase-shop-form');
        list.hidden = true;
        list.setAttribute('aria-busy', 'true');
        loading.hidden = false;
        forms.forEach((form) => { form.inert = true; });
        document.getElementById('firebaseOpenCreateShop').disabled = true;
        document.getElementById('firebaseOpenShopSettings').disabled = true;
        try {
            const state = await ensureSignedIn();
            await refreshShops(state);
            const current = activeShop && availableShops.find((shop) => shop.shopId === activeShop.shopId);
            activeShop = current || null;
            updateShopBadge();
            shopManagerRequired = Boolean(required || !activeShop);
            document.getElementById('firebaseShopClose').disabled = shopManagerRequired;
            document.getElementById('firebaseOpenShopSettings').hidden = activeShop?.role !== 'owner';
            if (activeShop?.role === 'owner') {
                document.getElementById('firebaseRenameShopName').value = activeShop.name;
            }
            shopMembers = null;
            shopMembersShopId = null;
            document.getElementById('firebaseMemberList').replaceChildren();
        } finally {
            shopManagerLoading = false;
            loading.hidden = true;
            list.hidden = false;
            list.setAttribute('aria-busy', 'false');
            forms.forEach((form) => { form.inert = false; });
            document.getElementById('firebaseOpenCreateShop').disabled = false;
            document.getElementById('firebaseOpenShopSettings').disabled = false;
        }
    }

    function validateShopInput(id, message) {
        const input = document.getElementById(id);
        if (input.checkValidity() && input.value.trim().length >= (input.type === 'email' ? 1 : 2)) return true;
        setShopMessage(message);
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-errormessage', 'firebaseShopMessage');
        return false;
    }

    async function runShopAction(buttonId, progress, action) {
        const button = document.getElementById(buttonId);
        if (button.disabled) return;
        const label = button.textContent;
        const shopId = activeShop?.shopId;
        const view = shopManagerView;
        const revision = shopViewRevision;
        const stillCurrent = () => document.getElementById('firebaseShopOverlay').classList.contains('active') && activeShop?.shopId === shopId && shopManagerView === view && shopViewRevision === revision;
        button.disabled = true;
        button.textContent = progress;
        setShopMessage('');
        try {
            const result = await action(stillCurrent);
            if (stillCurrent() && result) {
                if (result.view) showShopView(result.view);
                setShopMessage(result.message, true);
            }
        } catch (error) {
            if (stillCurrent()) setShopMessage(error.message);
        } finally {
            button.disabled = false;
            button.textContent = label;
        }
    }

    function installShopEventHandlers() {
        const overlay = document.getElementById('firebaseShopOverlay');
        window.closeShopManager = closeShopManager;
        document.getElementById('firebaseShopButton').addEventListener('click', () => {
            openShopManager(false).catch((error) => setShopMessage(error.message));
        });
        document.getElementById('firebaseShopClose').addEventListener('click', closeShopManager);
        overlay.addEventListener('click', (event) => { if (event.target === overlay) closeShopManager(); });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !event.defaultPrevented && overlay.classList.contains('active')) closeShopManager();
        });
        document.getElementById('firebaseShopBack').addEventListener('click', () => {
            if (['invite', 'member'].includes(shopManagerView)) showShopMembers();
            else showShopView('select');
        });
        document.getElementById('firebaseShopCancel').addEventListener('click', () => {
            document.getElementById('firebaseShopBack').click();
        });
        document.getElementById('firebaseOpenCreateShop').addEventListener('click', () => showShopView('create'));
        document.getElementById('firebaseOpenShopSettings').addEventListener('click', () => showShopView('settings'));
        document.getElementById('firebaseShopDetailsTab').addEventListener('click', () => showShopView('settings'));
        document.getElementById('firebaseShopMembersTab').addEventListener('click', showShopMembers);
        document.getElementById('firebaseMembersRetry').addEventListener('click', showShopMembers);
        document.getElementById('firebaseOpenAddMember').addEventListener('click', () => showShopView('invite'));
        document.getElementById('firebaseShopTabs').addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const showMembers = event.key === 'End' || ['ArrowLeft', 'ArrowRight'].includes(event.key) && shopManagerView === 'settings';
            if (showMembers) showShopMembers(); else showShopView('settings');
            document.getElementById(showMembers ? 'firebaseShopMembersTab' : 'firebaseShopDetailsTab').focus();
        });
        overlay.addEventListener('input', (event) => {
            if (event.target.hasAttribute('aria-invalid')) {
                event.target.removeAttribute('aria-invalid');
                event.target.removeAttribute('aria-errormessage');
                setShopMessage('');
            }
        });
        document.getElementById('firebaseCreateShopForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!validateShopInput('firebaseNewShopName', '店鋪名稱請填寫 2 至 60 個字元。')) return;
            const nameInput = document.getElementById('firebaseNewShopName');
            const name = nameInput.value.trim();
            await runShopAction('firebaseCreateShop', '建立中…', async (stillCurrent) => {
                const state = await ensureSignedIn();
                const result = await rawRpc(state, 'createShop', [{ name }], null);
                availableShops.push(result.shop);
                nameInput.value = '';
                if (stillCurrent()) await activateShop(result.shop, Boolean(activeShop));
                else renderShopList();
            });
        });
        document.getElementById('firebaseRenameShopForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!validateShopInput('firebaseRenameShopName', '店鋪名稱請填寫 2 至 60 個字元。')) return;
            const name = document.getElementById('firebaseRenameShopName').value.trim();
            const shopId = activeShop.shopId;
            await runShopAction('firebaseRenameShop', '儲存中…', async () => {
                const state = await ensureSignedIn();
                await rawRpc(state, 'renameShop', [name], shopId);
                if (activeShop?.shopId === shopId) activeShop.name = name;
                availableShops = availableShops.map((shop) => shop.shopId === shopId ? { ...shop, name } : shop);
                updateShopBadge();
                renderShopList();
                if (activeShop?.shopId === shopId && ['settings', 'members'].includes(shopManagerView)) document.getElementById('firebaseShopSubtitle').textContent = name;
                return { message: '店鋪名稱已更新' };
            });
        });
        document.getElementById('firebaseAddMemberForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!validateShopInput('firebaseMemberEmail', '請填寫有效的成員 Email。')) return;
            const emailInput = document.getElementById('firebaseMemberEmail');
            const email = emailInput.value.trim();
            const role = document.getElementById('firebaseMemberRole').value;
            const shopId = activeShop.shopId;
            await runShopAction('firebaseAddMember', '新增中…', async () => {
                const state = await ensureSignedIn();
                await rawRpc(state, 'addShopMember', [{ email, role }], shopId);
                emailInput.value = '';
                if (activeShop?.shopId === shopId) await loadMembers(state);
                return { view: 'members', message: '成員已加入店鋪' };
            });
        });
        document.getElementById('firebaseMemberSettingsForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!selectedMember || selectedMember.role === 'owner') return;
            const uid = selectedMember.uid;
            const role = document.getElementById('firebaseSelectedMemberRole').value;
            const shopId = activeShop.shopId;
            await runShopAction('firebaseSaveMember', '儲存中…', async () => {
                const state = await ensureSignedIn();
                await rawRpc(state, 'updateShopMemberRole', [{ uid, role }], shopId);
                if (shopMembersShopId === shopId) {
                    shopMembers = shopMembers.map((member) => member.uid === uid ? { ...member, role } : member);
                    renderMembers(shopMembers);
                }
                return { view: 'members', message: '成員權限已更新' };
            });
        });
        document.getElementById('firebaseRemoveMember').addEventListener('click', async () => {
            if (!selectedMember || selectedMember.role === 'owner') return;
            const uid = selectedMember.uid;
            const shopId = activeShop.shopId;
            const revision = shopViewRevision;
            const accepted = await window.requestConfirmation(`確定要將 ${selectedMember.email || selectedMember.uid} 移出此店鋪？`, {
                title: '移除店鋪成員？', confirmLabel: '移除成員', danger: true,
                opener: document.getElementById('firebaseRemoveMember'),
            });
            if (!accepted || activeShop?.shopId !== shopId || activeShop.role !== 'owner' || selectedMember?.uid !== uid || shopViewRevision !== revision) return;
            await runShopAction('firebaseRemoveMember', '移除中…', async () => {
                const state = await ensureSignedIn();
                await rawRpc(state, 'removeShopMember', [uid], shopId);
                if (shopMembersShopId === shopId) {
                    shopMembers = shopMembers.filter((member) => member.uid !== uid);
                    renderMembers(shopMembers);
                }
                return { view: 'members', message: '成員已移除' };
            });
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
            const [appSdk, authSdk, functionsSdk, loadedConfig] = await Promise.all([
                import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
                import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
                import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-functions.js`),
                loadFirebaseConfig(),
            ]);
            const config = { ...loadedConfig };
            const localHost = ['localhost', '127.0.0.1'].includes(location.hostname);
            // Hosting serves /__/auth on this origin too. Safari must be able to
            // read the redirect helper's storage without crossing domains.
            if (!localHost) config.authDomain = location.hostname;
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

            if (localHost) {
                authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
                functionsSdk.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
            }

            installAuthOverlay();
            installShopEventHandlers();
            let authActionPending = false;
            const authErrors = new Map();
            const emailInput = document.getElementById('firebaseAuthEmail');
            const passwordInput = document.getElementById('firebaseAuthPassword');
            function credentialError(input) {
                if (input === emailInput) {
                    if (!input.value.trim()) return '請填寫 Email。';
                    return input.validity.typeMismatch ? '請輸入完整的 Email，例如 name@example.com。' : '';
                }
                return input.value.length < 6 ? '密碼至少需要 6 個字元。' : '';
            }
            function renderCredentialErrors() {
                for (const input of [emailInput, passwordInput]) {
                    const message = authErrors.get(input.id) || '';
                    const error = document.getElementById(input.id + 'Error');
                    error.textContent = message;
                    error.hidden = !message;
                    if (message) input.setAttribute('aria-invalid', 'true');
                    else input.removeAttribute('aria-invalid');
                    const descriptions = [input === passwordInput ? 'firebasePasswordHint' : '', message ? error.id : ''].filter(Boolean).join(' ');
                    if (descriptions) input.setAttribute('aria-describedby', descriptions);
                    else input.removeAttribute('aria-describedby');
                }
                const summary = document.getElementById('firebaseAuthValidation');
                summary.replaceChildren();
                summary.hidden = !authErrors.size;
                if (summary.hidden) return;
                const title = document.createElement('h4');
                title.id = 'firebaseAuthValidationTitle';
                title.textContent = '請確認登入資料';
                const list = document.createElement('ul');
                for (const [id, message] of authErrors) {
                    const item = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = '#' + id;
                    link.textContent = message;
                    link.onclick = (event) => {
                        event.preventDefault();
                        document.getElementById(id).focus();
                    };
                    item.append(link);
                    list.append(item);
                }
                summary.append(title, list);
            }
            function validateCredentials(includePassword = true) {
                authErrors.clear();
                for (const input of includePassword ? [emailInput, passwordInput] : [emailInput]) {
                    const error = credentialError(input);
                    if (error) authErrors.set(input.id, error);
                }
                renderCredentialErrors();
                if (authErrors.size) {
                    document.getElementById('firebaseAuthValidation').focus();
                    return false;
                }
                return true;
            }
            for (const input of [emailInput, passwordInput]) {
                input.addEventListener('input', () => {
                    if (!authErrors.has(input.id)) return;
                    const error = credentialError(input);
                    if (error) authErrors.set(input.id, error);
                    else authErrors.delete(input.id);
                    renderCredentialErrors();
                });
            }
            document.getElementById('firebasePasswordToggle').addEventListener('click', function() {
                const reveal = passwordInput.type === 'password';
                passwordInput.type = reveal ? 'text' : 'password';
                this.textContent = reveal ? '隱藏' : '顯示';
                this.setAttribute('aria-label', reveal ? '隱藏密碼' : '顯示密碼');
                this.setAttribute('aria-pressed', String(reveal));
            });
            async function runAuthAction(button, label, action, onError) {
                if (authActionPending) return;
                authActionPending = true;
                const controls = [...document.querySelectorAll('#firebaseEmailAuth input, #firebaseEmailAuth button, #firebaseCredentialActions button, #firebaseGoogleSignIn')];
                const previousDisabled = controls.map(control => control.disabled);
                const buttonLabel = button.querySelector('.firebase-auth-action-label') || button;
                const previousLabel = buttonLabel.textContent;
                const form = document.getElementById('firebaseEmailAuth');
                const progress = document.getElementById('firebaseAuthProgress');
                controls.forEach(control => { control.disabled = true; });
                form.setAttribute('aria-busy', 'true');
                buttonLabel.textContent = label;
                document.getElementById('firebaseAuthError').textContent = '';
                progress.textContent = label;
                progress.hidden = false;
                try {
                    await action();
                } catch (error) {
                    if (onError) onError(error);
                    else showAuthOverlay(authFailureMessage(error), passwordSetupUid && auth.currentUser?.uid === passwordSetupUid ? 'password' : undefined, auth.currentUser);
                } finally {
                    controls.forEach((control, index) => { control.disabled = previousDisabled[index]; });
                    buttonLabel.textContent = previousLabel;
                    form.removeAttribute('aria-busy');
                    progress.hidden = true;
                    authActionPending = false;
                    const overlay = document.getElementById('firebaseAuthOverlay');
                    if (overlay.classList.contains('active') && button.getClientRects().length &&
                        (!overlay.contains(document.activeElement) || document.activeElement === document.body)) {
                        button.focus({ preventScroll: true });
                    }
                }
            }
            async function withEmailCredentials(button, action) {
                if (authActionPending) return;
                document.getElementById('firebaseAuthError').textContent = '';
                if (!validateCredentials()) return;
                const email = emailInput.value.trim();
                const password = passwordInput.value;
                await runAuthAction(button, passwordSetupUid ? '設定密碼中…' : button.id === 'firebaseEmailRegister' ? '建立帳號中…' : '登入中…', () => action(email, password));
            }
            async function setGooglePassword(email, password) {
                const user = auth.currentUser;
                if (!passwordSetupUid || user?.uid !== passwordSetupUid || !canSetPassword(user) ||
                    user.email.toLowerCase() !== email.toLowerCase()) {
                    throw new Error('登入狀態已變更，請重新使用 Google 登入後再設定密碼。');
                }
                // Update only the authenticated Google user's password. Keep its verified email and UID.
                await authSdk.updatePassword(user, password);
                if (auth.currentUser?.uid !== user.uid) throw new Error('登入狀態已變更，請重新登入確認密碼設定。');
                updatePasswordSetupButton(auth.currentUser);
                passwordInput.value = '';
                showAuthOverlay('', 'password-complete', auth.currentUser);
            }
            document.getElementById('firebaseSetPassword').addEventListener('click', () => {
                if (authActionPending || !canSetPassword(auth.currentUser)) return;
                setAccountMenuOpen(false);
                authErrors.clear();
                renderCredentialErrors();
                passwordInput.value = '';
                showAuthOverlay('', 'password', auth.currentUser);
            });
            window.closePasswordSetup = () => {
                if (!passwordSetupUid || authActionPending) return;
                authErrors.clear();
                renderCredentialErrors();
                hideAuthOverlay();
                requestAnimationFrame(() => {
                    const badge = document.getElementById('firebaseAccountBadge');
                    Promise.all(badge.getAnimations().map(animation => animation.finished.catch(() => {}))).then(() => {
                        if (!document.getElementById('firebaseAuthOverlay').classList.contains('active'))
                            document.getElementById('firebaseAccountToggle').focus({ preventScroll: true });
                    });
                });
            };
            document.getElementById('firebasePasswordSetupCancel').addEventListener('click', window.closePasswordSetup);
            document.getElementById('firebaseEmailAuth').addEventListener('submit', function(event) {
                event.preventDefault();
                return withEmailCredentials(document.getElementById(passwordSetupUid ? 'firebaseEmailRegister' : 'firebaseEmailSignIn'), async (email, password) => {
                    if (passwordSetupUid) return setGooglePassword(email, password);
                    const credential = await authSdk.signInWithEmailAndPassword(auth, email, password);
                    if (!credential.user.emailVerified) showAuthOverlay('', 'verify', credential.user);
                });
            });
            document.getElementById('firebaseEmailRegister').addEventListener('click', function() {
                return withEmailCredentials(this, async (email, password) => {
                    if (passwordSetupUid) return setGooglePassword(email, password);
                    const credential = await authSdk.createUserWithEmailAndPassword(auth, email, password);
                    await authSdk.sendEmailVerification(credential.user);
                    showAuthOverlay('驗證信已寄出，請開啟信中的連結。', 'verify', credential.user);
                });
            });
            document.getElementById('firebaseResetPassword').addEventListener('click', async function() {
                if (authActionPending) return;
                document.getElementById('firebaseAuthError').textContent = '';
                if (!validateCredentials(false)) return;
                const email = emailInput.value.trim();
                const complete = () => showAuthOverlay('如果此帳號存在，密碼重設信將寄到該信箱，請一併檢查垃圾郵件。若曾使用 Google 登入，也可登入後從「使用者帳號 → 設定登入密碼」新增密碼。');
                await runAuthAction(this, '寄送重設信中…', async () => {
                    await authSdk.sendPasswordResetEmail(auth, email);
                    complete();
                }, error => {
                    if (error?.code === 'auth/user-not-found') complete();
                    else showAuthOverlay(authFailureMessage(error, '無法寄送密碼重設信，請稍後再試。'));
                });
            });
            document.getElementById('firebaseGoogleSignIn').addEventListener('click', async function() {
                authErrors.clear();
                renderCredentialErrors();
                await runAuthAction(this, '正在開啟 Google…', async () => {
                    const provider = new authSdk.GoogleAuthProvider();
                    const standalone = navigator.standalone === true ||
                        window.matchMedia('(display-mode: standalone)').matches;
                    // An iOS PWA popup can lose its opener when the system
                    // browser hands control back to the installed app.
                    if (standalone) await authSdk.signInWithRedirect(auth, provider);
                    else await authSdk.signInWithPopup(auth, provider);
                });
            });
            document.getElementById('firebaseSignOut').addEventListener('click', async function() {
                window.dispatchEvent(new Event('pos:session-ending'));
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
                    showAuthOverlay(authFailureMessage(error, '無法寄送驗證信，請稍後再試。'), 'verify', auth.currentUser);
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
                    showAuthOverlay(authFailureMessage(error, '無法更新驗證狀態，請稍後再試。'), 'verify', auth.currentUser);
                } finally {
                    button.disabled = false;
                }
            });
            document.getElementById('firebaseVerificationSignOut').addEventListener('click', async function() {
                window.dispatchEvent(new Event('pos:session-ending'));
                await authSdk.signOut(auth);
                location.reload();
            });

            // Finish the OAuth return before presenting the signed-out UI.
            // Keep return errors visible while still allowing another login.
            let redirectError = '';
            try {
                await authSdk.getRedirectResult(auth);
            } catch (error) {
                redirectError = error.message || 'Google 登入未完成，請再試一次。';
            }
            await new Promise((resolve) => {
                let initialStateResolved = false;
                authSdk.onAuthStateChanged(auth, (user) => {
                    updatePasswordSetupButton(user);
                    if (user?.emailVerified) {
                        if (activeUid && activeUid !== user.uid) {
                            window.dispatchEvent(new Event('pos:session-ending'));
                            location.reload();
                            return;
                        }
                        activeUid = user.uid;
                        document.body.dataset.userId = user.uid;
                        if (passwordSetupUid !== user.uid) hideAuthOverlay();
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
                        showAuthOverlay(redirectError);
                        redirectError = '';
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
        await new Promise((resolve, reject) => authWaiters.push({ resolve, reject }));
        return state;
    }

    async function invoke(functionName, args) {
        const state = await ensureSignedIn();
        try {
            const initial = functionName === 'getShopBootstrap';
            const session = await ensureSessionBootstrap(state, initial ? {
                shopId: localStorage.getItem(shopStorageKey()), year: args[0], month: args[1],
            } : undefined);
            if (initial && session?.bootstrap && !activeShop) {
                await activateShop(session.selectedShop, false);
                return session.bootstrap;
            }
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
