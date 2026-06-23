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
docker compose up -d --build
```

預設 Web 入口綁定：

```text
127.0.0.1:18080
```

寶塔只需把正式域名反向代理到該入口。

## 資料庫

- MySQL 由宿主機提供，不容器化。
- Docker 內預設使用 `DB_HOST=172.17.0.1`。
- Go API 啟動時自動執行安全 bootstrap：
  - 空 database：套用 `code/database/*.sql` 初始化。
  - 既有 database：建立/更新 `schema_migrations`，套用尚未執行的安全增量。
- 不提供 fresh/reset/drop/truncate/清空資料功能。

第一個成功註冊的使用者會自動成為 admin。既有資料庫若沒有 admin，可手動更新 `users.is_admin = 1`。

## 部署

`deploy.sh` 只負責建置驗證、上傳檔案與寫入遠端 `.env`，不啟動 Docker、不重啟服務、不操作資料庫：

```bash
./deploy.sh
```

上傳完成後，在伺服器手動執行：

```bash
cd /www/wwwroot/bc.tool.axchen.top
docker compose up -d --build
```

Go API 仍維持既有 `/api/*` JSON envelope、HttpOnly session cookie 與 CSRF 合約。
