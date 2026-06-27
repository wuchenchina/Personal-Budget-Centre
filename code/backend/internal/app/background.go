package app

import (
	"context"
	"strings"
	"time"
)

const bankReferenceAutoRefreshInterval = 4 * time.Hour

func (a *App) StartBackgroundJobs(ctx context.Context) {
	go a.runBankReferenceAutoRefresh(ctx)
}

func (a *App) runBankReferenceAutoRefresh(ctx context.Context) {
	a.runBankReferenceRefreshCheck(ctx)
	ticker := time.NewTicker(bankReferenceAutoRefreshInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.runBankReferenceRefreshCheck(ctx)
		}
	}
}

func (a *App) runBankReferenceRefreshCheck(ctx context.Context) {
	if strings.TrimSpace(a.cfg.BankReferenceRatesURL) == "" {
		return
	}
	if err := a.refreshBankReferenceIfStale(ctx, bankReferenceAutoRefreshInterval); err != nil {
		a.logger.Warn("bank_reference auto refresh skipped", "error", err)
	}
}
