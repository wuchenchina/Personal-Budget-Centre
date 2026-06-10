# Development Standards

本文件用於 Version 1 之後接續開發，目標是保持代碼可維護、可部署、可審計。

## 基本原則

- 回覆與文檔以繁體中文為主。
- 前端只使用 TypeScript，不新增 JavaScript 業務檔。
- Node 指令優先使用 `yarn`。
- Ant Design 相關改動前先查 Ant Design MCP 文檔。
- 單檔超過 500 行不是硬性錯誤，但應優先拆分。
- 不回滾未確認來源的既有改動。
- 不把個人預算 mock data 放回前端。

## 前端標準

- 技術棧：Vite、React、TypeScript、Ant Design、`@ant-design/pro-components`。
- 新 API client 放在 `code/frontend/src/api`。
- 共用型別放在 `code/frontend/src/types`。
- 複雜狀態邏輯放在 `code/frontend/src/hooks`。
- UI 元件放在 `code/frontend/src/components`，按 domain 拆分。
- 登入/註冊優先沿用 Ant Design Pro 風格。
- 表單不要硬編匯率預設值；使用者不填 rate 時交由後端換算。
- 修改 UI 後至少跑：

```bash
cd code/frontend
yarn build
```

## 後端標準

- 技術棧：PHP 8.2+、Composer、PDO MySQL。
- HTTP entrypoint 為 `code/backend/public/index.php`。
- Route 分發集中在 `BudgetCentre\App`。
- 業務邏輯放在 `Services`。
- SQL 存取放在 `Repositories`。
- Request parsing 使用 `BudgetCentre\Http\Request`。
- API response 使用 `JsonResponse` / `FileResponse`。
- Validation 或授權錯誤使用 `AuthException`。
- 字串、日期、正整數等輸入使用 `Support\Input`。
- 權限檢查優先使用 `PermissionGuard`。
- 新 API route 必須考慮 session、CSRF、workspace/budget 權限。

## 資料庫標準

- 不在專案內建立 database。
- 不在 SQL 或初始化腳本加入 `CREATE DATABASE`、`DROP DATABASE`、`USE database`。
- schema 檔案順序：

```text
code/database/001_schema.sql
code/database/002_seed_currencies.sql
code/database/003_seed_template.sql
code/database/004_views.sql
```

- 初始化前先跑：

```bash
php code/backend/bin/init-database.php --dry-run
```

- 既有資料庫部署更新只跑 migration-only：

```bash
cd code/backend
composer db:migrate:dry-run
composer db:migrate
```

- 正式初始化既有 database：

```bash
cd code/backend
composer db:init
```

## 匯率標準

- 匯率資料儲存在 `exchange_rates`。
- 自動換算優先順序：

```text
manual > bochk > budget_default
```

- BOCHK provider 只使用 `Bank of China (Hong Kong) Limited`。
- BOCHK 外幣兌 HKD 使用客戶買入價；HKD 兌外幣使用客戶賣出價倒數。
- BOCHK 交叉匯率使用 `來源外幣 -> HKD` 再 `HKD -> 目標外幣`。
- 不再新增 HSBCHK 或 Mastercard provider，除非重新確認有公開、穩定、合法使用的牌價 API。

## 匯出標準

- PDF 匯出應通過 `BudgetExportService`。
- 匯出檔案寫入 backend storage，不寫入前端。
- 匯出 storage 可透過 `EXPORT_STORAGE_DIR` 指定；未指定時使用 `backend/storage/exports`。
- 匯出前需檢查 storage 目錄可建立且可寫，錯誤需回傳 JSON，不得讓 PHP warning 污染 API response。
- 匯出權限必須通過 `PermissionGuard::requireBudgetExport`。
- Admin 環境檢查需能回報 PHP extension 與匯出 storage 權限狀態。

### 預算文件 Template 還原標準

正式預算文件的視覺基準是：

```text
template/Personal Budget of 15th June to 15th July_New.docx
```

此 DOCX 是匯出與預覽的唯一樣式來源。任何 PDF/HTML/DOCX 匯出調整，都不得以「看起來相近」作為驗收依據；必須先解析或對照 DOCX OOXML，再落實到輸出層。若 mPDF/HTML 無法精準還原 DOCX 的表格模型，應改用 DOCX-first 或 OOXML/PHPWord 生成流程，再轉 PDF；不得自行重構為與 DOCX 邊框模型不同的 HTML 表格。

硬性規格如下：

