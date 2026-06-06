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
    deploy/          Nginx/寶塔等部署輔助配置
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

- 使用者註冊、登入、登出、Email 驗證、`/api/auth/me`
- HttpOnly session cookie、CSRF、Passkey 註冊/登入/credential 管理
- Admin 後台使用者管理
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

等同於增量部署。腳本會建置前端、驗證後端、同步檔案、寫入遠端 backend `.env`，並在遠端執行 composer install。預設不清空站點、不清空資料庫，也不跑資料庫初始化。

### 部署模式

| 命令 | 用途 | 是否清空站點 | 是否重置資料庫 | 是否跑 SQL 初始化 |
| --- | --- | --- | --- | --- |
| `./deploy.sh` | 日常增量更新 | 否 | 否 | 否 |
| `./deploy.sh sync` | 同上，明確指定增量模式 | 否 | 否 | 否 |
| `./deploy.sh migrate` | 增量更新並套用資料表、seed、view SQL | 否 | 否 | 是 |
| `./deploy.sh fresh` | 焕新部署 | 是 | 是 | 是 |

`fresh` 是破壞性操作，會清空 `/www/wwwroot/bc.tool.axchen.top` 內既有檔案，並 reset 既有 MySQL database objects，再重新初始化資料表、seed 與 views。它不會建立 database，本專案假設 database 已在面板或 MySQL 內預先建立。

部署前會檢查遠端根目錄是否為空；`fresh` 模式在清資料庫前會先跑一次 reset dry-run，方便確認即將清理的資料庫 objects。

可用的輔助參數：

```bash
SKIP_BUILD=1 ./deploy.sh
SKIP_DB_INIT=1 ./deploy.sh migrate
```

`deploy.sh` 內已包含正式域名、SSH、MySQL、SMTP、WebAuthn RP、Composer proxy 等遠端部署配置；不要把這些正式資料同步到 `.env.example`。

部署腳本主要流程：

- 以 `bc.tool.axchen.top` 建置前端
- 上載 `frontend/dist`
- 上載 backend 與 database SQL
- 在遠端生成 backend `.env`
- 遠端執行 `composer install --no-dev --optimize-autoloader`
- 按部署模式決定是否初始化既有 MySQL database

部署腳本不建立 database。

Web server 仍需配置：

```text
Route /api/* to /www/wwwroot/bc.tool.axchen.top/backend/public/index.php
```

寶塔/Nginx 伪静态可直接參考：

```text
code/deploy/nginx-pseudo-static.conf
```

Passkey/WebAuthn 正式環境必須使用 HTTPS，RP ID 使用：

```text
bc.tool.axchen.top
```

## Admin 使用者

Admin 權限存在 `users.is_admin`。系統不會自動建立 admin 帳號，第一個 admin 需要先在網站註冊一個普通帳號，再到伺服器 backend 目錄執行 CLI 授權。

遠端進入 backend：

```bash
ssh -i /Users/wuchenchina/Documents/140.210.14.109_sshkey_id_ed25519 -p 22 root@140.210.14.109
cd /www/wwwroot/bc.tool.axchen.top/backend
```

授予 admin：

```bash
php bin/grant-admin.php --email=user@example.com --yes
```

如果該使用者郵箱尚未驗證，可以同時標記為已驗證並啟用帳號：

```bash
php bin/grant-admin.php --email=user@example.com --verify-email --yes
```

也可以用 username：

```bash
php bin/grant-admin.php --username=admin --yes
```

撤銷 admin：

```bash
php bin/grant-admin.php --email=user@example.com --revoke --yes
```

這個 CLI 只更新既有使用者，不建立 database，也不建立使用者。`fresh` 部署會重置資料庫，因此 admin 帳號也需要重新註冊並重新授權。

登入 admin 後，左側側邊欄會出現「后台」。目前後台支援搜尋與篩選使用者、啟用/停用帳號、標記郵箱已驗證、重發驗證郵件、授予/撤銷 admin。系統禁止 admin 停用自己或撤銷自己的 admin 權限。

## 郵箱驗證

新註冊使用者必須完成郵箱驗證後才能登入。驗證郵件中的連結會打開前端頁面：

```text
https://bc.tool.axchen.top/email/verify?token=...
```

前端會再呼叫後端 `/api/auth/email/verify` 完成驗證。若 token 已使用但該使用者已完成驗證，系統會顯示已驗證成功，而不是直接返回 JSON 錯誤。

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
