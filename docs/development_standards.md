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

- 正式初始化既有 database：

```bash
cd code/backend
composer db:init
```

## 匯率標準

- 匯率資料儲存在 `exchange_rates`。
- 自動換算優先順序：

```text
manual > mastercard > bochk > budget_default
```

- BOCHK provider 只使用 `Bank of China (Hong Kong) Limited`。
- Mastercard provider 使用 `Mastercard International Incorporated`。
- 不再新增 HSBCHK provider，除非重新確認有公開、穩定、合法使用的牌價 API。
- Mastercard 日期要以官方 converter 可選日期為準；預設從今天減 2 天開始，不可直接假設今天可用。

## 匯出標準

- Markdown、DOCX、PDF 匯出都應通過 `BudgetExportService`。
- 匯出檔案寫入 backend storage，不寫入前端。
- 匯出 storage 可透過 `EXPORT_STORAGE_DIR` 指定；未指定時使用 `backend/storage/exports`。
- 匯出前需檢查 storage 目錄可建立且可寫，錯誤需回傳 JSON，不得讓 PHP warning 污染 API response。
- 匯出權限必須通過 `PermissionGuard::requireBudgetExport`。
- Admin 環境檢查需能回報 PHP extension 與匯出 storage 權限狀態。

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
- Web server 需把 `/api/*` rewrite 到：

```text
/www/wwwroot/bc.tool.axchen.top/backend/public/index.php
```

- 部署後至少驗證：

```text
GET /api/health
GET /
登入、建立 workspace、建立 budget、刷新匯率、建立 transaction、匯出 markdown
```

## 提交前檢查

提交前至少執行：

```bash
cd code/backend && composer validate --strict
cd code/backend && composer check
cd code/frontend && yarn build
php code/backend/bin/init-database.php --dry-run
bash -n deploy.sh
```

若未能執行某項檢查，需要在交接說明中明確寫出原因。
