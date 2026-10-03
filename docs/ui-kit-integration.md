# WebPOS UI Kit 整合

本次只修改呈現：HTML class／SVG、CSS、視覺狀態色彩與樣式建置。保留原 ID、事件、欄位驗證、RPC、權限、付款／供應量計算、列印位元組與 modal 生命週期。

## 來源與維護

設計來源：`../web-ui-kit`。新版以 [Mirrorstack UI Kit](https://mirrorstack-ai.github.io/web-ui-kit/) 的語意色彩、低陰影表面、緊湊圓角與標題字體為參考，保留 WebPOS 的 M3 tokens、Tailwind 版面及業務流程。

`web-ui-kit/styles/{tokens,components,pos}.css` 是共用樣式來源。同步會更新 `src/styles/ui-kit/{tokens,components}.css` 與 `src/styles/pos.css`，並複製 Google 登入圖示；樣式與資產均與元件庫一致。營運畫面使用一致的系統字體。先修改元件庫，再執行同步；一般建置只讀快照，GitHub checkout 與 CI 不依賴本機兄弟目錄。

Tailwind 3.4 的 `tailwind.config.cjs` 將 `md-*` 色彩連接到 `--md-sys-color-*`。版面與響應式使用 Tailwind utilities；例如 `grid-cols-1 sm:grid-cols-2`、`bg-md-content`、`text-md-on-surface`。M3 Filled、Tonal、Outlined、Text 操作沿用 `gj-btn` 元件。不要再以 `.bg-blue-*` 或 `.text-gray-*` 全域覆寫 Tailwind 顏色。

```powershell
npm run sync:ui-kit
npm run build:css
npm run build:web
npm run check
npm run test:browser
```

也可 `node scripts/sync-ui-kit.mjs <其他元件庫路徑>`。一般建置不會自動覆蓋快照。`public/css/app.css` 包含 tokens、元件、既有響應式排版與 POS 適配；`public/css/ui-kit.css` 提供獨立憑證頁使用。PWA 既有建置雜湊會隨樣式更新。

## 畫面與元件對照

| 畫面／情境                                    | 使用的元件與適配                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| 整體工作台、桌面導覽、手機導覽、管理選單      | M3 surface／secondary container、12px 選取、`gj-icon` 本地 SVG；保留路由與響應式切換 |
| 客戶、稱謂、電話／LINE、配送、運費、收件人    | `gj-input`、Outlined／Filled／Tonal 按鈕、分段選擇適配、收合面板                     |
| 客戶自動完成、商品分類選單                    | surface 浮層、8px 圓角、焦點／hover 狀態                                             |
| 交貨日期、日曆供應量、日期選擇器              | 方形日期格、primary 選取、success／warning／error 容量狀態、Air Datepicker 語意變數  |
| 商品選購、企業價格、商品詳情、特價            | `gj-product-card`、`gj-product-visual`、`gj-product-actions`、輸入欄位與開關         |
| 禮盒規格、分類、組成、數量、備註與確認        | 卡片、篩選 chip、可輸入的 60px 數量控制、摘要與操作按鈕                              |
| 購物車、編輯、移除、總額、結帳未就緒          | 抽屜適配、數量控制、FAB、primary／error 操作、可讀的未就緒狀態                       |
| 訂單查詢、逾期查詢、表格、展開明細、詳情      | `gj-table`＋既有響應式資料列；保留操作欄及收合動畫                                   |
| 訂金、訂單編輯、狀態變更、滑動刪除            | 16px dialog、數字輸入、語意狀態 badge、既有滑動／鍵盤確認                            |
| 商品管理、編輯、分類、排序與拖曳              | 卡片、表單、排序 dialog、拖曳位置及提示色                                            |
| 供應量設定、星期開關、日期覆寫、超量確認      | 52×32px 可視開關、48px 觸控區、56px 欄位、警告 dialog                                |
| 需求統計、營業報表、數字摘要                  | 中性統計卡片、primary 數字、日期欄位與表格                                           |
| 出單機、連線、Wi-Fi、設備設定、測試、憑證提示 | 分段控制、開關、卡片、狀態與操作層級                                                 |
| 裝置資訊、版本／更新檢查                      | 資訊卡片、按鈕、成功／錯誤提示                                                       |
| 登入、驗證信、密碼重設、帳號、店鋪與成員管理  | 同一套 tokens、56px 欄位、16px auth/shop dialog、狀態與按鈕                          |
| 啟動／載入、空白、離線、錯誤、通知、PWA 提示  | surface 容器、primary 進度、inverse surface 通知、語意警告                           |
| 捲軸、焦點、停用、減少動態                    | tokens 捲軸、可见焦點、原停用語意與 reduced-motion                                   |
| 公開印表機憑證頁                              | 獨立載入同版 `ui-kit.css`、`gj-card`、`gj-btn`                                       |

原商標圖、列印用黑白紙面／QR 與實際票據排版保留。深色沿用元件庫的 `data-theme="dark"` 邊界支援。系統資訊「外觀」區的 M3 主題按鈕參考 [Mirrorstack ThemeToggle](https://mirrorstack-ai.github.io/web-ui-kit/?path=/story/ui-actions-themetoggle--interactive)，依序切換跟隨系統／淺色／深色，預設跟隨系統。偏好以 `ginJiaPos.theme` 儲存在瀏覽器或 PWA 的 localStorage，同來源分頁同步；自動模式會即時跟隨系統變更。`src/ui/theme.js` 獨立建置，在樣式載入前還原偏好，並納入 PWA 離線快取。儲存空間受限時仍可在本次使用期間切換。欄位與 dialog 保留原標籤與可存取名稱，篩選勾選圖形不加入按鈕名稱。

輸入框依使用者指定的 [Mirrorstack Combobox](https://mirrorstack-ai.github.io/web-ui-kit/?path=/story/ui-inputs-combobox--with-objects) 改為 8px 圓角、surface-container-low 淡色底與 primary 焦點環。商品類別的 input 與箭頭共用 `gj-combobox` 容器，浮層維持原定位、鍵盤、觸控及新類別輸入行為。`--gj-input-radius`／`--gj-input-surface` 定義於共用 tokens；元件库 `#forms` 可檢視同版輸入與選單。

Google 登入套用 [Mirrorstack SocialButton with label](https://mirrorstack-ai.github.io/web-ui-kit/?path=/story/ui-actions-socialbutton--with-label) 的圖示／標籤組合：`gj-social-button`、8px 圓角、中性淡底、48px 觸控區。圖示採用 [Google 官方透明背景漸層 G PNG](https://developers.google.com/static/identity/images/g-logo.png) 原圖，外層移除白底；以 `object-fit: contain` 保留比例，來源與原圖指紋見 `web-ui-kit/assets/README.md`。同步到 `public/icons/google-signin.png` 並納入 PWA shell。保留 `firebaseGoogleSignIn` ID、停用、驗證模式的顯示切換、原 popup／PWA redirect 與錯誤重試流程。元件庫 `#buttons` 包含正常／停用示範，未增加新的登入服務。

手機商品編輯欄位改為單欄；日期覆寫與報表操作依斷點排列；星期上限使用 3／4／7 欄的 Tailwind grid。禮盒商品卡以分類、品名、每粒價格與數量控制呈現，移除泛用商品圖示；已選數量透過文字標記與邊框顯示，零數量停用減號。48px 按鈕與輸入欄位保持 8px 間距，手機使用完整寬度，保留直接輸入、數量上限、分類篩選及編輯還原。新增與編輯共用商品卡，企業價與原價分開顯示，價格採文字色；整體選取進度以單一狀態區宣告。Dialog 移除殘留漸層與瀏覽器預設標題 margin，保留開關、焦點、Esc 與動畫生命週期。

互斥選項沿用 `gj-segment`：8px 淺色外框與各自獨立的 8px 選項，primary 選取底色、on-primary 文字及 8%／12% 互動狀態層。姓名稱謂、電話／LINE、客戶類型、配送方式、運費、商品編輯與出單機分類共用同一適配；ARIA 選取狀態與讀屏名稱維持原邏輯。視覺參考 [Mirrorstack boxed segments](https://mirrorstack-ai.github.io/web-ui-kit/?path=/story/ui-inputs-segmentedbutton--boxed)。

## 驗證記錄

- 商品頁直接共用禮盒商品卡的分類、品名、價格、選取標記與數量控制樣式。原「數量（粒）」標籤的位置改為「詳情」按鈕；右側減號、數量輸入與加號直接同步購物車。分類切換、商品詳情加入、購物車編輯及移除都會更新商品卡數量；減少數量先處理最近加入的商品列，保留剩餘品項的特價與備註。加號回饋僅切換圖示，不覆寫整個按鈕。

- 商品流程採用相同資訊層級：商品清單與管理卡完整換行品名，分開顯示一般／企業／自訂價格；購物車移除泛用商品圖示、增加小計、逐項禮盒內容與具名操作。數量變更後保留原操作焦點及既有 DOM 重用。禮盒確認頁改為簡潔明細列與分組欄位。商品詳情顯示即時合計，自訂價格欄位收起時不參與鍵盤操作；關閉自訂價格後還原有效企業價。商品與訂金彈窗以內容捲動、頁首／操作固定的配置支援窄螢幕與橫向高度。價格、購物車總計採千位分隔；共用 CSS 先更新元件庫再同步。

- 營運介面修整：移除手寫字體、重複頁首、泛用商品插畫与多餘外層卡片，整理摘要列、主次操作、商品資訊及唯讀資料列。設計依据與可重用規則見 [介面設計契約](ui-design-contract.md)。36 項主要回歸，以及後續 Light／Dark 畫面、登入與更新狀態檢查通過。
- 購物車效能修復：移除全頁 backdrop blur、降低大面積陰影，進場 220ms／退場 160ms；未變更的商品 DOM 在重開時重用，數量及禮盒變更仍即時更新。28 項購物車、快速重開、減少動態、禮盒與類別回歸於四個瀏覽器／尺寸專案通過；`npm run check` 通過，共用 CSS 已同步。
- Mirrorstack v3 更新：24 項重點 UI／互動檢查於桌面、平板、手機與 WebKit 通過，包含 11 個畫面與商品 dialog 的 Light／Dark 掃描；`npm run check`、Rust 6 項及 Node 35 項通過。完整回歸曾執行至 120／392 後因回合中斷停止，不將其計為完整通過。
- 第三方登入樣式更新：52 項登入／憑證回歸通過；另確認共用 Google G 圖片可正常載入、按鈕在 Light／Dark 的文字對比與登入行為。四份共用樣式／圖示與元件庫逐檔一致。
- 圓角輸入更新：32 項既有輸入、類別選擇、權限、數量及畫面檢查通過；最後的共用樣式另外通過 8 項 Light／Dark 跨平台檢查。三份樣式逐檔確認與元件庫完全一致。
- 2026-09-27：完整瀏覽器回歸 370 passed／18 skipped（平台限定項目）；最後一輪分段選擇修復後，另外 12 項跨平台畫面／互動檢查全部通過。
- Rust domain 6 項、Node 35 項測試通過；`npm run check` 通過。部署產物已重新建置，本次未部署至 Firebase。
- 程式檢查：`npm run check`。
- 既有完整瀏覽器回歸：桌面、平板、手機、WebKit；涵蓋付款／供應量、草稿、權限、出單機、登入、排序、觸控、離線、PWA。
- 新增 `M3 screens and dialogs` 瀏覽器檢查：11 個主要畫面與商品明細／編輯視窗，Light／Dark，桌面／平板／手機／WebKit；等待動畫結束後執行 axe，避免將進場透明度誤判為顏色問題。
- 使用 Chrome 實際檢查桌面與 375px 手機版，採本機獨立 RPC 假資料，未連接正式訂單或出單機。
- 回歸結果與檢查圖片由 Playwright 儲存於 `test-results/`；本機修復巡檢紀錄位於 `artifacts/ui-review/`。
- 原本 `maximum-scale=1` 的 viewport 設定保留；自動無障礙掃描會回報既有 `meta-viewport` 項目，不能把結果解讀為完整 WCAG 認證。
