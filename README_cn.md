# BudgetCentre

BudgetCentre 是一個個人與共享預算工作區，使用 React、TypeScript、
Ant Design 與 Go API 建置。它支援預算專案、工作區角色、通行密鑰、
SSO、匯率、記帳紀錄與 PDF 匯出。

英文版說明請見 `README.md`。

## 技術棧

- 前端：Vite、React、TypeScript、Ant Design
- 後端：Go HTTP API
- 資料庫：MySQL，由 `code/database` 初始化並執行 migration
- 執行環境：Docker Compose，包含 Nginx web container 與 Go API container

## 專案結構

```text
.
  code/
    frontend/             Vite + React 應用
    backend/              Go API
    database/             schema、seed、view 與 migration SQL
    deploy/docker/        Docker 使用的 Nginx 設定
    font/                 本機 PDF 字型資產，除了 README.md 外均忽略
  Dockerfile
  docker-compose.yaml
  deploy.example.sh       公開部署範本
  .env.example            應用環境變數範本
```

## 本機開發

先從範本建立環境設定：

```bash
cp .env.example .env
```

安裝並建置前端：

```bash
cd code/frontend
yarn install --frozen-lockfile
yarn build
```

執行後端測試：

```bash
cd code/backend
go test ./...
```

本機啟動 API：

```bash
cd code/backend
go run ./cmd/api
```

第一位成功註冊的使用者會自動成為 admin。若既有資料庫沒有 admin
使用者，可手動設定 `users.is_admin = 1`。

## 設定

執行時設定會從 `.env` 讀取。真實 secret 不應提交到 git。

重要設定：

- `APP_KEY`：安全 token 與 SSO 流程必需。
- `APP_URL` 與 `API_URL`：公開前端/API origin。
- `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`：MySQL 連線資訊。
- `WEBAUTHN_RP_ID` 與 `WEBAUTHN_ORIGIN`：必須符合正式部署網域。
- `CASDOOR_*`：可選的 Casdoor SSO 設定。
- `SMTP_*`：可選的郵件設定。
- `WEB_BIND`：web container 的 host bind，預設為 `127.0.0.1:18080`。

## PDF 字型

PDF 匯出會使用 `code/font` 下的本機字型檔。許多系統字型不可重新散布，
因此字型二進位檔會被忽略。現有 PDF 主題需要的檔名請見
`code/font/README.md`。

## Docker

建置並啟動應用：

```bash
docker compose build
docker compose up -d
```

web service 會綁定到 `WEB_BIND`，預設為：

```text
127.0.0.1:18080
```

API 產生的檔案、暫存檔與日誌會存放於：

```text
storage/exports
storage/tmp
storage/logs
```

## 資料庫

MySQL 預期在 Docker 外部執行。Go API 啟動時會執行安全 bootstrap：

- 空資料庫：套用 `code/database/*.sql`。
- 既有資料庫：建立或更新 `schema_migrations`，再套用尚未執行的安全 migration。

應用不提供具破壞性的 reset/drop/truncate 流程。

## 部署

`deploy.example.sh` 是公開範本。部署時請複製為本機私有腳本，並填入伺服器、
SSH、網域、資料庫、SMTP 與 SSO 等值：

```bash
cp deploy.example.sh deploy.local.sh
chmod +x deploy.local.sh
./deploy.local.sh
```

部署腳本會：

- 執行前端 `yarn build`，
- 將前端資產複製到 `build/deploy/frontend`，
- 執行 `go test ./...`，
- 將 Go API 交叉編譯到 `build/deploy/backend/budgetcentre-api`，
- 只上傳 release allowlist，
- 寫入遠端 `.env`。

它不會啟動 Docker、不會重啟服務，也不會修改資料庫。上傳完成後，在伺服器執行：

```bash
cd /path/to/budgetcentre
docker compose build
docker compose up -d
```

## Git 衛生

此 repository 以開源友善為目標。請不要提交：

- `.env*` 檔案，除了 `.env.example`
- `deploy.local.sh` 或其他私有部署腳本
- `BudgetCentre_old/`、`template/`、`parsed_templates/`
- `docs/` 與 AI/agent 工作檔案
- `build/`、`dist/`、`node_modules/`、`vendor/`、`storage/`
- `code/font` 內的本機字型二進位檔
- `__pycache__`、log、作業系統或編輯器 metadata
