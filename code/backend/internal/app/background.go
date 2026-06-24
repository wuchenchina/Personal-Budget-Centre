package app

import (
	"context"
	"time"
)

const bochkAutoRefreshInterval = 4 * time.Hour

func (a *App) StartBackgroundJobs(ctx context.Context) {
	go a.runBochkAutoRefresh(ctx)
}

func (a *App) runBochkAutoRefresh(ctx context.Context) {
	a.runBochkRefreshCheck(ctx)
	ticker := time.NewTicker(bochkAutoRefreshInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.runBochkRefreshCheck(ctx)
		}
	}
}

func (a *App) runBochkRefreshCheck(ctx context.Context) {
	if err := a.refreshBochkIfStale(ctx, bochkAutoRefreshInterval); err != nil {
		a.logger.Warn("bochk auto refresh skipped", "error", err)
	}
}
