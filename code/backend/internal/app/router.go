package app

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"budgetcentre/backend/internal/config"
	"budgetcentre/backend/internal/httpx"
)

type App struct {
	db     *sql.DB
	cfg    config.Config
	logger *slog.Logger
}

type handlerFunc func(http.ResponseWriter, *http.Request) error

func New(db *sql.DB, cfg config.Config, logger *slog.Logger) *App {
	return &App{db: db, cfg: cfg, logger: logger}
}

func (a *App) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", a.handle)
	return mux
}

func (a *App) handle(w http.ResponseWriter, r *http.Request) {
	a.applyCORS(w)
	if r.Method == http.MethodOptions {
		httpx.WriteOK(w, map[string]any{}, http.StatusOK)
		return
	}
	if err := a.validateCSRF(r); err != nil {
		a.writeError(w, err)
		return
	}

	handler := a.route(r.Method, r.URL.Path)
	if handler == nil {
		a.writeError(w, apiError("NOT_FOUND", "API route not found.", http.StatusNotFound))
		return
	}
	if err := handler(w, r); err != nil {
		a.writeError(w, err)
	}
}

func (a *App) route(method, path string) handlerFunc {
	switch {
	case method == http.MethodGet && path == "/api/health":
		return a.health
	case method == http.MethodPost && path == "/api/auth/register":
		return a.authRegister
	case method == http.MethodPost && path == "/api/auth/login":
		return a.authLogin
	case method == http.MethodPost && path == "/api/auth/logout":
		return a.authLogout
	case method == http.MethodGet && path == "/api/auth/me":
		return a.authMe
	case method == http.MethodPatch && path == "/api/auth/profile":
		return a.authProfile
	case method == http.MethodPatch && path == "/api/auth/password":
		return a.authPassword
	case method == http.MethodGet && path == "/api/auth/email/verify":
		return ok(map[string]any{"verified": true})
	case method == http.MethodPost && path == "/api/auth/email/resend":
		return ok(map[string]any{"sent": true, "email": ""})
	case method == http.MethodGet && path == "/api/auth/sso-binding":
		return a.ssoBinding
	case method == http.MethodDelete && path == "/api/auth/sso-binding":
		return a.ssoUnlink
	case method == http.MethodPost && path == "/api/auth/sso-merge":
		return a.ssoMerge
	case method == http.MethodGet && path == "/api/auth/casdoor/authorize":
		return a.casdoorAuthorize
	case method == http.MethodGet && path == "/api/callback":
		return a.casdoorBrowserCallback
	case method == http.MethodPost && path == "/api/Callback":
		return a.casdoorCallback
	case method == http.MethodGet && path == "/api/auth/passkey/register/options":
		return a.passkeyRegisterOptions
	case method == http.MethodPost && path == "/api/auth/passkey/register/verify":
		return a.passkeyRegisterVerify
	case method == http.MethodGet && path == "/api/auth/passkey/login/options":
		return a.passkeyLoginOptions
	case method == http.MethodPost && path == "/api/auth/passkey/login/verify":
		return a.passkeyLoginVerify
	case method == http.MethodGet && path == "/api/auth/passkey/credentials":
		return a.passkeyCredentialList
	case method == http.MethodPatch && path == "/api/auth/passkey/credentials":
		return a.passkeyCredentialUpdate
	case method == http.MethodDelete && path == "/api/auth/passkey/credentials":
		return a.passkeyCredentialDelete
	case method == http.MethodGet && path == "/api/workspaces":
		return a.workspaceList
	case method == http.MethodPost && path == "/api/workspaces":
		return a.workspaceCreate
	case method == http.MethodPatch && path == "/api/workspaces":
		return a.workspaceUpdate
	case method == http.MethodDelete && path == "/api/workspaces":
		return a.workspaceDelete
	case method == http.MethodPost && path == "/api/workspaces/switch":
		return a.workspaceSwitch
	case method == http.MethodGet && path == "/api/workspace-members":
		return a.workspaceMemberList
	case method == http.MethodPost && path == "/api/workspace-members":
		return a.workspaceMemberCreate
	case method == http.MethodPatch && path == "/api/workspace-members":
		return a.workspaceMemberUpdate
	case method == http.MethodDelete && path == "/api/workspace-members":
		return a.workspaceMemberDelete
	case method == http.MethodGet && path == "/api/workgroups":
		return a.workgroupList
	case method == http.MethodPost && path == "/api/workgroups":
		return a.workgroupCreate
	case method == http.MethodPatch && path == "/api/workgroups":
		return a.workgroupUpdate
	case method == http.MethodDelete && path == "/api/workgroups":
		return a.workgroupDelete
	case method == http.MethodGet && path == "/api/budgets":
		return a.budgetList
	case method == http.MethodPost && path == "/api/budgets":
		return a.budgetCreate
	case method == http.MethodPatch && path == "/api/budgets":
		return a.budgetUpdate
	case method == http.MethodDelete && path == "/api/budgets":
		return a.budgetDelete
	case method == http.MethodGet && path == "/api/budget":
		return a.budgetDetail
	case method == http.MethodPost && path == "/api/budget-items":
		return a.itemCreate
	case method == http.MethodPatch && path == "/api/budget-items":
		return a.itemUpdate
	case method == http.MethodDelete && path == "/api/budget-items":
		return a.itemDelete
	case method == http.MethodPost && path == "/api/budget-transactions":
		return a.transactionCreate
	case method == http.MethodPatch && path == "/api/budget-transactions":
		return a.transactionUpdate
	case method == http.MethodDelete && path == "/api/budget-transactions":
		return a.transactionDelete
	case method == http.MethodPatch && path == "/api/budget-installment-plan":
		return a.installmentPlanUpdate
	case method == http.MethodGet && path == "/api/currencies":
		return a.currencyList
	case method == http.MethodGet && path == "/api/exchange-rates":
		return a.exchangeRateList
	case method == http.MethodPost && path == "/api/exchange-rates":
		return a.exchangeRateCreate
	case method == http.MethodPost && path == "/api/exchange-rates/convert":
		return a.exchangeRateConvert
	case method == http.MethodPost && path == "/api/exchange-rates/bochk/refresh":
		return a.bochkRefresh
	case method == http.MethodGet && path == "/api/budget-categories":
		return a.categoryList
	case method == http.MethodPost && path == "/api/budget-categories":
		return a.categoryCreate
	case method == http.MethodPatch && path == "/api/budget-categories":
		return a.categoryUpdate
	case method == http.MethodDelete && path == "/api/budget-categories":
		return a.categoryDelete
	case method == http.MethodPost && path == "/api/budget-category-aliases":
		return a.categoryAliasCreate
	case method == http.MethodDelete && path == "/api/budget-category-aliases":
		return a.categoryAliasDelete
	case method == http.MethodGet && path == "/api/budget-shares":
		return a.shareList
	case method == http.MethodPost && path == "/api/budget-shares":
		return a.shareCreate
	case method == http.MethodPatch && path == "/api/budget-shares":
		return a.shareUpdate
	case method == http.MethodDelete && path == "/api/budget-shares":
		return a.shareDelete
	case method == http.MethodGet && path == "/api/bookkeeping-records":
		return a.bookkeepingList
	case method == http.MethodPost && path == "/api/bookkeeping-records":
		return a.bookkeepingCreate
	case method == http.MethodPatch && path == "/api/bookkeeping-records":
		return a.bookkeepingUpdate
	case method == http.MethodDelete && path == "/api/bookkeeping-records":
		return a.bookkeepingDelete
	case method == http.MethodGet && path == "/api/budget-reconciliation":
		return ok(map[string]any{"reconciliation": map[string]any{}})
	case method == http.MethodGet && path == "/api/exports":
		return a.exportList
	case method == http.MethodPost && path == "/api/exports":
		return a.exportCreate
	case method == http.MethodGet && path == "/api/exports/download":
		return a.exportDownload
	case method == http.MethodGet && path == "/api/admin/users":
		return a.adminUserList
	case method == http.MethodPost && path == "/api/admin/users":
		return a.adminUserCreate
	case method == http.MethodPatch && path == "/api/admin/users":
		return a.adminUserUpdate
	case method == http.MethodPost && path == "/api/admin/users/email-verification":
		return ok(map[string]any{"sent": true, "email": "", "alreadyVerified": false})
	case method == http.MethodGet && path == "/api/admin/environment":
		return a.adminEnvironment
	case method == http.MethodGet && path == "/api/admin/database":
		return a.adminDatabaseStatus
	case method == http.MethodPost && path == "/api/admin/database/migrate":
		return a.adminDatabaseMigrate
	case method == http.MethodGet && path == "/api/admin/logs":
		return ok(map[string]any{"logs": map[string]any{"path": "", "entries": []any{}}})
	case method == http.MethodPost && path == "/api/admin/export-cache/cleanup":
		return a.adminExportCleanup
	case method == http.MethodGet && path == "/api/templates/personal-living-budget":
		return a.templateResponse
	default:
		return nil
	}
}

func (a *App) applyCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", strings.TrimRight(a.cfg.AppURL, "/"))
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
}

func (a *App) writeError(w http.ResponseWriter, err error) {
	var apiErr httpx.APIError
	if errors.As(err, &apiErr) {
		httpx.WriteError(w, apiErr.Code, apiErr.Message, apiErr.Status, apiErr.Meta)
		return
	}
	a.logger.Error("api error", "error", err)
	meta := map[string]any{}
	if a.cfg.AppEnv == "local" {
		meta["detail"] = err.Error()
	}
	httpx.WriteError(w, "INTERNAL_SERVER_ERROR", "Unexpected server error.", http.StatusInternalServerError, meta)
}

func (a *App) health(w http.ResponseWriter, _ *http.Request) error {
	httpx.WriteOK(w, map[string]any{"service": "budget-centre-api", "status": "ok"}, http.StatusOK)
	return nil
}

func ok(data map[string]any) handlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) error {
		httpx.WriteOK(w, data, http.StatusOK)
		return nil
	}
}

func apiError(code, message string, status int) error {
	return httpx.APIError{Code: code, Message: message, Status: status, Meta: map[string]any{}}
}
