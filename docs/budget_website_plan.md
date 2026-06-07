# 個人生活預算網站完整方案

## 1. 目標

建立一個用於管理個人生活預算的網站，支援：

- 多用戶
- 工作區與工作組
- 預算共享
- 角色與權限控制
- Passkey / WebAuthn 登入，支援 macOS passkey
- 多貨幣
- 預算週期管理
- 預算摘要表
- 交易明細表
- 模板預覽
- 匯出 PDF
- MySQL 持久化儲存

技術棧：

- 前端：Vite + React + TypeScript + Ant Design 5
- 後端：PHP 8.x + Composer + PDO
- 資料庫：MySQL 8.x
- 匯出：mPDF 產生 PDF

資料庫由網頁端預先建立，本專案只提供建立資料表、索引、外鍵、view、seed data 的 SQL 文件，不包含 `CREATE DATABASE`。

## 2. 專案結構

```text
BudgetCentre/
  frontend/
    src/
      api/
      components/
      pages/
      styles/
        fonts.css
        budget-document.css
      types/
  backend/
    composer.json
    public/
      index.php
    src/
      Controllers/
      Middleware/
      Services/
      Repositories/
      Database/
  database/
    001_schema.sql
    002_seed_currencies.sql
    003_seed_template.sql
    004_views.sql
  docs/
    budget_website_plan.md
  scripts/
    parse_budget_docx.py
  parsed_templates/
```

## 3. 前端方案

前端第一屏直接進入預算工作台，不做營銷 landing page。

主要頁面：

- 登入頁：email / password + Passkey。
- Security Settings：管理密碼、Passkey、登入裝置。
- Workspace Switcher：切換個人工作區、家庭工作區、共享工作區。
- Dashboard：顯示當前預算週期、總預算、預估實際、差異、多貨幣概覽。
- Budget List：列出所有預算週期，可按年份、貨幣、狀態篩選。
- Budget Editor：核心編輯頁。
- Categories：管理分類與分類別名。
- Currencies：管理啟用貨幣與匯率。
- Templates：預覽與管理預算模板。
- Exports：查看匯出記錄與下載 PDF。
- Members & Permissions：管理工作區成員、工作組、角色、邀請。
- Sharing Center：查看所有共享給我、我共享出去的預算。

Ant Design 使用：

- `Layout`：整體頁面框架。
- `Menu`：左側導航。
- `Form`：預算基本資訊、分類、匯率、登入。
- `DatePicker.RangePicker`：預算週期。
- `Table`：預算摘要與交易明細。
- `InputNumber`：金額輸入。
- `Select`：貨幣、分類、帳戶選擇。
- `Modal` / `Drawer`：新增交易、編輯分類、匯率確認。
- `Statistic`：Dashboard 金額摘要。
- `Alert`：顯示資料不一致，例如交易總額與 Estimated Actuals 不一致。
- `Tree` / `Transfer`：管理工作組成員。
- `Tag`：顯示 owner、admin、editor、viewer、auditor。
- `Popconfirm`：刪除共享、移除成員、轉移所有權前確認。

## 4. 工作區、工作組與共享模型

核心概念：

- `User`：登入用戶。
- `Workspace`：資料隔離邊界，可以是個人、家庭、朋友、公司或任意共享空間。
- `Workgroup`：工作區內的成員分組，例如 Family、Couple、Roommates、Finance Review。
- `Budget`：屬於一個 Workspace，可設定 owner，可被共享給人、工作組或整個工作區。
- `Share`：針對單個 budget 的共享授權。
- `Role`：角色，例如 owner、admin、editor、viewer、auditor。
- `Permission`：細粒度能力，例如 budget.read、transaction.write、export.create。

建議規則：

