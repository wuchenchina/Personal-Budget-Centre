# BudgetCentre

BudgetCentre 是一個個人生活預算網站，目標是把既有 Word 模板轉成可協作、可審計、可匯出、可部署的 Web 系統。

Version 1 已完成核心閉環：前端工作台、PHP API、MySQL schema、使用者/session、Passkey、Workspace/Workgroup、預算 CRUD、分類別名、共享權限、交易/預算項、匯率、PDF 匯出、資料庫初始化與部署腳本。

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
- Category alias mapping
- Budget share API，支援 user/workgroup/workspace principal
- Currency API、manual exchange rate API
- BOCHK 匯率 provider
- 交易與預算項自動換算：`manual > bochk > budget_default`
- PDF 匯出與匯出歷史
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
| `./deploy.sh migrate` | 增量更新並套用非破壞性 migration/view SQL | 否 | 否 | 是 |
| `./deploy.sh fresh` | 焕新部署 | 是 | 是 | 是 |

`fresh` 是破壞性操作，會清空 `/www/wwwroot/bc.tool.axchen.top` 內既有檔案，並 reset 既有 MySQL database objects，再重新初始化資料表、seed 與 views。它不會建立 database，本專案假設 database 已在面板或 MySQL 內預先建立。

`sync` 模式只同步檔案、寫入 backend `.env` 並安裝依賴，不會執行任何資料庫初始化或 migration；即使誤帶 `RUN_DB_INIT=1` 也會直接拒絕，以避免同步部署清理或覆蓋使用者預算資料。需要資料庫更新時請使用 `./deploy.sh migrate`，它只執行 `code/database` 中的非破壞性 migration/view SQL；完整初始化只允許在已確認的 `fresh` 模式中執行。

部署腳本會為本次遠端長任務標記唯一 token；若本地以 `Ctrl+C` 中斷，會嘗試停止同 token 的遠端 composer / migration / reset / init 任務，避免遠端在本地退出後繼續改動。

部署輸出會按步驟顯示總進度條、耗時與失敗階段；若終端不支援色彩或需要純文字輸出，可使用 `NO_COLOR=1 ./deploy.sh sync`。部署期間會複用 SSH 連線，減少多段遠端操作的握手時間。

部署前會檢查遠端根目錄是否為空；`fresh` 模式在清資料庫前會先跑一次 reset dry-run，方便確認即將清理的資料庫 objects。

可用的輔助參數：

```bash
SKIP_BUILD=1 ./deploy.sh
SKIP_DB_INIT=1 ./deploy.sh migrate
FORCE_COMPOSER_INSTALL=1 ./deploy.sh
RSYNC_COMPRESS=1 ./deploy.sh
RSYNC_CHECKSUM=1 ./deploy.sh
```

遠端 Composer 依賴預設會用 `composer.lock` 雜湊判斷；lockfile 沒變且 `vendor/autoload.php` 存在時會跳過 `composer install`。`FORCE_COMPOSER_INSTALL=1` 可強制重跑。rsync 預設採快速的 size/time 比對；網路很慢時可開 `RSYNC_COMPRESS=1`，需要字體 checksum 校驗時再開 `RSYNC_CHECKSUM=1`。

`deploy.sh` 內已包含正式域名、SSH、MySQL、SMTP、WebAuthn RP、Composer proxy 等遠端部署配置；不要把這些正式資料同步到 `.env.example`。

部署腳本主要流程：

- 以 `bc.tool.axchen.top` 建置前端
- 上載 `frontend/dist`
- 上載 backend 與 database SQL
- 上載 PDF 匯出字體到 `/www/wwwroot/bc.tool.axchen.top/font`
- 在遠端生成 backend `.env`
- 遠端執行 `composer install --no-dev --optimize-autoloader`
- 按部署模式決定是否跳過、migrate 或 fresh 初始化既有 MySQL database

部署腳本不建立 database。

Web server 仍需配置：

```text
Route /api/* to /www/wwwroot/bc.tool.axchen.top/backend/public/index.php
```

匯出檔案預設寫入：

```text
/www/wwwroot/bc.tool.axchen.top/backend/storage/exports
```

每份預算每種格式預設只保留最近 3 份匯出檔案，新的匯出完成後會自動清理更舊的檔案與資料庫記錄。可在 backend `.env` 調整：

```text
EXPORT_RETENTION_PER_BUDGET=3
```

若寶塔面板或 PHP-FPM 使用者無法寫入 backend 目錄，可在 backend `.env` 設定可寫目錄：

```text
EXPORT_STORAGE_DIR=/www/wwwroot/bc.tool.axchen.top/storage/exports
```

PDF 產生時的 mPDF 暫存目錄預設為 `backend/storage/tmp/mpdf`，不要放在公開匯出目錄；如需移動可設定：

```text
MPDF_TEMP_DIR=/www/wwwroot/bc.tool.axchen.top/backend/storage/tmp/mpdf
```

目錄需授權給實際執行 PHP-FPM 的使用者。後台「环境检查」會檢查匯出目錄是否存在、是否可寫，以及常用 PHP extension 是否已啟用。寶塔面板常見需確認的 extension 包含：

```text
pdo_mysql, mbstring, dom, xml, xmlwriter, zip, zlib, curl, openssl, fileinfo, gd
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

登入 admin 後，左側側邊欄會出現「后台」。目前後台支援搜尋與篩選使用者、啟用/停用帳號、標記郵箱已驗證、重發驗證郵件、授予/撤銷 admin，以及檢查 PHP extension 與匯出 storage 權限。系統禁止 admin 停用自己或撤銷自己的 admin 權限。

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
- 外幣兌 HKD 使用客戶買入價；HKD 兌外幣使用客戶賣出價倒數
- 交叉匯率使用 `來源外幣 -> HKD` 再 `HKD -> 目標外幣`

不再接入 HSBCHK 或 Mastercard。

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
