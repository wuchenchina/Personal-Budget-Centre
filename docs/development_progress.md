[x] 建立開發進度清單
[x] 解析 DOCX 預算模板
[x] 識別模板標題、副標題、兩張表格
[x] 識別模板字體、字號、表格背景色、欄寬、對齊方式
[x] 建立 DOCX 解析腳本 `scripts/parse_budget_docx.py`
[x] 產出模板解析 JSON
[x] 產出模板解析 Markdown
[x] 建立完整方案文件 `docs/budget_website_plan.md`
[x] 建立 `code/` 目錄
[x] 建立 `code/frontend`
[x] 建立 Vite + React + TypeScript 前端
[x] 使用 TypeScript，不使用 JavaScript
[x] 安裝 Ant Design
[x] 安裝 `@ant-design/pro-components`
[x] 安裝 dayjs
[x] 安裝 lucide-react
[x] 加入 TimesNewRoman webfont
[x] 加入 SF-Mono webfont
[x] 加入 TCSongti webfont
[x] 建立 Ant Design 工作台骨架
[x] 登入 UI 改用 Ant Design Pro `LoginForm`
[x] 註冊 UI 改用 Ant Design Pro `LoginForm`
[x] 登入/註冊風格參考 `template/frontend`
[x] 維持 Vite 構建，不搬 Umi Max / Ant Design Pro 構建鏈
[x] 建立前端 HTTP client
[x] 建立 Auth API client
[x] 建立 Template API client
[x] 建立 Budget API client 初版
[x] 前端模板改為從後端 API 讀取
[x] 移除前端實際預算 mock data
[x] 刪除 `mockBudget.ts`
[x] 刪除前端硬編碼模板資料
[x] 建立 `code/backend`
[x] 建立 PHP API skeleton
[x] 建立 JSON response helper
[x] 建立 Request parser
[x] 建立 Invalid JSON exception
[x] 建立 `.env` 讀取工具
[x] 建立 PDO MySQL connection factory
[x] 建立 `BudgetTemplateRepository`
[x] 建立 `UserRepository`
[x] 建立 `SessionRepository`
[x] 建立 `CurrencyRepository`
[x] 建立 `WorkspaceRepository`
[x] 建立 `WorkspaceMemberRepository`
[x] 建立 `WorkgroupRepository`
[x] 建立 `BudgetRepository`
[x] 建立 `SessionManager`
[x] 建立 `AuthService`
[x] 建立 `code/database`
[x] 建立 `001_schema.sql`
[x] 建立 `002_seed_currencies.sql`
[x] 建立 `003_seed_template.sql`
[x] 建立 `004_views.sql`
[x] SQL 包含 users
[x] SQL 包含 sessions
[x] SQL 包含 webauthn_credentials
[x] SQL 包含 webauthn_challenges
[x] SQL 包含 workspaces
[x] SQL 包含 workspace_members
[x] SQL 包含 workspace_invitations
[x] SQL 包含 workgroups
[x] SQL 包含 workgroup_members
[x] SQL 包含 roles
[x] SQL 包含 permissions
[x] SQL 包含 role_permissions
[x] SQL 包含 budget_shares
[x] SQL 包含 share_links
[x] SQL 包含 budget_templates
[x] SQL 包含 budgets
[x] SQL 包含 budget_items
[x] SQL 包含 budget_transactions
[x] SQL 包含 budget_categories
[x] SQL 包含 budget_category_aliases
[x] SQL 包含 currencies
[x] SQL 包含 exchange_rates
[x] SQL 包含 exports
[x] SQL 包含 import_jobs
[x] SQL 包含 audit_logs
[x] SQL seed 包含 CNY
[x] SQL seed 包含 HKD
[x] SQL seed 包含 USD
[x] SQL seed 包含 EUR
[x] SQL seed 包含 GBP
[x] SQL seed 包含 JPY
[x] SQL seed 包含 TWD
[x] SQL seed 包含 MOP
[x] SQL seed 包含全局模板 `personal_living_budget`
[x] 建立 `v_budget_item_totals`
[x] 建立 `v_transaction_totals_by_category`
[x] 建立 `v_budget_reconciliation`
[x] Composer 依賴預留 PHPWord
[x] Composer 依賴預留 mPDF
[x] 建立 `code/README.md`
[x] Email/password register API
[x] Email/password login API
[x] Logout API
[x] `/api/auth/me`
[x] HttpOnly session cookie
[x] Session token hash storage
[x] Register 後自動建立 personal workspace
[x] 建立登出流程
[x] 前端接入 `/api/auth/me`
[x] Passkey 需求已納入資料表
[x] Passkey API route 已占位
[x] CSRF token
[x] 後端 CSRF guard
[x] 前端 mutation request 自動送 CSRF header
[x] Passkey registration options
[x] Passkey registration verify
[x] Passkey login options
[x] Passkey login verify
[x] Passkey credential management
[x] Workspace list API
[x] Workspace create API
[x] Workspace switcher API
[x] Session 保存目前 Workspace
[x] 前端顯示 Workspace list
[x] 前端建立 Workspace Modal
[x] 前端 Workspace switcher
[x] Workspace member API
[x] 前端顯示 Workspace member list
[x] 前端新增 Workspace member
[x] 前端更新 Workspace member role
[x] 前端移除 Workspace member
[x] Workspace member 移除時清理 Workgroup membership
[x] Workgroup CRUD API
[x] 前端顯示 Workgroup list
[x] 前端建立 Workgroup Modal
[x] 前端編輯 Workgroup
[x] 前端刪除 Workgroup
[x] Permission check middleware
[x] 後端共用 PermissionGuard
[x] Workspace service 接入 PermissionGuard
[x] Workgroup service 接入 PermissionGuard
[x] Budget service 接入 PermissionGuard
[x] Budget entry service 接入 PermissionGuard
[ ] Budget share API
[x] Budget list API 初版
[x] Budget detail API 初版
[x] Budget create API 初版
[x] 前端 Budget list/detail state 初版
[x] 前端工作台預覽改讀後端 Budget 初版
[x] 前端建立 Budget Modal
[x] Budget update API
[x] Budget delete API
[x] 前端 Budget 編輯 Modal
[x] 前端 Budget 刪除操作
[x] Budget editor 前端完整接 API
[x] 建立 `BudgetEntryRepository`
[x] 建立 `BudgetEntryService`
[x] Budget item create API
[x] Budget item update API
[x] Budget item delete API
[x] Budget transaction create API
[x] Budget transaction update API
[x] Budget transaction delete API
[x] 前端 Budget entry API client
[x] 前端 Budget entry hook
[x] 前端 Budget item Modal
[x] 前端 Transaction Modal
[x] 前端 Budget 預覽表格新增 actions
[x] 前端 Budget 預覽表格編輯 actions
[x] 前端 Budget 預覽表格刪除 actions
[x] Budget Highlights 讀寫
[x] Transaction Breakdown 讀寫
[x] Category alias mapping
[x] Currency API
[ ] Manual exchange rate API
[ ] Transaction currency conversion
[ ] Live exchange rate provider
[ ] HSBC/BOCHK exchange rate provider
[x] Reconciliation API
[x] 前端顯示分類差異
[x] 前端顯示交易總額差異
[x] Markdown export
[x] DOCX export
[x] PDF export
[x] Export history API
[x] Export file storage
[x] 拆分 `App.tsx` 至 500 行以下
[x] 拆分 `App.css` 至 500 行以下
[x] 拆分 `AuthService.php` 至 500 行以下
[x] 新增功能檔案保持 500 行以下
[x] 建立前端 Auth 元件拆分
[x] 建立前端 AppShell 元件拆分
[x] 建立前端 Budget 預覽元件拆分
[x] 建立前端 Governance Panel 元件拆分
[x] 建立前端 Workspace Modal 元件拆分
[x] 建立前端 Workgroup Modal 元件拆分
[x] 建立前端 Budget hook
[x] 建立前端 Workspace hook
[x] 建立前端 Workgroup hook
[x] 建立後端 `SessionAuthenticator`
[x] 建立後端 `Input` helper
[x] 建立後端 `WorkspaceService`
[x] 建立後端 `WorkgroupService`
[x] 建立後端 `BudgetService`
[x] 後端路由改為按 service 分發
[x] Workspace member 完成後 `yarn build` 驗證通過
[x] Workspace member 完成後 `composer validate --strict` 驗證通過
[x] Workspace member 完成後 PHP syntax check 驗證通過
[x] Budget API 接入後重新執行 `yarn build`
[x] Budget API 接入後重新執行 `composer validate --strict`
[x] Budget API 接入後重新執行 PHP syntax check
[x] Budget entry CRUD 接入後重新執行 `yarn build`
[x] Budget entry CRUD 接入後重新執行 `composer validate --strict`
[x] Budget entry CRUD 接入後重新執行 PHP syntax check
[x] Budget entry CRUD 接入後確認單檔低於 500 行
[x] 安全基礎接入後重新執行 `yarn build`
[x] 安全基礎接入後重新執行 `composer validate --strict`
[x] 安全基礎接入後重新執行 PHP syntax check
[x] 安全基礎接入後確認單檔低於 500 行
[ ] 正式資料庫環境 API 測試
[ ] Browser preview
[ ] 確認 Ant Design 版本是否維持 `antd@6.4.3`
[ ] 處理 Vite build chunk size warning
[ ] 本地 dev server 尚未啟動