- 每個 user 註冊後自動建立一個 personal workspace。
- budget 必須屬於某個 workspace。
- budget 有 `owner_user_id`，表示該預算文件的擁有者。
- workspace 有 `owner_user_id`，表示該工作區的最高管理者。
- workspace 成員可透過角色取得預設權限。
- budget 可以額外共享給某些 user 或 workgroup，形成覆蓋權限。
- 不建議第一版做真正匿名公開分享；如需分享連結，應使用有期限、只讀、可撤銷 token。

共享範圍：

- `private`：只有 budget owner 與 workspace owner 可見。
- `workspace`：工作區內所有成員可見。
- `workgroup`：指定工作組可見。
- `selected_users`：指定用戶可見。
- `link`：只讀連結，預設關閉，需手動啟用。

「所有人」定義：

- 系統層面的所有人不應預設可見，避免個人財務資料外洩。
- 產品裡的「所有人」建議定義為「目前 workspace 內所有成員」。
- 若真的需要全站所有註冊用戶可見，需獨立 permission：`global.read`，預設不可用。

角色建議：

| Role | 用途 |
| --- | --- |
| owner | 擁有所有權，可轉移所有權、刪除 workspace / budget |
| admin | 管理成員、分類、模板、匯率、共享 |
| editor | 建立與編輯預算、交易、分類 |
| viewer | 只讀預算與交易 |
| auditor | 只讀、查看 reconciliation、查看 audit logs、可匯出 |

細粒度權限：

| Permission | 說明 |
| --- | --- |
| workspace.read | 查看工作區 |
| workspace.update | 修改工作區設定 |
| workspace.members.manage | 管理成員 |
| workgroup.manage | 管理工作組 |
| budget.create | 建立預算 |
| budget.read | 查看預算 |
| budget.update | 編輯預算 |
| budget.delete | 刪除預算 |
| budget.owner.transfer | 轉移預算所有權 |
| budget.share.manage | 管理預算共享 |
| category.manage | 管理分類 |
| transaction.read | 查看交易 |
| transaction.write | 新增、編輯、刪除交易 |
| currency.manage | 管理啟用貨幣 |
| exchange_rate.manage | 管理匯率 |
| template.manage | 管理模板 |
| export.create | 匯出 PDF |
| audit.read | 查看操作記錄 |

## 5. Passkey / WebAuthn 登入

Passkey 使用 WebAuthn / FIDO2。macOS 上主要對應 Safari、Chrome、Edge 使用 iCloud Keychain 或平台驗證器。

第一版支援：

- Email + password 登入。
- Passkey 註冊。
- Passkey 登入。
- 一個 user 可綁定多個 passkey。
- 可刪除 passkey。
- Passkey 可作為主要登入方式，也可作為密碼登入後的安全增強。

必要條件：

- 正式環境必須使用 HTTPS。
- 本機開發可使用 `localhost`。
- WebAuthn RP ID 必須固定，例如 `budget.example.com`。
- Origin 必須嚴格校驗，例如 `https://budget.example.com`。
- Challenge 必須一次性、短有效期、使用後立即失效。

前端流程：

1. `GET /api/auth/passkey/register/options`
2. 呼叫 `navigator.credentials.create()`
3. `POST /api/auth/passkey/register/verify`
4. 登入時呼叫 `GET /api/auth/passkey/login/options`
5. 呼叫 `navigator.credentials.get()`
6. `POST /api/auth/passkey/login/verify`

後端需要校驗：

- challenge
- origin
- rpId
- credentialId
- public key signature
- user verification
- sign count

建議 Composer 套件：

- `web-auth/webauthn-lib`

Passkey 不存任何私鑰。後端只保存 credential id、公鑰、sign count、transport、backup 狀態等資訊。

## 6. 模板樣式

已解析目前 DOCX 模板，需在網頁與匯出中盡量還原。

字體：

```css
@import url('https://fonts.api.axchen.top/TimesNewRoman/index.css');
@import url('https://fonts.api.axchen.top/SF-Mono/index.css');
@import url('https://fonts.api.axchen.top/TCSongti/index.css');

:root {
  --font-title: 'TimesNewRoman', serif;
  --font-mono: 'SF-Mono', monospace;
  --font-cjk: 'TCSongti', serif;
}
```

