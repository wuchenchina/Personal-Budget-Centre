# BudgetCentre

BudgetCentre 是一個個人生活預算網站，目標是把既有 Word 模板轉成可協作、可審計、可匯出、可部署的 Web 系統。

Version 1 已完成核心閉環：前端工作台、PHP API、MySQL schema、使用者/session、Passkey、Workspace/Workgroup、預算 CRUD、分類別名、共享權限、交易/預算項、匯率、對賬、Markdown/DOCX/PDF 匯出、資料庫初始化與部署腳本。

## 目錄

```text
.
  code/
    frontend/        Vite + React + TypeScript + Ant Design
    backend/         PHP API + Composer + PDO
    database/        MySQL 建表、seed、view SQL
  docs/
    budget_website_plan.md
    development_progress.md
    development_standards.md
  scripts/
    parse_budget_docx.py
  parsed_templates/
    已解析的模板輸出
  template/
    原始模板與參考前端
  deploy.sh
```

## Version 1 範圍

- 使用者註冊、登入、登出、`/api/auth/me`
- HttpOnly session cookie、CSRF、Passkey 註冊/登入/credential 管理
- Workspace、Workspace member、Workgroup CRUD
- Budget list/detail/create/update/delete
- Budget item 與 transaction CRUD
- Category alias mapping 與 reconciliation
- Budget share API，支援 user/workgroup/workspace principal
- Currency API、manual exchange rate API
- BOCHK 與 Mastercard 匯率 provider
- 交易與預算項自動換算：`manual > mastercard > bochk > budget_default`
- Markdown、DOCX、PDF 匯出與匯出歷史
- MySQL schema、seed、views
- 不建立 database 的初始化腳本
- 根目錄部署腳本

## 本地開發

前端：

```bash
cd code/frontend
yarn
yarn build
```

後端：

```bash
cd code/backend
composer install
composer validate --strict
composer check
```

資料庫 dry-run：

```bash
cd code/backend
composer db:init:dry-run
```

正式初始化既有 database：

```bash
cd code/backend
composer db:init
```

初始化腳本只執行 `code/database` 內的表、seed、view SQL，不包含 `CREATE DATABASE`。

## 部署

部署腳本在專案根目錄：

```bash
./deploy.sh
```

腳本會：

- 以 `bc.tool.axchen.top` 建置前端
- 上載 `frontend/dist`
- 上載 backend 與 database SQL
- 在遠端生成 backend `.env`
- 遠端執行 `composer install --no-dev --optimize-autoloader`
- 初始化既有 MySQL database

部署腳本不建立 database。

Web server 仍需配置：

```text
Route /api/* to /www/wwwroot/bc.tool.axchen.top/backend/public/index.php
```

Passkey/WebAuthn 正式環境必須使用 HTTPS，RP ID 使用：

```text
bc.tool.axchen.top
```

## 匯率來源

BOCHK：

- Source name: `Bank of China (Hong Kong) Limited`
- 用於銀行電匯牌價
- 儲存 mid rate，同時保留客戶賣出/客戶買入

Mastercard：

- Source name: `Mastercard International Incorporated`
- 用於 card network conversion rate
- 日期以官方 converter 可選日期為準，預設從今天減 2 天開始，失敗時向前 fallback

不再接入 HSBCHK。

## 驗證狀態

最近一次通過：

```bash
cd code/backend && composer validate --strict
cd code/backend && composer check
cd code/frontend && yarn build
php code/backend/bin/init-database.php --dry-run
bash -n deploy.sh
```

已知剩餘事項：

- 正式 DB/API smoke test
- 正式站點 browser preview
- Vite chunk size warning

後續開發請先閱讀 [docs/development_standards.md](docs/development_standards.md)。
