(function() {
  "use strict";
  let installPrompt = null;

  function showMessage(title, message, actions, iconClass = "fa-mobile-alt") {
    let banner = document.getElementById("pwaBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "pwaBanner";
      banner.className = "pwa-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      (document.querySelector('.app-navigation') || document.body).appendChild(banner);
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
    const banner = showMessage("安裝WebPOS", "加入主畫面，之後可直接開啟。", '<button id="pwaInstall" type="button">安裝</button><button id="pwaDismiss" type="button">稍後</button>');
    banner.querySelector("#pwaInstall")?.addEventListener("click", async () => {
      await installPrompt?.prompt();
      installPrompt = null;
      banner.classList.remove("active");
    });
    banner.querySelector("#pwaDismiss")?.addEventListener("click", () => banner.classList.remove("active"));
  });

  document.addEventListener("DOMContentLoaded", () => {
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
    if (!("serviceWorker" in navigator) || location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname)) return;
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      function offerUpdate(worker) {
        const banner = showMessage("版本更新", "完成目前訂單後即可更新。", '<button id="pwaUpdate" type="button">更新</button>', "fa-sync-alt");
        banner.querySelector("#pwaUpdate")?.addEventListener("click", () => {
          if (document.body.dataset.draftDirty === "true") {
            banner.querySelector(".pwa-banner-message").textContent = "仍有訂單草稿，請先完成或捨棄。";
            return;
          }
          worker.postMessage({ type: "SKIP_WAITING" });
        });
      }
      if (registration.waiting) offerUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state !== "installed" || !navigator.serviceWorker.controller) return;
          offerUpdate(worker);
        });
      });
    }).catch((error) => console.warn("PWA 註冊失敗", error));
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", async () => {
      if (refreshing) return;
      refreshing = true;
      try { await window.saveOrderDraftNow?.(); } catch (error) { console.warn("更新前草稿保存失敗", error); refreshing = false; return; }
      location.reload();
    });
  });
})();
