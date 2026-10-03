# 購物車兩段式刪除

## 設計依據

[Apple swipeActions](https://developer.apple.com/documentation/swiftui/view/swipeactions(edge:allowsfullswipe:content:)) 與 [UIKit full swipe](https://developer.apple.com/documentation/uikit/uiswipeactionsconfiguration/performsfirstactionwithfullswipe) 採用短滑顯示操作、完整滑動執行第一個操作的清單模式。[Material Design gestures](https://m1.material.io/patterns/gestures.html) 區分捲動與橫向移除，使用距離門檻；[W3C Pointer Cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html) 建議在放開時完成操作，允許取消；[Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) 要求拖動以外的點選替代入口。

本系統的門檻與時間是產品決策，沒有宣稱它們是 Apple 或 Material 的固定規定。

## 行為

- 向左滑動至少 44px，放開後露出右側 88px 的紅色「刪除」操作。
- 同一次手勢可繼續向左滑；超過商品列寬的 65% 或 160px（取較大者），顯示「放開刪除」。放開後才移除，向右滑回門檻內可取消。
- 點「更多」只顯示刪除操作，再點紅色「刪除」才刪除。鍵盤可用 Enter／Space；Escape 或右方向鍵先收起操作，Escape 再次按下才關閉購物車。
- 只開啟一列操作，點其他列／外部會收起。數量控制、禮盒編輯不啟動滑動；垂直手勢維持原生捲動。
- Pointer cancellation、非預期擷取遺失、購物車關閉、視窗尺寸或資料變更會取消；正常的文字元素 → 商品列擷取轉移保留手勢。商品以物件身分識別，避免資料更新後錯刪另一列。
- 商品、件數、總額與草稿即時更新。刪除中的殘影為 inert／aria-hidden，不會接受第二次刪除或參與鍵盤操作。焦點返回下一列／前一列的「更多」，空白時返回購物車關閉按鈕。
- 原本的數量增減、價格、禮盒內容與配送計算保留。

## 過渡與效能

跟手移動使用暫停的 Web Animations transform 動畫，指標移動只調整 currentTime；不逐幀改寫 style/class，避免觸發全站無障礙與捲軸掃描。方向辨識與距離門檻只在狀態變化時更新標示。

刪除採 160ms 滑出／淡出，其他商品以 180ms 位移補位。先批次讀取位置，再同步更新資料與 DOM，最後以 FLIP 的反向位移補間呈現；不逐幀動畫 height、width、margin 或 padding。每次刪除從目前可見位置接續；殘影與補位分離，快速連續刪除不會重播資料操作。偏好減少動態時直接更新，購物車關閉會清理動畫。

本機 Chromium、CPU 降速 4 倍、48 次指標移動的初次巡檢：4 次 Layout、約 16.23ms LayoutDuration、商品列 style/class mutation 3 次。這是指定本機情境的瀏覽器計數，並非真機 FPS 保證。可重跑 `cart drag stays composited with four times CPU slowdown` 檢查，輸出 `cart-swipe-performance.json`。

## 維護

`src/ui/cart-swipe.js` 處理手勢與動畫；`src/app/cart-detail.js` 保留商品與金額流程、身分與焦點；`src/app/cart.js`、`src/ui/accessibility.js` 共用取消／關閉。樣式在 `../web-ui-kit/styles/pos.css` 及本專案快照同步，保留其他既有差異。

回歸涵蓋兩段點選、短滑／持續長滑、放開／滑回取消、模型變更、快速刪除、降低動態、真實觸控事件、四倍 CPU 降速、原購物車／禮盒與訂單流程。
