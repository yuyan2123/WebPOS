# 舊版 Excel 資料移轉

`convert.py` 讀取 `database.xlsx`，輸出 Firebase 匯入 JSON 與核對報告，不修改 Excel。
`import.mjs` 將 JSON 寫入指定使用者擁有的既有店鋪。可替換成最終 Excel 後重新執行。

業務資料存放在 `shops/{shopId}/...`；`users/{uid}/shops/{shopId}` 只用於確認帳號與店鋪的關係。
程式不建立使用者、店鋪或成員，也不會把訂單存到 `users/{uid}/orders`。

## 安裝

以下 PowerShell 命令皆從儲存庫根目錄 `firebase/` 執行。需要 Python 3.10+、Node.js 22+。

```powershell
python -m pip install -r legacy-apps-script/data_trans/requirements.txt
npm --prefix functions ci
```

匯入端沿用 `functions` 的 Firebase Admin SDK 與 Rust 供應量計算模組。
若沒有 `functions/wasm/pos_domain.js` 和對應 Wasm，先依主專案安裝 Rust 工具鏈並執行 `npm run build:rust`。

## 1. 本機轉換

```powershell
python legacy-apps-script/data_trans/convert.py
# 指定最終檔案及輸出目錄：
python legacy-apps-script/data_trans/convert.py 'D:/exports/final.xlsx' --out 'D:/exports/converted'
```

預設來源為 `legacy-apps-script/database.xlsx`，輸出至此目錄的 `output/`：

- `database-<來源SHA前12碼>.json`：匯入資料，包含來源完整 SHA-256。
- `database-<來源SHA前12碼>.report.json`：來源／輸出筆數、金額總計與逐列問題。

來源檔、JSON 與核對報告可能含個資，均不納入版本控制；只有轉換程式、測試與說明納入。
公式、錯誤儲存格、重複 ID、未知非空白欄位、無法解析的日期／數字、損壞的禮盒 JSON、
沒有明細的訂單、找不到訂單的明細會中止轉換。錯誤時仍輸出報告，匯入 JSON 會標記為不可匯入。

核對報告中的警告不會中止轉換，例如舊資料沒有電話、空白尾款或付款狀態與尾款不一致。
應在正式移轉前核對這些列；程式保留資料，沒有根據「已付款」狀態猜測實收金額。

## 2. 指定專案、使用者與店鋪

使用者需先登入 POS 並建立目標店鋪。程式必須明確指定 `--project`，不依賴 Firebase CLI 的預設專案。
資料庫預設 `(default)`，其他資料庫使用 `--database DATABASE_ID`。

Admin SDK 使用執行環境的 Application Default Credentials。可使用已有的服務帳戶憑證：

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:/private/firebase-import-service-account.json'
```

憑證需要目標專案的 Firestore 讀寫及 Firebase Authentication 使用者讀取權限。
`--uid`／`--email` 是資料歸屬核對條件，並不是登入憑證，也不會冒用該帳號。
憑證設定方式見 [Firebase Admin SDK 官方說明](https://firebase.google.com/docs/admin/setup#initialize_the_sdk)。

可先列出指定帳號的店鋪：

```powershell
node legacy-apps-script/data_trans/import.mjs --project webpos-14776 --email '你的帳號@example.com' --list-shops
# 或使用 Firebase Authentication UID：
node legacy-apps-script/data_trans/import.mjs --project webpos-14776 --uid 'USER_UID' --list-shops
```

匯入會確認 Auth 帳號存在且未停用、店鋪的 `ownerUid` 等於該 UID，
且店鋪成員與使用者店鋪索引都記錄 `owner` 角色。僅為 editor/viewer 的店鋪不接受匯入。

## 3. 預覽，再正式匯入

將 `$migrationFile` 換成轉換步驟印出的 JSON 路徑，勿使用 `.report.json`。

```powershell
$migrationProject = 'webpos-14776'
$migrationUid = 'USER_UID'
$migrationShop = 'SHOP_ID'
$migrationFile = 'legacy-apps-script/data_trans/output/database-<來源SHA前12碼>.json'

# 預設只讀取與核對，不寫入。
node legacy-apps-script/data_trans/import.mjs --project $migrationProject --uid $migrationUid --shop $migrationShop --file $migrationFile

