# BudgetCentre

BudgetCentre 是個人生活預算網站，前端使用 Vite + React + TypeScript + Ant Design，後端已遷移為 Go API，正式運行由 Docker Compose 驅動。

## 目錄

```text
.
  code/
    frontend/             Vite + React + TypeScript + Ant Design
    backend/              Go API
    backend-php-legacy/   舊 PHP 後端封存，只供比對/回退參考
    database/             MySQL 建表、seed、view、migration SQL
    deploy/docker/        Docker Nginx 配置
  Dockerfile
  docker-compose.yaml
  deploy.sh
```

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
go test ./...
go run ./cmd/api
```

## Docker Compose

Compose 同時提供前端靜態站與 Go API：

```bash
docker compose build --no-cache
docker compose up -d
```

預設 Web 入口綁定：

```text
127.0.0.1:18080
```

寶塔只需把正式域名反向代理到該入口。

Compose 模板不保存資料庫密碼、APP_KEY、SMTP 密碼、Casdoor secret 等敏感值；正式值由 `deploy.sh` 在伺服器目錄寫入 `.env`。容器只透過 `env_file: .env` 讀取。

API 產生的匯出檔、暫存檔與日誌會持久化到專案目錄下：

```text
storage/exports
storage/tmp
storage/logs
```

`deploy.sh` 同步時會排除 `.env` 和 `storage/`，避免部署時覆蓋配置或刪除持久化資料。

## 資料庫

- MySQL 由宿主機提供，不容器化。
- Docker 內預設使用 `DB_HOST=172.17.0.1`。
- Go API 啟動時自動執行安全 bootstrap：
  - 空 database：套用 `code/database/*.sql` 初始化。
  - 既有 database：建立/更新 `schema_migrations`，套用尚未執行的安全增量。
- 不提供 fresh/reset/drop/truncate/清空資料功能。
- 匯率只保留 current rows：
  - `exchange_rates` 只保留目前最新匯率，每次手動或 BOCHK 更新都覆蓋同 scope/source/pair/type 的 current row。
  - `exchange_rate_history` 表保留給舊庫相容，但新後端不再寫入；升級 migration 會清空既有 history 內容。
  - legacy provider current（例如舊 Mastercard 或 BOCHK mid/card）會在升級時移出 current 表。
  - BOCHK 匯率由 Go API 啟動後檢查，之後每 4 小時刷新一次；管理介面仍可人工刷新。
- 幣種是獨立目錄：
  - 空庫不預置貨幣；管理端可從前端本地儲備加入常用貨幣，也可新增 BOCHK 不支援的貨幣。
  - BOCHK refresh 會自動補齊 HKD 與 feed 支援貨幣，但不再標記為供應商託管，也不阻止刪除。
  - 刪除貨幣前會清掉純匯率引用；若已有預算、交易、帳戶等真正業務資料引用，後端仍會拒絕刪除。
  - 舊資料庫若殘留 TWD/MOP，可先執行 `scripts/legacy_currency_audit.sql` 檢查引用，再視結果執行 `scripts/legacy_currency_cleanup.sql` 做安全刪除。

第一個成功註冊的使用者會自動成為 admin。既有資料庫若沒有 admin，可手動更新 `users.is_admin = 1`。

## 部署

`deploy.sh` 只負責建置驗證、上傳檔案與寫入遠端 `.env`，不啟動 Docker、不重啟服務、不操作資料庫：

```bash
./deploy.sh
```

上傳完成後，在伺服器手動執行：

```bash
cd /www/wwwroot/bc.tool.axchen.top
docker compose build --no-cache
docker compose up -d
```

Go API 仍維持既有 `/api/*` JSON envelope、HttpOnly session cookie 與 CSRF 合約。