DOCX 模板特徵：

- 標題：Times New Roman，14pt，置中，`15th` 的 `th` 為上標。
- 副標題：Times New Roman，14pt，置中。
- 表格：Word Table Grid，100% 寬度，單線邊框，約 0.5pt。
- 表格欄寬：約 40% / 20% / 20% / 20%。
- 表格區塊標題列：合併 4 欄，背景 `#A4A4A4`，10.5pt。
- 日期列：合併 4 欄，SF Mono Light，7.5pt。
- 表頭列：背景 `#D7D7D7`，7.5pt。
- 資料列：SF Mono Regular，7.5pt。
- 第一欄左對齊，其餘金額與數字欄右對齊。
- Total 列背景 `#D7D7D7`。

前端 CSS 建議：

```css
.budget-document-title {
  font-family: var(--font-title);
  font-size: 14pt;
  font-weight: 400;
  text-align: center;
}

.budget-table {
  font-family: var(--font-mono);
  font-size: 7.5pt;
  border-collapse: collapse;
  width: 100%;
}

.budget-table th,
.budget-table td {
  border: 0.5pt solid #000;
}
```

## 7. 多貨幣方案

核心原則：

- 每個預算週期有一個基準貨幣，例如 CNY。
- 每筆交易保留原始貨幣與原始金額。
- 每筆交易同時保存當時確認過的匯率與換算後的基準貨幣金額。
- 匯率需要凍結，不應因日後匯率變化而改變歷史預算。
- 匯率可以手動輸入，也可以後續接外部匯率服務，但第一版不依賴外部服務。

例子：

```text
Budget base currency: CNY
Transaction: HKD 100.00
Exchange rate HKD -> CNY: 0.923500
Base amount: CNY 92.35
```

前端顯示：

- 原始金額：`HKD100.00`
- 換算金額：`≈ CNY92.35`
- 預算摘要與 total 預設使用基準貨幣。
- 使用者可切換顯示貨幣，但統計仍以基準貨幣為準。

即時匯率規劃：

- 第一版不接外部即時匯率服務，避免增加第三方依賴。
- 第一版支援手動輸入匯率、保存歷史匯率、交易時凍結匯率。
- 後期新增即時匯率獲取。
- 即時匯率只作為建議值，使用者確認後才寫入交易。
- 寫入交易後的匯率不可被自動刷新覆蓋。
- 外部匯率來源需要記錄 `source`、`fetched_at`、`rate_date`。

## 8. 資料庫設計

所有表使用：

- Engine：InnoDB
- Charset：utf8mb4
- Collation：utf8mb4_unicode_ci
- 金額：`DECIMAL(18, 4)`
- 匯率：`DECIMAL(20, 10)`
- 時間：`DATETIME`

### users

用戶表。

欄位：

- `id`
- `email`
- `password_hash`
- `display_name`
- `default_currency_id`
- `timezone`
- `locale`
- `status`
- `created_at`
- `updated_at`

約束：

- `email` unique
- `default_currency_id` foreign key to `currencies.id`

### user_sessions

登入 session。

欄位：

- `id`
- `user_id`
- `session_token_hash`
- `ip_address`
- `user_agent`
- `expires_at`
- `created_at`

### webauthn_credentials

Passkey credential 表。

欄位：

- `id`
- `user_id`
- `credential_id`
- `public_key`
- `sign_count`
- `transports_json`
- `attestation_type`
- `trust_path_json`
- `backup_eligible`
- `backup_state`
- `device_name`
- `last_used_at`
- `created_at`
- `updated_at`

約束：

- `credential_id` unique
- `user_id` foreign key to `users.id`

### webauthn_challenges

Passkey challenge 暫存表。

欄位：

