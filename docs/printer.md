# WebPOS 印表機

路徑：WebPOS → `wss://xiao-printer.local/ws` → XIAO ESP32-C3 → XP-80T TCP 9100。
Firebase 只提供已儲存的訂單資料；列印 bytes 由瀏覽器直接送至區網橋接。

## 首次設定

1. iPad 與橋接、印表機位於可互通的區網。
2. 在 WebPOS「管理 → 印表機」展開「首次設定 iPad」，直接下載印表機憑證，依頁面指引到 iPad 系統設定安裝並啟用完整信任。不必先開啟 ESP32 網頁；已安裝並信任相同 CA 可跳過。主畫面 PWA 無法下載時，改用 Safari 開啟本 POS 下載。
3. WebPOS「管理 → 印表機」啟用列印，輸入 WSS 位址與裝置金鑰、單據店名。
   若使用 IP，必須是伺服器憑證 SAN 已包含的 IP；不可用 `ws://` 取代 WSS。
4. 按「儲存並檢查連線」。此操作只查詢 DLE EOT 1，不列印；回應不代表紙張正常印出。
5. 按「中文測試列印」，在預覽按「列印一份」。先確認 512 點寬度是否合適，再視實機改為 576 或 384 點。
   切紙預設關閉，啟用後使用進紙半切。紙張寬度不等於可列印寬度。

設定以帳號＋店鋪為範圍存在本機。金鑰預設放 sessionStorage，切換帳號／店鋪或登出會移除。
選擇「記住此裝置金鑰」會放 localStorage，登出後仍保留；取消勾選並儲存即可移除持久金鑰。
不可把金鑰加入原始碼、雲端訂單或日誌。本機儲存不提供加密保護。

`public/certs/printer-root-ca.cer` 是新版橋接韌體使用的公開根憑證（DER），名稱為 **Xprinter**，不含私鑰或裝置金鑰。
由舊名稱升級時需同步更新 ESP32 韌體的憑證鏈，並在 iPad 安裝、信任新下載的 Xprinter 憑證；只更新 POS 不會更新實機憑證。
Hosting 與本機預覽以 `application/x-x509-ca-cert` 提供；Service Worker 對 `/certs/` 放行，避免下載導覽被替換成 POS HTML。
更換根 CA 時須同步更新此檔案；僅以相同 CA 重簽伺服器憑證則不需更新。其他橋接裝置不可直接套用此憑證。
iPad 的手動安裝與完整信任仍須由使用者在系統設定完成。此流程簡化不代表已解決下述 Safari／PWA 的 TLS 差異。

## 在 POS 設定 ESP32 與 Xprinter

需先更新 ESP32 到支援 `configVersion: 1` 的 1.1.0 韌體（原韌體不支援設定指令），並部署新版 POS。
ESP32 尚未接上可互通的 Wi-Fi 時，無法透過 POS 遠端配置；首次燒錄仍需提供可連線的網路。

1. 輸入 ESP32 的 WSS 位址與金鑰，按「讀取 ESP32 設定」。不必先啟用列印，也不會儲存 POS 本機設定。
2. 頁面顯示裝置名稱、目前 IP、Wi-Fi 名稱與韌體；修改 Xprinter IPv4／TCP 埠後按「儲存到 ESP32」。
   這是 ESP32 轉送目標，不是修改 Xprinter 本身的 IP。設定保存於 ESP32 NVS，重開機保留，影響所有使用者。
3. 若需換 Wi-Fi，展開該區塊，輸入 2.4 GHz WPA/WPA2 網路名稱及密碼，按「試連並儲存 Wi-Fi」。
   ESP32 試連 30 秒，以取得 DHCP IP 作為成功條件；成功才保存，失敗或保存失敗會套回原 Wi-Fi。
   這不保證能連到印表機或 iPad。讓 iPad 連到能存取 ESP32 的網路後，約 30–60 秒再按「讀取 ESP32 設定」確認。
   Wi-Fi 密碼不回傳、不寫入瀏覽器儲存；送出後清空輸入欄。ESP32 的 NVS 保存網路設定。
4. 回到「儲存並檢查連線」確認 Xprinter；換網段後可能也要更新印表機目標位址。

