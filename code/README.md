# BudgetCentre Code

此目錄包含可部署程式碼：

```text
code/
  frontend/             Vite + React + TypeScript + Ant Design
  backend/              Go API
  backend-php-legacy/   舊 PHP 後端封存
  database/             MySQL SQL
```

## 前端

```bash
cd frontend
yarn
yarn build
```

## 後端

```bash
cd backend
go test ./...
go run ./cmd/api
```

Go API 啟動時會自動處理空資料庫初始化與安全增量 migration，不建立 database，不提供 reset/fresh。

## 部署

根目錄 `deploy.sh` 只上傳檔案與寫入 `.env`。Docker Compose 啟動、停止、log 檢查與寶塔反代由伺服器端手動處理。
