# BudgetCentre Code

此目錄是可部署程式碼，分為前端、後端與資料庫 SQL。

## 目錄

```text
code/
  frontend/   # Vite + React + TypeScript + Ant Design
  backend/    # PHP API + PDO + Composer
  database/   # 建表、seed、view SQL
```

## 資料來源原則

- 前端不保存實際預算、交易、共享或成員資料。
- 模板結構由後端 API 提供。
- 模板結構儲存在 MySQL `budget_templates` 表。
- 實際預算資料儲存在 `budgets`、`budget_items`、`budget_transactions` 等表。
- 多貨幣交易保存原始金額、原始貨幣、凍結匯率與基準貨幣金額。

## SQL 執行順序

資料庫本身由網頁端或部署平台預先建立，本專案不包含 `CREATE DATABASE`。

在已選定的 database 中依序執行：

```text
database/001_schema.sql
database/002_seed_currencies.sql
database/003_seed_template.sql
database/004_views.sql
```

`003_seed_template.sql` 只寫入模板結構和樣式，不寫入任何個人預算內容。

## 前端

前端使用 TypeScript。

```bash
cd frontend
yarn
yarn build
```

正式環境配置：

```bash
cp .env.example .env
```

設定：

```text
VITE_API_BASE_URL=https://your-budget-api.example.com
```

## 後端

```bash
cd backend
composer install
cp .env.example .env
```

後端 `.env` 需要配置：

```text
APP_URL=https://your-budget-frontend.example.com
API_URL=https://your-budget-api.example.com

DB_HOST=...
DB_PORT=3306
DB_NAME=...
DB_USER=...
DB_PASSWORD=...

WEBAUTHN_RP_ID=your-budget-frontend.example.com
WEBAUTHN_RP_NAME=BudgetCentre
WEBAUTHN_ORIGIN=https://your-budget-frontend.example.com
```

Passkey / WebAuthn 正式環境必須使用 HTTPS。

## 目前階段

已完成：

- 前端 TypeScript 骨架。
- Ant Design 工作台布局。
- 模板 API client。
- PHP API skeleton。
- PDO connection factory。
- `budget_templates` repository。
- MySQL schema、seed、views。

尚未完成：

- 登入/session。
- Passkey challenge 生成與驗證。
- Workspace scoped budget CRUD。
- Budget editor 寫入資料庫。
- DOCX/PDF 真實匯出。