- `id`
- `user_id`
- `challenge`
- `type`
- `expires_at`
- `used_at`
- `created_at`

type：

- `registration`
- `authentication`

### workspaces

工作區表。

欄位：

- `id`
- `owner_user_id`
- `name`
- `type`
- `default_currency_id`
- `timezone`
- `settings_json`
- `created_at`
- `updated_at`

類型：

- `personal`
- `family`
- `team`
- `custom`

### workspace_members

工作區成員表。

欄位：

- `id`
- `workspace_id`
- `user_id`
- `role_id`
- `status`
- `joined_at`
- `created_at`
- `updated_at`

狀態：

- `active`
- `invited`
- `disabled`
- `left`

約束：

- unique `workspace_id + user_id`

### workspace_invitations

工作區邀請表。

欄位：

- `id`
- `workspace_id`
- `email`
- `invited_by_user_id`
- `role_id`
- `token_hash`
- `expires_at`
- `accepted_at`
- `created_at`

### workgroups

工作組表。

欄位：

- `id`
- `workspace_id`
- `name`
- `description`
- `created_by_user_id`
- `created_at`
- `updated_at`

### workgroup_members

工作組成員表。

欄位：

- `id`
- `workgroup_id`
- `user_id`
- `added_by_user_id`
- `created_at`

約束：

- unique `workgroup_id + user_id`

### roles

角色表。

欄位：

- `id`
- `key`
- `name`
- `scope`
- `is_system`
- `created_at`

scope：

- `workspace`
- `budget`
- `system`

### permissions

權限表。

欄位：

- `id`
- `key`
- `description`
- `created_at`

### role_permissions

角色與權限對應表。

欄位：

- `role_id`
- `permission_id`

### budget_shares

預算共享表。

欄位：

- `id`
- `budget_id`
- `principal_type`
- `principal_id`
- `role_id`
- `can_export`
- `can_reshare`
- `expires_at`
- `created_by_user_id`
- `created_at`
- `updated_at`

principal_type：

- `user`
- `workgroup`
- `workspace`

說明：

- `workspace` 表示共享給工作區所有人。
- `workgroup` 表示共享給指定工作組。
- `user` 表示共享給指定用戶。

### share_links

可撤銷分享連結。

欄位：

- `id`
- `budget_id`
- `token_hash`
- `role_id`
- `can_export`
- `expires_at`
- `revoked_at`
- `created_by_user_id`
- `created_at`

限制：

- 第一版只允許 read-only。
- 預設不開啟。
- token 只存 hash。

### currencies

貨幣表。

欄位：

- `id`
- `code`，例如 CNY、HKD、USD
- `name`
- `symbol`
- `decimal_places`
- `is_enabled`

約束：

- `code` unique

### exchange_rates

匯率表。

欄位：

- `id`
- `user_id`
- `from_currency_id`
- `to_currency_id`
- `rate`
- `rate_date`
- `source`
- `note`
- `created_at`

約束：

- `from_currency_id` foreign key to `currencies.id`
- `to_currency_id` foreign key to `currencies.id`
- `user_id` foreign key to `users.id`

### accounts

帳戶表，例如 Mainland Bank、Hong Kong Bank、Deposit Account。

欄位：

- `id`
- `user_id`
- `name`
- `currency_id`
- `type`
- `is_active`
- `sort_order`
- `created_at`
- `updated_at`

### budget_templates

預算模板表。

欄位：

- `id`
- `workspace_id`
- `user_id`
- `name`
- `template_key`
- `style_json`
- `structure_json`
- `is_default`
- `created_at`
- `updated_at`

用途：

- 保存目前 DOCX 解析出的表格結構。
- 保存字體、背景色、欄寬、對齊配置。

### budgets

預算週期主表。

欄位：

- `id`
- `workspace_id`
- `user_id`
- `owner_user_id`
- `created_by_user_id`
- `template_id`
- `title`
- `owner_name`
- `start_date`
- `end_date`
- `base_currency_id`
- `display_currency_id`
- `visibility`
- `status`
- `note`
- `created_at`
- `updated_at`