- 頁面：A4 portrait，`w:pgSz w=11906 h=16838`。
- 頁邊距：上/下 `1440` DXA，左/右 `1800` DXA，header `851` DXA，footer `992` DXA。
- 文件網格：`w:docGrid type=lines linePitch=312 charSpace=0`。
- 標題：Times New Roman，14pt，置中；序數後綴如 `15th` 的 `th` 必須使用 superscript，不得以普通文字替代。
- 副標題：Times New Roman，14pt，置中。
- 表格樣式：Word `Table Grid`，styleId `3`，`tblW w=5000 type=pct`，`tblInd w=0 type=dxa`。
- 表格總寬：四欄 `tblGrid` 約 `3400 / 1703 / 1703 / 1708` DXA，等同約 `40% / 20% / 20% / 20%`；不得改成平均欄寬。
- 表格 cell margin：left/right `108` DXA，top/bottom `0` DXA。
- Table Grid 邊框：`single`，`sz=4`，`space=0`。此為 Word 邊框單位，約 0.5pt；不得任意改成較粗或較淡。
- 區塊標題列：四欄合併，fill `A4A4A4`，邊框 `single #7E7E7E sz=4`，SF Pro Text，10.5pt。
- 日期列：四欄合併，僅 top border 為 `single #7E7E7E sz=4`，left/bottom/right 為 `nil`，SF Mono Light，7.5pt。
- 表頭列：fill `D7D7D7`，SF Pro Text，7.5pt；第一欄左對齊，其餘欄右對齊；欄間垂直邊框使用 `single #7E7E7E sz=4`。
- 資料列：SF Mono Regular，7.5pt；第一欄左對齊，其餘欄右對齊；普通資料 cell 邊框多為 `nil`，不得補成全格線。
- Budget Highlights 最後一筆普通資料列 bottom border 為 `single #7E7E7E sz=4`。
- Total 列：fill `D7D7D7`，top border 為 `single #7E7E7E sz=4`；第一欄左對齊，其餘欄右對齊。
- Transaction Breakdown 沒有 Total 列；不得因共用表格元件而自動補 summary。
- 簽核/確認資訊區是可選追加區塊，不得破壞既有 Budget Highlights 與 Transaction Breakdown 的表格標準；其主題需沿用同一套灰階、字體、字號、邊線重量與列印語氣。
- 簽核/確認資訊區本質上應採有邊框的文件/支票式簽署區，不得以資料表方式呈現；一般佈局應為左側資訊區、右側簽名區。
- 簽核/確認資訊區可以使用 HTML block、float、inline-block 等版面方式；不得因 mPDF 便利而把整個區塊退回 table-row/table-cell 的資料表方案。
- 簽名盒需保留足夠空白，線條需適合雷射打印與掃描；不得使用密集防偽紋理、深色底紋或其他會影響手寫簽名辨識的效果。

匯出修改的開發流程：

1. 先用 OOXML 解析 template，確認 `word/document.xml`、`word/styles.xml`、`word/fontTable.xml` 的相關屬性。
2. 實作前寫明會影響哪些 template 屬性，例如 `tblGrid`、`tcBorders`、`shd fill`、`rFonts`、`jc`。
3. 禁止把多段 Word 表格結構主觀改成另一種 HTML table 結構，除非已證明輸出後邊框、欄寬、字距與 Word template 完全一致。
4. 任何 PDF 樣張都必須與 template 對照：邊框位置、缺線位置、合併列、背景色、欄寬、字體、字號、對齊方式。
5. 若新增簽核/確認資訊區，必須先定義它與原 template 的關係：是追加區塊、可選區塊，還是新版本 template。不得讓追加區塊破壞既有兩張表格的標準。
6. 若使用 HTML/mPDF 匯出，必須特別驗證 Word 中 `nil` 邊框位置；HTML `border-collapse` 的全格線模型通常不等於本 template。
7. 若通過上層審核是目標，不得以美觀優化取代 template 還原；視覺調整必須先更新 template 標準，再同步實作。

## Passkey 標準

- 正式環境必須使用 HTTPS。
- RP ID 必須等於正式域名，例如 `bc.tool.axchen.top`。
- Credential 管理 API 不得回傳 credential secret material。

## 部署標準

- 根目錄執行：

```bash
./deploy.sh
```

- 部署腳本可以生成遠端 backend `.env`，但不得建立 MySQL database。
- `./deploy.sh sync` 不得執行資料庫初始化、reset 或 migration；資料庫變更必須用 `./deploy.sh migrate`，且只能跑 non-destructive migration-only。
- 只有 `./deploy.sh fresh` 能 reset database objects，且必須有明確確認。
- 部署腳本需在本地 `Ctrl+C` / TERM 時嘗試停止本次 token 標記的遠端長任務，不得讓遠端 composer、reset、init 或 migration 孤兒化繼續執行。
- Web server 需把 `/api/*` rewrite 到：

```text
/www/wwwroot/bc.tool.axchen.top/backend/public/index.php
```

- 部署後至少驗證：

```text
GET /api/health
GET /
登入、建立 workspace、建立 budget、刷新匯率、建立 transaction、匯出 PDF
```

## 提交前檢查

提交前至少執行：

```bash
cd code/backend && composer validate --strict
cd code/backend && composer check
cd code/frontend && yarn build
php code/backend/bin/init-database.php --dry-run
php code/backend/bin/init-database.php --dry-run --migrations-only
bash -n deploy.sh
```

若未能執行某項檢查，需要在交接說明中明確寫出原因。
