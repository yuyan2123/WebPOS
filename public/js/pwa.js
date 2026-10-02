(function() {
  "use strict";
  let installPrompt = null;
  let updateRequested = false;
  let updateAvailable = false;

  function showMessage(title, message, actions, iconClass = "fa-mobile-alt", isUpdate = false) {
    const bannerId = isUpdate ? "pwaUpdateNotice" : "pwaBanner";
    let banner = document.getElementById(bannerId);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = bannerId;
      banner.className = isUpdate ? "pwa-banner pwa-banner--update" : "pwa-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      const navigation = document.querySelector('.app-navigation');
      const hint = navigation?.querySelector('.navigation-hint');
      if (isUpdate && hint) navigation.insertBefore(banner, hint);
      else (navigation || document.body).appendChild(banner);
    }
    banner.innerHTML = `
      <span class="pwa-banner-icon" aria-hidden="true"><i class="fas ${iconClass}"></i></span>
      <span class="pwa-banner-copy">
        <strong>${title}</strong>
        <span class="pwa-banner-message">${message}</span>
      </span>
      <span class="pwa-banner-actions">${actions || ""}</span>`;
    banner.classList.add("active");
    return banner;
  }

  function updateConnectionState() {
    document.body.classList.toggle("is-offline", !navigator.onLine);
    const existing = document.getElementById("connectionBanner");
    if (navigator.onLine) {
      existing?.remove();
      return;
    }
    const banner = existing || document.createElement("div");
    banner.id = "connectionBanner";
    banner.className = "connection-banner";
    banner.setAttribute("role", "status");
    banner.textContent = "目前離線：草稿會保存在此裝置，恢復連線後才能送出訂單。";
    if (!existing) document.body.appendChild(banner);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    if (updateAvailable) return;
    const banner = showMessage("安裝 WebPOS", "加入主畫面，快速開啟訂單工作台。", '<button id="pwaInstall" type="button">安裝</button><button id="pwaDismiss" type="button">稍後</button>');
    banner.querySelector("#pwaInstall")?.addEventListener("click", async () => {
      await installPrompt?.prompt();
      installPrompt = null;
      banner.classList.remove("active");
    });
    banner.querySelector("#pwaDismiss")?.addEventListener("click", () => banner.classList.remove("active"));
  });

  document.addEventListener("DOMContentLoaded", () => {
    const updateButton = document.getElementById('systemCheckUpdate');
    const updateStatus = document.getElementById('systemUpdateStatus');
    const version = document.querySelector('meta[name="app-version"]')?.content;
    const updatedAt = document.querySelector('meta[name="app-updated-at"]')?.content;
    document.getElementById('systemVersion').value = version ? `v${version}` : '未知';
    const date = new Date(updatedAt);
    document.getElementById('systemUpdatedAt').value = Number.isNaN(date.getTime()) ? '未知' :
      new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Taipei' }).format(date);
    updateButton.disabled = true;
    updateConnectionState();
    window.addEventListener("online", updateConnectionState);
    window.addEventListener("offline", updateConnectionState);
    const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (isAppleMobile && !isStandalone && sessionStorage.getItem("ginJiaPos.iosInstallHint") !== "dismissed") {
      const banner = showMessage("安裝到主畫面", "點 Safari 分享，再選「加入主畫面」。", '<button id="pwaDismiss" type="button">知道了</button>', "fa-share-square");
      banner.querySelector("#pwaDismiss")?.addEventListener("click", () => {
        sessionStorage.setItem("ginJiaPos.iosInstallHint", "dismissed");
        banner.classList.remove("active");
      });
    }
    if (!("serviceWorker" in navigator) || location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname)) {
      updateStatus.textContent = '目前環境不支援檢查更新。';
      return;
    }
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      updateButton.disabled = false;
      const managementButton = document.getElementById('managementToggle');
      const deviceButton = document.getElementById('nav-device');
      const mobileNavigation = window.matchMedia('(max-width: 899px)');
      const dismissalKey = 'ginJiaPos.updateNoticeDismissed';
      let noticeDismissed = false;
      try { noticeDismissed = sessionStorage.getItem(dismissalKey) === (version || 'current'); } catch { /* Storage may be unavailable. */ }

      function positionUpdateNotice() {
        const banner = document.getElementById('pwaUpdateNotice');
        const visible = mobileNavigation.matches && banner?.classList.contains('active');
        document.body.classList.toggle('pwa-update-visible', Boolean(visible));
        if (!visible) {
          document.body.style.removeProperty('--pwa-update-height');
          return;
        }
        const bannerRect = banner.getBoundingClientRect();
        const buttonRect = managementButton.getBoundingClientRect();
        const arrowRight = bannerRect.right - (buttonRect.left + buttonRect.width / 2);
        banner.style.setProperty('--pwa-arrow-right', `${Math.max(20, Math.min(bannerRect.width - 20, arrowRight))}px`);
        document.body.style.setProperty('--pwa-update-height', `${bannerRect.height}px`);
      }

      function dismissUpdateNotice(restoreFocus = true) {
        const banner = document.getElementById('pwaUpdateNotice');
        const wasFocused = banner?.contains(document.activeElement);
        noticeDismissed = true;
        try { sessionStorage.setItem(dismissalKey, version || 'current'); } catch { /* Storage may be unavailable. */ }
        banner?.classList.remove('active');
        positionUpdateNotice();
        if (restoreFocus && wasFocused) (mobileNavigation.matches ? managementButton : deviceButton).focus({ preventScroll: true });
      }

      const noticeResize = new ResizeObserver(positionUpdateNotice);
      window.addEventListener('resize', positionUpdateNotice);
      mobileNavigation.addEventListener('change', positionUpdateNotice);
      managementButton.addEventListener('click', () => {
        if (document.getElementById('pwaUpdateNotice')?.classList.contains('active')) dismissUpdateNotice(false);
      });
      document.addEventListener('pos:navigate', (event) => {
        if (event.detail.panel === 'device' && updateAvailable) dismissUpdateNotice(false);
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !event.defaultPrevented && !managementButton.closest('[inert]') && document.getElementById('pwaUpdateNotice')?.classList.contains('active')) {
          dismissUpdateNotice();
        }
      });

      function applyUpdate(worker) {
        if (updateRequested) return;
        if (document.body.dataset.draftDirty === 'true') {
          const message = '目前有未完成的訂單，請先完成或捨棄，再更新。';
          updateStatus.textContent = message;
          return;
        }
        updateButton.disabled = true;
        updateButton.textContent = '更新中…';
        updateStatus.textContent = '正在更新…';
        updateRequested = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      }
      function offerUpdate() {
        if (updateRequested) return;
        updateAvailable = true;
        updateButton.textContent = '更新';
        updateStatus.textContent = '有新版本可更新。更新會重新載入頁面，可等目前工作完成後再更新。';
        managementButton.dataset.updateAvailable = 'true';
        managementButton.setAttribute('aria-label', '管理，有可用更新');
        deviceButton.dataset.updateAvailable = 'true';
        deviceButton.setAttribute('aria-label', '裝置資訊，有可用更新');
        document.getElementById('pwaBanner')?.classList.remove('active');
        if (noticeDismissed || document.body.dataset.panel === 'device') return;
        if (document.getElementById('pwaUpdateNotice')?.classList.contains('active')) return;
        const banner = showMessage("有新版本可用", "更新會重新載入頁面，可以先完成手邊工作。", '<button id="pwaUpdateDismiss" type="button">稍後再說</button><button id="pwaUpdateDetails" type="button">查看更新</button>', "fa-sync-alt", true);
        banner.querySelector('#pwaUpdateDismiss').addEventListener('click', () => dismissUpdateNotice());
        banner.querySelector('#pwaUpdateDetails').addEventListener('click', () => {
          dismissUpdateNotice(false);
          deviceButton.click();
          updateButton.focus();
        });
        noticeResize.observe(banner);
        positionUpdateNotice();
      }
      updateButton.addEventListener('click', async () => {
        if (registration.waiting) {
          applyUpdate(registration.waiting);
          return;
        }
        updateButton.disabled = true;
        updateStatus.textContent = '正在檢查更新…';
        try {
          if (!navigator.onLine) throw new Error('offline');
          await registration.update();
          const worker = registration.installing;
          if (worker && !['installed', 'redundant', 'activated'].includes(worker.state)) {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => finish(new Error('timeout')), 30000);
              function finish(error) {
                clearTimeout(timeout);
                worker.removeEventListener('statechange', changed);
                if (error) reject(error); else resolve();
              }
              function changed() {
                if (worker.state === 'redundant') finish(new Error('installation failed'));
                else if (['installed', 'activated'].includes(worker.state)) finish();
              }
              worker.addEventListener('statechange', changed);
              changed();
            });
          }
          if (worker?.state === 'redundant') throw new Error('installation failed');
          if (registration.waiting) offerUpdate();
          else {
            updateButton.textContent = '檢查更新';
            updateStatus.textContent = '目前已是最新版本。';
          }
        } catch (error) {
          updateStatus.textContent = navigator.onLine ? '檢查更新失敗，請稍後重試。' : '目前離線，請連線後再檢查更新。';
          console.warn('檢查更新失敗', error);
        } finally {
          updateButton.disabled = false;
        }
      });
      if (registration.waiting) offerUpdate();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state !== "installed" || !navigator.serviceWorker.controller) return;
          offerUpdate();
        });
      });
    }).catch((error) => {
      updateStatus.textContent = '更新服務無法啟動，請重新載入後再試。';
      console.warn("PWA 註冊失敗", error);
    });
    let refreshing = false;
    let hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", async () => {
      const replacingWorker = hadController;
      hadController = Boolean(navigator.serviceWorker.controller);
      // The first installation only claims this already-loaded page. Reloading
      // here can cancel Google sign-in before its redirect leaves the app.
      if (!replacingWorker && !updateRequested) return;
      if (refreshing) return;
      refreshing = true;
      try { await window.saveOrderDraftNow?.(); } catch (error) { console.warn("更新前草稿保存失敗", error); refreshing = false; return; }
      if (updateRequested) {
        try { sessionStorage.setItem('ginJiaPos.updateReload', '1'); } catch { /* Storage may be unavailable. */ }
      }
      location.reload();
    });
  });
})();