# 實際寫入同一指定店鋪。
node legacy-apps-script/data_trans/import.mjs --project $migrationProject --uid $migrationUid --shop $migrationShop --file $migrationFile --apply
```

回傳摘要列出目標專案、資料庫、UID、店名、shop ID，以及 `create`、`configure`、
`alreadyImported`、`unchanged`、`skip`、`conflict` 的筆數。`written` 是本次真正提交的文件筆數。
若有衝突，正式匯入也會在寫入前停止，結束碼為 2；其他失敗為 1。

預設不覆寫同 ID 的現有商品、客戶、訂單或供應量設定。
同一筆已成功匯入且來源內容未改變的記錄會跳過，現有 POS 後續修改也不會被重設。
如明確希望保留目的端所有既有同 ID 資料，只補入尚不存在的記錄，可加 `--on-existing skip`。
此選項也會保留目的端的既有星期設定；不會合併個別衝突欄位。

**本次 `database.xlsx` 是範例資料，僅做本機轉換與驗證，未匯入正式 Firebase。**
正式檔同 ID 的內容若與先前匯入版本不同，預設會回報衝突，不會自動用最終檔覆蓋試驗資料。

## 欄位轉換

| 舊工作表 | Firestore 位置 | 轉換 |
|---|---|---|
| Products | `shops/{shopId}/products/{ProductID}` | 保留名稱、分類、價格、特價、企業價、狀態與描述 |
| Customers | `shops/{shopId}/customers/{normalizedContact}` | 保留 CustomerID；補上聯絡類型、原值與搜尋用標準化值 |
| Orders + OrderDetails | `shops/{shopId}/orders/{OrderID}` | 保留 OrderID／DetailID；明細合併至 `items`，禮盒 JSON 轉物件 |
| CapacitySettings 星期列 | `shops/{shopId}/settings/capacity` | 七天設定合併到 `weekday` |
| CapacitySettings 指定日期列 | `shops/{shopId}/capacityOverrides/{YYYY-MM-DD}` | 保留每日上限與啟用狀態 |
| 訂單明細計算 | `shops/{shopId}/capacityUsage/{YYYY-MM-DD}` | 只在新訂單提交時累加非取消訂單的用量 |

欄名優先映射，因此一般欄位可以重新排序。兼容此檔案的 `Address`、`DeliverType`、`NA`、
`ReceivedName` 與帶反引號的供應量欄名。`ReceivedAddress` 依 `Code.gs` 第 17 欄實際用途映射為
`recipientPhone`，並保留文字原值。若最終檔此欄改成真正的收件地址，需先修正映射，不能直接沿用。
已知空白欄名依舊版位置處理：Orders 第 18 欄為企業客戶、Products 第 10 欄為企業價、
CapacitySettings 第 4 欄為覆寫日期；這些相容處理都會記錄在報告。

- 去除 Apps Script 的單一前置文字引號；不會去除電話的前導 0。
- 日期採台北時區，Firestore 建立／最後訂購時間存為 Timestamp，交貨日期仍為 `YYYY-MM-DD`。
- 電話保留原文，搜尋值只保留數字；完全相同的標準化聯絡方式採最後訂購時間較新的客戶資料並警告。
- `LINE` 標記轉成目前應用程式使用的 LINE 聯絡方式，以「LINE＋姓名」雜湊作為文件 ID，避免全部 LINE 客戶互相覆寫。
- 空白或無法辨識的電話保留原文並警告；數字型 Excel 電話會阻止轉換，避免猜測遺失的前導 0。
- 金額 `0` 保留為 `0`；空白特價／企業價保留空字串。空白訂金與運費為 0；空白尾款以總額減訂金補入並警告。
- 明細、訂單總額或付款合計不一致時保留來源數值並警告，不重算覆蓋歷史金額。

## 重跑與既有店鋪

每筆訂單與該日用量增量在同一 Firestore transaction 寫入，沿用正式程式的 Rust 計算。
因此不會把 Firebase 原有訂單的用量覆蓋掉；重跑已匯入訂單也不重複累加。
匯入不是整份檔案的單一 transaction：若連線或權限中途失敗，已提交資料保留，訊息會列出最後文件位置，
使用同一 JSON 重跑即可續行。匯入標記 `_legacyImport` 保存來源雜湊、記錄雜湊與指定 UID。

目標店鋪必須已有 `settings/capacity.usageVersion = 1`。目前 POS 新建店鋪符合此條件；
較早版 Firebase 店鋪需先用主專案的 `backfill:capacity` 重建計數。工具不會自行重建既有店鋪計數。
完成後以 JSON 報告的筆數／金額核對資料，並在 POS 確認訂單查詢、商品、禮盒、聯絡搜尋與日期供應量。

## 測試

```powershell
python -m unittest discover -s legacy-apps-script/data_trans -p test_convert.py -v
node --check legacy-apps-script/data_trans/import.mjs

# 需要 Java 21+；測試只允許 localhost emulator，使用合成資料。
npx -y firebase-tools emulators:exec --config legacy-apps-script/data_trans/firebase.emulators.json --project demo-ginjia-migration --only auth,firestore 'node legacy-apps-script/data_trans/test_import.mjs'
```

Python 測試涵蓋 0、空白尾款、日期、欄名相容、LINE 身分、錯誤／重複明細及原始 Excel 筆數／總額。
模擬器測試涵蓋指定店鋪歸屬、dry run、資料型別、衝突、重跑、斷線續行、併發計數、取消訂單及 CLI 帳號選擇。
