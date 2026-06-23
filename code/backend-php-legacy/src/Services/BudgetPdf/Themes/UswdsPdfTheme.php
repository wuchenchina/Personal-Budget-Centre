<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf\Themes;

use BudgetCentre\Services\BudgetPdf\BudgetPdfFormatter;
use BudgetCentre\Services\BudgetPdf\BudgetPdfTheme;

final readonly class UswdsPdfTheme implements BudgetPdfThemeDefinition
{
    public function __construct(private ClassicPdfTheme $classic = new ClassicPdfTheme())
    {
    }

    public function key(): string
    {
        return BudgetPdfTheme::USWDS;
    }

    public function budgetDocumentCss(): string
    {
        return '@page{margin:16mm 16mm 17mm;footer:html_budgetPageFooter;}'
            . 'body{font-family:Arial,TCSongti,sans-serif;color:#1b1b1b;font-size:7.2pt;}'
            . '.uswds-header{margin:0 0 8.5mm;border-top:1.1mm solid #005ea8;padding-top:3.2mm;}'
            . '.uswds-header-table{width:100%;border-collapse:collapse;margin:0 0 5.5mm;}'
            . '.uswds-title-cell{vertical-align:bottom;padding:0 8mm 0 0;}'
            . '.uswds-meta-cell{width:66mm;text-align:right;vertical-align:top;padding:0;}'
            . '.uswds-meta-table{width:100%;border-collapse:collapse;font-size:7pt;line-height:1.3;border-top:0.2mm solid #dfe1e2;}'
            . '.uswds-meta-table td{padding:0.65mm 0;border-bottom:0.2mm solid #dfe1e2;vertical-align:top;}'
            . '.uswds-meta-label{width:31mm;text-align:left;color:#565c65;white-space:nowrap;font-weight:700;}'
            . '.uswds-meta-value{text-align:right;color:#1b1b1b;}'
            . '.uswds-title{color:#1a4480;font-family:Arial,TCSongti,sans-serif;font-size:19pt;font-weight:700;line-height:1.14;margin:0;}'
            . '.uswds-subtitle{font-size:8.1pt;line-height:1.38;color:#3d4551;border-left:0.8mm solid #00bde3;padding-left:2.4mm;}'
            . '.title,.subtitle{display:none;}'
            . '.title-line,.subtitle-line{display:block;line-height:1.22;}'
            . '.page-footer{font-family:Arial,TCSongti,sans-serif;font-size:7pt;color:#565c65;text-align:center;border-top:0.2mm solid #dfe1e2;padding-top:1.2mm;}';
    }

    public function budgetTableCss(): string
    {
        return '.template-section{width:100%;margin-top:5.5mm;}'
            . '.template-section + .template-section{margin-top:6.2mm;}'
            . '.template-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}'
            . '.template-table th,.template-table td{border:0;padding:0.32mm 1.35mm;vertical-align:top;}'
            . '.section-band td{background:#1a4480;color:#fff;border:0.2mm solid #1a4480;font-family:Arial,TCSongti,sans-serif;font-size:9.7pt;font-weight:700;line-height:1.15;padding-top:0.75mm;padding-bottom:0.7mm;}'
            . '.date-line{padding:1.4mm 1.35mm 0.85mm;line-height:1.24;font-family:Arial,TCSongti,sans-serif;font-size:7.1pt;color:#3d4551;border-bottom:0.2mm solid #dfe1e2;}'
            . '.column-table th{background:#e7f6f8;color:#1a4480;border-bottom:0.25mm solid #005ea8;font-family:Arial,TCSongti,sans-serif;font-size:6.9pt;font-weight:700;line-height:1.18;text-align:left;}'
            . '.column-table .header-left{border-right:0.2mm solid #dfe1e2;}'
            . '.column-table .header-middle{border-left:0.2mm solid #dfe1e2;border-right:0.2mm solid #dfe1e2;}'
            . '.column-table .header-last{border-left:0.2mm solid #dfe1e2;}'
            . '.body-table td,.summary-table td{font-size:6.95pt;line-height:1.27;border-bottom:0.15mm solid #f0f0f0;}'
            . '.summary-table{border-top:0.45mm solid #005ea8;}'
            . '.summary-table td{background:#e7f6f8;border-top:0;font-weight:700;color:#1b1b1b;}'
            . '.align-right{text-align:right;}'
            . '.align-center{text-align:center;}'
            . '.money-cell{white-space:normal;}'
            . '.cell-line{display:block;margin:0;padding:0;line-height:1.22;}'
            . '.money-line{white-space:nowrap;}'
            . '.money-line-secondary{font-size:6.15pt;color:#565c65;}'
            . '.empty{text-align:center;color:#71767a;}';
    }

    public function bookkeepingDocumentCss(): string
    {
        return str_replace(
            '@page{margin:16mm 16mm 17mm;footer:html_budgetPageFooter;}',
            '@page{margin:14mm 12mm 15mm;footer:html_budgetPageFooter;}',
            $this->budgetDocumentCss(),
        ) . 'body{font-size:6.45pt;}';
    }

    public function bookkeepingTableCss(): string
    {
        return '.bookkeeping-section{width:100%;margin-top:4.2mm;}'
            . '.bookkeeping-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}'
            . '.bookkeeping-table th,.bookkeeping-table td{border:0;padding:0.2mm 1mm;vertical-align:top;}'
            . '.bookkeeping-section-row td{background:#1a4480;color:#fff;border:0.2mm solid #1a4480;font-family:Arial,TCSongti,sans-serif;font-size:8.8pt;font-weight:700;line-height:1.14;padding-top:0.5mm;padding-bottom:0.5mm;}'
            . '.bookkeeping-date-row td{line-height:1.2;font-family:Arial,TCSongti,sans-serif;font-size:6.2pt;color:#3d4551;border-bottom:0.2mm solid #dfe1e2;}'
            . '.bookkeeping-header-row th{background:#e7f6f8;color:#1a4480;border-bottom:0.25mm solid #005ea8;font-family:Arial,TCSongti,sans-serif;font-size:6.05pt;font-weight:700;line-height:1.14;text-align:left;}'
            . '.bookkeeping-header-row th + th{border-left:0.2mm solid #dfe1e2;}'
            . '.bookkeeping-body-row td{font-size:6.2pt;line-height:1.21;border-bottom:0.15mm solid #f0f0f0;}'
            . '.bookkeeping-empty-row td{text-align:center;color:#71767a;font-size:6.2pt;}'
            . '.bookkeeping-total-row td{background:#e7f6f8;border-top:0.2mm solid #dfe1e2;font-size:6.2pt;font-weight:700;line-height:1.22;}'
            . '.bookkeeping-total-row-first td{border-top:0.45mm solid #005ea8;}'
            . '.bookkeeping-total-label{text-align:right;}'
            . '.bookkeeping-align-right{text-align:right;}'
            . '.bookkeeping-align-center{text-align:center;}'
            . '.bookkeeping-text-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-word;}'
            . '.bookkeeping-code-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-all;}'
            . '.bookkeeping-money-cell{white-space:normal;}'
            . '.bookkeeping-cell-line{display:block;margin:0;padding:0;line-height:1.2;}'
            . '.bookkeeping-money-line{white-space:nowrap;}'
            . '.bookkeeping-money-line-secondary{font-size:5.65pt;color:#565c65;}';
    }

    public function signatureCss(): string
    {
        return $this->classic->signatureCss()
            . '.signature-section{margin-top:5.5mm;border-top:0.35mm solid #005ea8;padding-top:2.4mm;}';
    }

    public function signatureFullWidthMm(): float
    {
        return 178.0;
    }

    public function footerHtml(string $scope): string
    {
        return '<htmlpagefooter name="budgetPageFooter"><div class="page-footer">Page {PAGENO} of {nbpg}</div></htmlpagefooter>';
    }

    public function headerHtml(
        array $budget,
        string $titleHtml,
        string $subtitleHtml,
        BudgetPdfFormatter $formatter,
        string $scope,
        array $options = [],
    ): string {
        $date = date('j F Y');
        $subtitle = trim(strip_tags(str_replace(['</div>', '<br>'], "\n", $subtitleHtml)));
        $subtitleContent = '';
        if ($subtitle !== '') {
            $subtitleContent = $formatter->escapeHtml($subtitle);
        }
        $metaRows = [
            ['Pages', '總頁數', '{nbpg}'],
            ['Date', '日期', $date],
        ];
        $workspaceName = trim((string) ($budget['workspaceName'] ?? $budget['workspace_name'] ?? ''));
        if (($options['showWorkspace'] ?? $options['show_workspace'] ?? false) === true && $workspaceName !== '') {
            $metaRows[] = ['Workspace', '工作區', $workspaceName];
        }

        return '<div class="uswds-header">'
            . '<table class="uswds-header-table"><tr><td class="uswds-title-cell">'
            . '<div class="uswds-title">' . $titleHtml . '</div>'
            . '</td><td class="uswds-meta-cell">'
            . $this->metaTableHtml($metaRows, $formatter)
            . '</td></tr></table>'
            . ($subtitleContent === '' ? '' : '<div class="uswds-subtitle">' . $subtitleContent . '</div>')
            . '</div>';
    }

    private function metaTableHtml(array $rows, BudgetPdfFormatter $formatter): string
    {
        $html = '<table class="uswds-meta-table">';
        foreach ($rows as [$english, $chinese, $value]) {
            $label = $english === 'Date'
                ? $english . ' / ' . $chinese
                : $english . ' ' . $chinese;
            $html .= '<tr><td class="uswds-meta-label">'
                . $formatter->escapeHtml($label)
                . '</td><td class="uswds-meta-value">'
                . $formatter->escapeHtml((string) $value)
                . '</td></tr>';
        }

        return $html . '</table>';
    }
}
