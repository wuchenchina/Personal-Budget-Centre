package exportpdf

import (
	"bytes"
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"budgetcentre/backend/internal/exportpdf/theme"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
)

type BookkeepingLoader func(context.Context, int64) ([]map[string]any, error)
type TemplateLoader func(context.Context, map[string]any) (Template, error)

type Service struct {
	FontDir            string
	TempDir            string
	ChromeBin          string
	LoadBookkeeping    BookkeepingLoader
	LoadBudgetTemplate TemplateLoader
}

type pdfPrintSpec struct {
	Landscape      bool
	Margins        theme.MarginsMM
	FooterTemplate string
	DisplayFooter  bool
}

type pdfBrowserSession struct {
	timeoutCtx      context.Context
	cancelTimeout   context.CancelFunc
	allocatorCtx    context.Context
	cancelAllocator context.CancelFunc
	browserCtx      context.Context
	cancelBrowser   context.CancelFunc
}

func (s Service) Write(ctx context.Context, budget map[string]any, scope string, options Options, outputPath string) error {
	if err := os.MkdirAll(s.TempDir, 0o775); err != nil {
		return err
	}
	session, err := s.newPDFBrowserSession(ctx)
	if err != nil {
		return err
	}
	defer session.Close()
	workingOptions := options
	if workingOptions.TotalPages <= 0 {
		workingOptions.TotalPages = 1
	}
	firstPDF, err := s.renderPDFPass(ctx, session, budget, scope, workingOptions)
	if err != nil {
		return err
	}
	pageCount := countPDFPages(firstPDF)
	if pageCount <= 0 {
		pageCount = 1
	}
	finalOptions := options
	finalOptions.TotalPages = pageCount
	finalOptions.SuppressPageFooter = pageCount <= 1
	var finalPDF []byte
	for attempt := 0; attempt < 3; attempt++ {
		finalPDF, err = s.renderPDFPass(ctx, session, budget, scope, finalOptions)
		if err != nil {
			return err
		}
		nextCount := countPDFPages(finalPDF)
		if nextCount <= 0 {
			nextCount = finalOptions.TotalPages
		}
		if nextCount == finalOptions.TotalPages {
			break
		}
		finalOptions.TotalPages = nextCount
		finalOptions.SuppressPageFooter = nextCount <= 1
	}
	if err := os.Remove(outputPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return os.WriteFile(outputPath, finalPDF, 0o664)
}

func (s Service) renderPDFPass(ctx context.Context, session *pdfBrowserSession, budget map[string]any, scope string, options Options) ([]byte, error) {
	html, err := s.RenderHTML(ctx, budget, scope, options)
	if err != nil {
		return nil, err
	}
	tmp, err := os.CreateTemp(s.TempDir, "budget-export-*.html")
	if err != nil {
		return nil, err
	}
	htmlPath := tmp.Name()
	defer os.Remove(htmlPath)
	if _, err := tmp.WriteString(html); err != nil {
		_ = tmp.Close()
		return nil, err
	}
	if err := tmp.Close(); err != nil {
		return nil, err
	}
	return s.printHTMLToPDF(session, htmlPath, printSpecForScope(scope, options))
}

func (s Service) RenderHTML(ctx context.Context, budget map[string]any, scope string, options Options) (string, error) {
	renderer := newPDFRenderer(s.FontDir)
	if scope == "bookkeeping" {
		if s.LoadBookkeeping == nil {
			return "", fmt.Errorf("bookkeeping loader is not configured")
		}
		records, err := s.LoadBookkeeping(ctx, int64Value(budget["id"]))
		if err != nil {
			return "", err
		}
		return renderer.renderBookkeeping(budget, records, options), nil
	}

	if s.LoadBudgetTemplate == nil {
		return "", fmt.Errorf("budget template loader is not configured")
	}
	template, err := s.LoadBudgetTemplate(ctx, budget)
	if err != nil {
		return "", err
	}
	return renderer.renderBudget(budget, template, options), nil
}

func (s Service) newPDFBrowserSession(ctx context.Context) (*pdfBrowserSession, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	chrome := s.ChromeBin
	if chrome == "" {
		chrome = "chromium"
	}
	allocatorOptions := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(chrome),
		chromedp.Flag("headless", "new"),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("allow-file-access-from-files", true),
		chromedp.Flag("run-all-compositor-stages-before-draw", true),
		chromedp.Flag("disable-extensions", true),
	)
	allocatorCtx, allocatorCancel := chromedp.NewExecAllocator(timeoutCtx, allocatorOptions...)
	browserCtx, browserCancel := chromedp.NewContext(allocatorCtx)
	if err := chromedp.Run(browserCtx); err != nil {
		browserCancel()
		allocatorCancel()
		cancel()
		if timeoutCtx.Err() != nil {
			return nil, fmt.Errorf("chromium pdf timed out: %w", timeoutCtx.Err())
		}
		return nil, fmt.Errorf("chromium pdf failed: %w", err)
	}
	return &pdfBrowserSession{
		timeoutCtx:      timeoutCtx,
		cancelTimeout:   cancel,
		allocatorCtx:    allocatorCtx,
		cancelAllocator: allocatorCancel,
		browserCtx:      browserCtx,
		cancelBrowser:   browserCancel,
	}, nil
}