狀態建議：

- `draft`
- `active`
- `closed`
- `archived`

visibility 建議：

- `private`
- `workspace`
- `custom`

### budget_categories

預算分類。

欄位：

- `id`
- `workspace_id`
- `user_id`
- `name`
- `parent_id`
- `default_currency_id`
- `sort_order`
- `is_active`
- `created_at`
- `updated_at`

### budget_category_aliases

分類別名。

用途：

目前模板已發現：

- Budget Highlights：`Bill of Key (Keychain & RC)`
- Transaction Breakdown：`Bill of Key`

這兩者實際應可映射到同一分類。

欄位：

- `id`
- `workspace_id`
- `user_id`
- `category_id`
- `alias`
- `created_at`

### budget_items

Budget Highlights 的每一行。

欄位：

- `id`
- `budget_id`
- `category_id`
- `label`
- `budget_currency_id`
- `budget_amount_original`
- `budget_rate_to_base`
- `budget_amount_base`
- `estimated_currency_id`
- `estimated_amount_original`
- `estimated_rate_to_base`
- `estimated_amount_base`
- `variance_amount_base`
- `sort_order`
- `created_at`
- `updated_at`

說明：

- `variance_amount_base = budget_amount_base - estimated_amount_base`
- 可由後端計算後寫入，也可用 MySQL generated column。

### budget_transactions

Transaction Breakdown 的每一行。

欄位：

- `id`
- `budget_id`
- `category_id`
- `account_id`
- `transaction_date`
- `details`
- `currency_id`
- `amount_original`
- `rate_to_base`
- `amount_base`
- `remark`
- `sort_order`
- `created_at`
- `updated_at`

說明：

- `amount_original` 是原始交易貨幣金額。
- `rate_to_base` 是當時確認的匯率。
- `amount_base` 是換算成 budget base currency 的金額。

### budget_exports

匯出記錄。

欄位：

- `id`
- `budget_id`
- `user_id`
- `format`
- `file_name`
- `file_path`
- `status`
- `error_message`
- `created_at`

格式：

- `pdf`

### import_jobs

模板或資料匯入記錄。

欄位：

- `id`
- `user_id`
- `source_type`
- `source_file`
- `status`
- `result_json`
- `error_message`
- `created_at`

### audit_logs

重要操作記錄。

欄位：

- `id`
- `workspace_id`
- `user_id`
- `entity_type`
- `entity_id`
- `action`
- `before_json`
- `after_json`
- `created_at`

## 9. 權限判斷流程

後端每次讀寫 budget 時都要計算 effective permission。

判斷順序：

1. 是否為系統 admin。
2. 是否為 workspace owner。
3. 是否為 budget owner。
4. 是否有 workspace role permission。
5. 是否有 budget direct share。
6. 是否屬於被共享的 workgroup。
7. 是否為 workspace-wide share。
8. 是否持有有效 share link。

資料查詢原則：

- 不允許只靠前端隱藏按鈕。
- Repository 層查詢必須帶 `workspace_id` 範圍。
- Mutation API 必須檢查具體 permission，例如 `transaction.write`。
- 匯出 API 必須檢查 `export.create` 或 share 的 `can_export`。
- 所有共享與權限變更都寫入 `audit_logs`。

## 10. View 設計

### v_budget_item_totals

按 budget 匯總：

- total_budget_base
- total_estimated_base
- total_variance_base

### v_transaction_totals_by_category

按 budget + category 匯總交易：

- transaction_total_base
- transaction_count

### v_budget_reconciliation

對比：

- budget_items.estimated_amount_base
- transactions sum amount_base
- difference

用途：

- 檢查 `Budget Highlights` 和 `Transaction Breakdown` 是否一致。
- 目前模板中 `Digital Subscription` 有 CNY15.00 差額，這類問題可以自動提示。

