(function() {
  "use strict";
  let installPrompt = null;

  function showMessage(message, actions) {
    let banner = document.getElementById("pwaBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "pwaBanner";
      banner.className = "pwa-banner";
      banner.setAttribute("role", "status");
      document.body.appendChild(banner);
    }
    banner.innerHTML = `<span>${message}</span>${actions || ""}`;
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
    const banner = showMessage("將金家 POS 安裝到裝置，開啟更快速。", '<button id="pwaInstall" type="button">安裝</button><button id="pwaDismiss" type="button">稍後</button>');
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
      const banner = showMessage("iPhone／iPad：點 Safari 的分享按鈕，再選「加入主畫面」即可安裝。", '<button id="pwaDismiss" type="button">知道了</button>');
      banner.querySelector("#pwaDismiss")?.addEventListener("click", () => {
        sessionStorage.setItem("ginJiaPos.iosInstallHint", "dismissed");
        banner.classList.remove("active");
      });
    }
    if (!("serviceWorker" in navigator) || location.protocol !== "https:" && location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state !== "installed" || !navigator.serviceWorker.controller) return;
          const banner = showMessage("有新版本可用。完成目前訂單後即可更新。", '<button id="pwaUpdate" type="button">更新</button>');
          banner.querySelector("#pwaUpdate")?.addEventListener("click", () => {
            if (document.body.dataset.draftDirty === "true") {
              banner.querySelector("span").textContent = "目前仍有訂單草稿，請先完成或捨棄草稿。";
              return;
            }
            worker.postMessage({ type: "SKIP_WAITING" });
          });
        });
      });
    }).catch((error) => console.warn("PWA 註冊失敗", error));
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  });
})();