func (s *pdfBrowserSession) Close() {
	s.cancelBrowser()
	s.cancelAllocator()
	s.cancelTimeout()
}

func (s Service) printHTMLToPDF(session *pdfBrowserSession, htmlPath string, spec pdfPrintSpec) ([]byte, error) {
	pageURL := url.URL{Scheme: "file", Path: filepath.ToSlash(htmlPath)}

	var data []byte
	err := chromedp.Run(session.browserCtx,
		chromedp.Navigate(pageURL.String()),
		chromedp.WaitReady("body", chromedp.ByQuery),
		chromedp.Evaluate(`document.fonts ? document.fonts.ready.then(() => true) : true`, nil, func(params *runtime.EvaluateParams) *runtime.EvaluateParams {
			return params.WithAwaitPromise(true)
		}),
		chromedp.ActionFunc(func(ctx context.Context) error {
			params := page.PrintToPDF().
				WithPrintBackground(true).
				WithPreferCSSPageSize(false).
				WithLandscape(spec.Landscape).
				WithPaperWidth(8.27).
				WithPaperHeight(11.69).
				WithMarginTop(mmToInches(spec.Margins.Top)).
				WithMarginRight(mmToInches(spec.Margins.Right)).
				WithMarginBottom(mmToInches(spec.Margins.Bottom)).
				WithMarginLeft(mmToInches(spec.Margins.Left))
			if spec.DisplayFooter {
				params = params.
					WithDisplayHeaderFooter(true).
					WithHeaderTemplate(`<span></span>`).
					WithFooterTemplate(spec.FooterTemplate)
			}
			var err error
			data, _, err = params.Do(ctx)
			return err
		}),
	)
	if session.timeoutCtx.Err() != nil {
		return nil, fmt.Errorf("chromium pdf timed out: %w", session.timeoutCtx.Err())
	}
	if err != nil {
		return nil, fmt.Errorf("chromium pdf failed: %w", err)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("chromium pdf produced an empty document")
	}
	return data, nil
}

func printSpecForScope(scope string, options Options) pdfPrintSpec {
	resolvedScope := pdfScope(scope)
	pdfTheme := theme.ForKey(options.PDFTheme)
	footerTemplate := footerTemplateForOptions(pdfTheme, resolvedScope, options)
	return pdfPrintSpec{
		Landscape:      resolvedScope == theme.ScopeBookkeeping,
		Margins:        pdfTheme.PageMargins(resolvedScope),
		FooterTemplate: footerTemplate,
		DisplayFooter:  !options.SuppressPageFooter && footerTemplate != "",
	}
}

func footerTemplateForOptions(pdfTheme theme.Definition, scope theme.Scope, options Options) string {
	fontLanguages := pdfFontLanguages(options, options.PDFLanguages, scope)
	return pdfTheme.FooterTemplate(scope, primaryPDFChineseLanguage(fontLanguages))
}

func pdfScope(scope string) theme.Scope {
	if scope == string(theme.ScopeBookkeeping) {
		return theme.ScopeBookkeeping
	}
	return theme.ScopeBudget
}

func mmToInches(value float64) float64 {
	return value / 25.4
}

func countPDFPages(data []byte) int {
	pages := bytes.Count(data, []byte("/Type /Page"))
	pageTrees := bytes.Count(data, []byte("/Type /Pages"))
	if pages > pageTrees {
		return pages - pageTrees
	}
	return pages
}