## 11. 後端方案

PHP 後端使用：

- PDO 操作 MySQL
- Composer 管理依賴
- 原生輕量 router 或 FastRoute
- `.env` 管理 DB 連線
- HttpOnly Cookie session
- CSRF token
- 所有 SQL 使用 prepared statement

建議 Composer 套件：

- `vlucas/phpdotenv`
- `nikic/fast-route`
- `web-auth/webauthn-lib`
- `mpdf/mpdf`

API 回應格式：

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

錯誤格式：

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid amount"
  }
}
```

## 12. API 草案

Auth：

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/passkey/register/options`
- `POST /api/auth/passkey/register/verify`
- `GET /api/auth/passkey/login/options`
- `POST /api/auth/passkey/login/verify`
- `GET /api/auth/passkeys`
- `DELETE /api/auth/passkeys/{id}`

Users：

- `GET /api/user/profile`
- `PUT /api/user/profile`
- `PUT /api/user/password`

Currencies：

- `GET /api/currencies`
- `POST /api/exchange-rates`
- `GET /api/exchange-rates?from=HKD&to=CNY`

Budgets：

- `GET /api/budgets`
- `POST /api/budgets`
- `GET /api/budgets/{id}`
- `PUT /api/budgets/{id}`
- `DELETE /api/budgets/{id}`

Budget Items：

- `GET /api/budgets/{id}/items`
- `PUT /api/budgets/{id}/items`
- `POST /api/budgets/{id}/items/recalculate`

Transactions：

- `GET /api/budgets/{id}/transactions`
- `POST /api/budgets/{id}/transactions`
- `PUT /api/transactions/{id}`
- `DELETE /api/transactions/{id}`

Categories：

- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/{id}`
- `DELETE /api/categories/{id}`
- `POST /api/category-aliases`

Templates：

- `GET /api/templates`
- `GET /api/templates/{id}`
- `POST /api/templates`
- `PUT /api/templates/{id}`

Exports：

- `POST /api/exports`
- `GET /api/exports`
- `GET /api/exports/download`

Reconciliation：

- `GET /api/budgets/{id}/reconciliation`

## 13. 匯出方案

使用 mPDF。

策略：

- 後端生成一份 print HTML。
- mPDF 讀取 HTML + CSS。
- 使用本機字體檔註冊 TimesNewRoman、SF-Mono、TCSongti。
- PDF 內嵌字體，保證視覺一致。

注意：

- 前端 `@import` webfont 對瀏覽器有效。
- PDF 生成不應只依賴遠端 `@import`，應提供本機字體檔或部署時可讀取的字體文件。

## 14. 權限與安全

第一版建議：

- 每個 user 只能存取自己的 budgets、categories、accounts、templates。
- 密碼使用 `password_hash()`，建議 `PASSWORD_DEFAULT`。
- Session token 只存 hash。
- Cookie 使用 `HttpOnly`、`Secure`、`SameSite=Lax`。
- 所有 mutation API 檢查 CSRF token。
- 所有金額、日期、貨幣 code 由後端驗證。
- 匯出檔案不可直接暴露真實 server path。
- Passkey challenge 必須短有效期、一次性使用。
- WebAuthn origin 與 RP ID 必須由後端嚴格校驗。
- Passkey credential 的 private key 永遠不會離開用戶設備或 iCloud Keychain。

## 15. 資料一致性檢查

系統需要內建 reconciliation。

檢查項：

- Budget total 是否等於所有 Budget Items 加總。
- Estimated Actuals 是否等於所有 items 加總。
- Variance 是否等於 Budget - Estimated Actuals。
- Transaction Breakdown 按分類加總是否等於 Budget Highlights 的 Estimated Actuals。
- 分類別名是否造成假差異。
- 多貨幣交易是否缺少匯率。
- 匯率是否被修改過。

目前模板已解析到：

- Budget Highlights Estimated Actuals：CNY2181.48
- Transaction Breakdown total：CNY2166.48
- 差額：CNY15.00
- `Bill of Key` 是分類名稱不一致但金額可對上。
- `Digital Subscription` 摘要為 CNY70.00，交易明細目前為 CNY55.00，差 CNY15.00。

## 16. SQL 文件安排

### 001_schema.sql

包含：

- users
- user_sessions
- webauthn_credentials
- webauthn_challenges
- workspaces
- workspace_members
- workspace_invitations
- workgroups
- workgroup_members
- roles
- permissions
- role_permissions
- budget_shares
- share_links
- currencies
- exchange_rates
- accounts
- budget_templates
- budgets
- budget_categories
- budget_category_aliases
- budget_items
- budget_transactions
- budget_exports
- import_jobs
- audit_logs

### 002_seed_currencies.sql

預設貨幣：

- CNY
- HKD
- USD
- EUR
- GBP
- JPY
- TWD
- MOP

### 003_seed_template.sql

寫入目前 DOCX 解析出的模板：

- Personal Living Budget
- Budget Highlights section
- Transaction Breakdown section
- 字體設定
- 欄寬設定
- 表格顏色設定

### 004_views.sql

包含：

- v_budget_item_totals
- v_transaction_totals_by_category
- v_budget_reconciliation

## 17. 分階段開發流程

### Phase 0：方案與資料模型確認

- 確認工作區、工作組、共享、角色、權限模型。
- 確認多貨幣策略：第一版手動匯率，後期即時匯率。
- 確認 Passkey 的 RP ID、正式 domain、HTTPS 部署方式。
- 確認 PDF 匯出字體來源。

### Phase 1：基礎骨架

- 建立前端 Vite + React + TypeScript + AntD。
- 建立 PHP API skeleton。
- 建立 MySQL schema SQL。
- 建立 `.env`、PDO、router、API response format。

### Phase 2：身份、安全與權限

- Email/password 登入。
- HttpOnly session。
- Passkey 註冊與登入。
- 工作區建立。
- 成員、角色、權限。
- Audit logs。

### Phase 3：預算核心功能

- 完成 Budget CRUD。
- 完成 Categories。
- 完成 Accounts。
- 完成 Budget Editor 的兩張表。
- 完成共享 modal。
- 完成 workspace / workgroup scope 查詢。

### Phase 4：多貨幣第一版

- Currencies。
- 手動 Exchange Rates。
- 交易原始貨幣與基準貨幣換算。
- 匯率凍結。
- 多貨幣顯示。

### Phase 5：校驗與匯出

- 完成 reconciliation。
- 完成 PDF 匯出。

### Phase 6：模板與體驗優化

- 導入目前解析出的 DOCX 模板 JSON。
- 用模板樣式渲染網頁預覽。
- 做響應式優化。
- 補測試與錯誤處理。

### Phase 7：後期增強

- 即時匯率獲取。
- 匯率 provider 管理。
- 多人共享通知。
- 匯出任務佇列。
- 附件。
- 進階報表。

## 18. 部署方案

開發環境：

- 前端：Vite dev server。
- 後端：PHP built-in server 或 nginx + php-fpm。
- API proxy：Vite proxy `/api` 到 PHP。

正式環境：

- nginx serve `frontend/dist`。
- `/api` 轉發到 php-fpm。
- MySQL 獨立服務。
- 匯出文件存放在 server private storage，不直接暴露。

## 19. 實作優先級

最高優先：

1. MySQL schema
2. PHP API skeleton
3. Auth/session/passkey
4. Workspace/workgroup/permissions
5. Budget Editor
6. 多貨幣與匯率凍結
7. Reconciliation
8. PDF 匯出

第二優先：

1. Template 管理
2. 匯出歷史
3. Audit logs

第三優先：

1. 即時匯率外部 API
2. 附件
3. 多人共享 budget
4. 進階報表