優先用 `wss://xiao-printer.local/ws`，mDNS 可用時不依賴 ESP32 當下 DHCP IP；「使用 xiao-printer.local」只填入位址，不自動儲存。
不支援 mDNS／裝置隔離的網路仍需調整路由器；直接用 IP 必須符合伺服器憑證 SAN，POS 無法跳過 TLS 名稱驗證。
頁面不會掃描未知 IP，也不會自動重送設定。寫入回覆遺失時需重新讀取確認，兩台裝置同時修改以 revision 防止覆蓋。
列印中拒絕修改裝置設定，Wi-Fi 試連中拒絕列印及其他寫入。只有 owner/editor 可操作，ESP32 端仍以裝置 token 授權。

## 列印訂單

建立成功後的提示列或訂單詳情皆有「列印訂單」。每次開啟預覽會重新呼叫 `getOrderDetails`，
使用已儲存的金額與付款資料。預覽固定該次取得的內容；若付款／訂單再變更，請關閉重開。
禮盒組成名稱沿用目前商品目錄查詢，找不到商品時保留商品 ID；數量標示為每盒數量。

每個預覽只能送出一次。需要補印時重新開啟預覽，先確認先前是否已出紙。
列印失敗不會重送、更新或取消訂單；中斷後可能已部分列印。`sent` 只表示 TCP 接受資料。
同一頁一次只執行一個印表機操作；其他分頁／裝置由橋接互斥控制，忙碌時請稍後手動重試。
關閉預覽不取消已開始的傳送，結果會顯示於通知及印表機設定頁。切換帳號／店鋪會停止後續傳送，
已送出的 bytes 無法撤回。owner/editor 可操作，viewer 不提供列印權限；橋接的授權仍是裝置 token。

## 實作

- `src/platform/printer-client.js`：auth/status/begin/binary/end 協定，15 秒逐步逾時、AbortSignal、ACK bytes 核對。
- `src/app/receipt.js`：24px 系統中文字型，逐行換行，每段最多 238 點高；預覽分頁且同時最多四個 Canvas，送印依相同排版逐段產生黑白點陣，收到 ACK 後才產生下一段。不合併整筆 bitmap 到記憶體。預覽分頁不影響連續出紙。
- `src/app/printer.js`：本機設定、預覽、訂單讀取及傳送互斥。
- 指令依 `../xprinter/docs/芯烨80系列中文编程手册.md` 第 62 項 `GS v 0` 與第 53 項 `GS V 66 n`。
- 分塊最多 4096 bytes，整筆最多 8 MiB；先依行數精算大小，超限在連線前拒絕。橋接認證回覆新增 `maxJob: 8388608`；舊韌體未回覆時按 1 MiB 處理，長單在 begin 前拒絕並提示更新韌體，避免部分出紙。
- 無新增 Firestore schema、Cloud Functions 或外部字型依賴。JS/CSS 進既有 bundle，PWA release hash 隨建置更新。

## 驗證

「連線診斷（不列印）」不需金鑰、不儲存設定，逐一測試目前位址的 HTTPS 與 WSS 握手。
若目前使用私人 IPv4，也對照本專案預設的 `xiao-printer.local`。結果包含模式、版本、來源及耗時，
不包含金鑰或訂單。HTTPS 使用無憑證的 no-cors 請求；收到 opaque 回應表示 TLS/HTTP 連線成功，
不表示已讀取或驗證 HTTP 狀態內容。WSS 只開啟並關閉，絕不送 auth/begin/binary。

2026-09-17 iPadOS 18.7.8 實機調查：使用者確認 Safari WebPOS 成功而主畫面 PWA 失敗。
PWA 重現時 ESP32 收到 TLS fatal alert 46 (`certificate_unknown`)，發生在 WebSocket Upgrade 之前。
因此當次失敗不涉及 token、列印分塊或下游 TCP。此警報只定位到客戶端憑證檢查，
不能單憑它認定使用者未信任 CA，也尚未證實 iPadOS 缺陷。伺服器憑證 IP/DNS SAN、
serverAuth、TLS 1.2 ECDHE-RSA-AES256-GCM 與嚴格鏈驗證已核對。暫時 TLS debug 韌體已移除。

`npm run check`、`npm test`。瀏覽器測試用模擬 WSS，包含點陣與預覽逐像素對照、分塊、忙碌、斷線、
金鑰儲存、店鋪切換、viewer、最新訂單明細及單筆傳送限制。

仍需在正式 Hosting 網址、實際 iPad Safari 與安裝版 PWA 驗證 CA 信任、區網權限及中文出紙，
確認 XP-80T 的寬度、進紙、半切、長單和兩台 iPad 同時列印。模擬測試無法證明實機結果。
