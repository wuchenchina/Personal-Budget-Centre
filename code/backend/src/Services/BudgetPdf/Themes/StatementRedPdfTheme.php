<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf\Themes;

use BudgetCentre\Services\BudgetPdf\BudgetPdfFormatter;
use BudgetCentre\Services\BudgetPdf\BudgetPdfTheme;

final readonly class StatementRedPdfTheme implements BudgetPdfThemeDefinition
{
    public function __construct(private ClassicPdfTheme $classic = new ClassicPdfTheme())
    {
    }

    public function key(): string
    {
        return BudgetPdfTheme::STATEMENT_RED;
    }

    public function budgetDocumentCss(): string
    {
        return '@page{margin:16mm 16mm 17mm;footer:html_budgetPageFooter;}'
            . 'body{font-family:Arial,TCSongti,sans-serif;color:#111;font-size:7.2pt;}'
            . '.statement-red-header{margin:0 0 11mm;}'
            . '.statement-red-brand-row{width:100%;border-collapse:collapse;margin:0 0 8mm;}'
            . '.statement-red-mark-cell{width:42mm;vertical-align:top;}'
            . '.statement-red-mark{display:inline-block;width:13mm;height:9mm;background:#db0011;}'
            . '.statement-red-brand{display:inline-block;margin-left:3mm;color:#000;font-family:Arial,TCSongti,sans-serif;font-size:13pt;font-weight:700;line-height:1.05;}'
            . '.statement-red-brand small{display:block;font-size:8pt;font-weight:700;line-height:1.1;}'
            . '.statement-red-meta-cell{text-align:right;vertical-align:top;font-size:7.3pt;line-height:1.55;}'
            . '.statement-red-title{color:#db0011;font-family:Arial,TCSongti,sans-serif;font-size:20pt;font-weight:400;line-height:1.12;margin:0 0 8mm;}'
            . '.statement-red-subtitle{font-size:8.2pt;line-height:1.35;color:#111;}'
            . '.title,.subtitle{display:none;}'
            . '.title-line,.subtitle-line{display:block;line-height:1.22;}'
            . '.page-footer{font-family:Arial,TCSongti,sans-serif;font-size:7pt;color:#111;}'
            . '.statement-red-footer{width:100%;border-collapse:collapse;}'
            . '.statement-red-footer td{vertical-align:bottom;}'
            . '.statement-red-footer-right{text-align:right;}'
            . '.statement-red-footer-code{display:block;font-size:5.6pt;margin-top:1.8mm;}';
    }

    public function budgetTableCss(): string
    {
        return '.template-section{width:100%;margin-top:5.5mm;}'
            . '.template-section + .template-section{margin-top:6mm;}'
            . '.template-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}'
            . '.template-table th,.template-table td{border:0;padding:0.25mm 1.35mm;vertical-align:top;}'
            . '.section-band td{background:#9d9d9d;border:0.2mm solid #111;font-family:Arial,TCSongti,sans-serif;font-size:10.4pt;font-weight:400;line-height:1.12;padding-top:0.6mm;padding-bottom:0.55mm;}'
            . '.date-line{padding:1.6mm 1.35mm 0.8mm;text-decoration:underline;line-height:1.22;font-family:Arial,TCSongti,sans-serif;font-size:7.2pt;}'
            . '.column-table th{background:#d9d9d9;font-family:Arial,TCSongti,sans-serif;font-size:7pt;font-weight:400;line-height:1.16;text-align:left;}'
            . '.column-table .header-left{border-right:0.2mm solid #111;}'
            . '.column-table .header-middle{border-left:0.2mm solid #111;border-right:0.2mm solid #111;}'
            . '.column-table .header-last{border-left:0.2mm solid #111;}'
            . '.body-table td,.summary-table td{font-size:7pt;line-height:1.24;}'
            . '.summary-table td{background:#fff;border-top:0.2mm solid #111;font-weight:700;}'
            . '.align-right{text-align:right;}'
            . '.align-center{text-align:center;}'
            . '.money-cell{white-space:normal;}'
            . '.cell-line{display:block;margin:0;padding:0;line-height:1.2;}'
            . '.money-line{white-space:nowrap;}'
            . '.money-line-secondary{font-size:6.2pt;color:#333;}'
            . '.empty{text-align:center;color:#595959;}';
    }

    public function bookkeepingDocumentCss(): string
    {
        return str_replace(
            '@page{margin:16mm 16mm 17mm;footer:html_budgetPageFooter;}',
            '@page{margin:14mm 12mm 15mm;footer:html_budgetPageFooter;}',
            $this->budgetDocumentCss(),
        ) . 'body{font-size:6.5pt;}';
    }

    public function bookkeepingTableCss(): string
    {
        return '.bookkeeping-section{width:100%;margin-top:4.2mm;}'
            . '.bookkeeping-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}'
            . '.bookkeeping-table th,.bookkeeping-table td{border:0;padding:0.18mm 1mm;vertical-align:top;}'
            . '.bookkeeping-section-row td{background:#9d9d9d;border:0.2mm solid #111;font-family:Arial,TCSongti,sans-serif;font-size:9pt;font-weight:400;line-height:1.12;padding-top:0.42mm;padding-bottom:0.42mm;}'
            . '.bookkeeping-date-row td{text-decoration:underline;line-height:1.2;font-family:Arial,TCSongti,sans-serif;font-size:6.2pt;}'
            . '.bookkeeping-header-row th{background:#d9d9d9;font-family:Arial,TCSongti,sans-serif;font-size:6.1pt;font-weight:400;line-height:1.14;text-align:left;}'
            . '.bookkeeping-header-row th + th{border-left:0.2mm solid #111;}'
            . '.bookkeeping-body-row td{font-size:6.25pt;line-height:1.2;}'
            . '.bookkeeping-empty-row td{text-align:center;color:#595959;font-size:6.2pt;}'
            . '.bookkeeping-total-row td{background:#fff;border-top:0.2mm solid #111;font-size:6.25pt;font-weight:700;line-height:1.22;}'
            . '.bookkeeping-total-label{text-align:right;}'
            . '.bookkeeping-align-right{text-align:right;}'
            . '.bookkeeping-align-center{text-align:center;}'
            . '.bookkeeping-text-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-word;}'
            . '.bookkeeping-code-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-all;}'
            . '.bookkeeping-money-cell{white-space:normal;}'
            . '.bookkeeping-cell-line{display:block;margin:0;padding:0;line-height:1.2;}'
            . '.bookkeeping-money-line{white-space:nowrap;}'
            . '.bookkeeping-money-line-secondary{font-size:5.7pt;color:#333;}';
    }

    public function signatureCss(): string
    {
        return $this->classic->signatureCss()
            . '.signature-section{margin-top:5.5mm;}';
    }

    public function footerHtml(string $scope): string
    {
        $documentType = $scope === 'bookkeeping' ? 'Bookkeeping export' : 'Budget document';

        return '<htmlpagefooter name="budgetPageFooter"><div class="page-footer">'
            . '<table class="statement-red-footer"><tr><td>BudgetCentre PDF export<br>BudgetCentre PDF 匯出</td>'
            . '<td class="statement-red-footer-right">' . $documentType . '<span class="statement-red-footer-code">BUDGETCENTRE</span></td></tr></table>'
            . '</div></htmlpagefooter>';
    }

    public function headerHtml(
        array $budget,
        string $titleHtml,
        string $subtitleHtml,
        BudgetPdfFormatter $formatter,
        string $scope,
    ): string {
        $referenceNumber = $this->referenceNumber($budget);
        $date = date('j F Y');
        $documentTitle = $titleHtml;
        $subtitle = trim(strip_tags(str_replace(['</div>', '<br>'], "\n", $subtitleHtml)));
        $subtitleContent = $scope === 'bookkeeping' ? $titleHtml : '';
        if ($subtitle !== '') {
            $subtitleContent .= ($subtitleContent === '' ? '' : '<br>') . $formatter->escapeHtml($subtitle);
        }

        return '<div class="statement-red-header">'
            . '<table class="statement-red-brand-row"><tr><td class="statement-red-mark-cell">'
            . '<span class="statement-red-mark"></span><span class="statement-red-brand"><small>BudgetCentre</small>Report</span>'
            . '</td><td class="statement-red-meta-cell">'
            . 'Reference No. 參考編號: ' . $formatter->escapeHtml($referenceNumber) . '<br>'
            . 'Workspace 工作區: DIGITAL LEDGER<br>'
            . 'Page {PAGENO} of {nbpg}<br>'
            . $formatter->escapeHtml($date)
            . '</td></tr></table>'
            . '<div class="statement-red-title">' . $documentTitle . '</div>'
            . ($subtitleContent === '' ? '' : '<div class="statement-red-subtitle">' . $subtitleContent . '</div>')
            . '</div>';
    }

    private function referenceNumber(array $budget): string
    {
        $id = (int) ($budget['id'] ?? 0);
        $workspaceId = (int) ($budget['workspaceId'] ?? $budget['workspace_id'] ?? 0);
        $seed = str_pad((string) max(1, $id), 6, '0', STR_PAD_LEFT);

        return str_pad((string) ($workspaceId % 1000), 3, '0', STR_PAD_LEFT)
            . '-' . substr($seed, -6, 3)
            . substr($seed, -3)
            . '-' . str_pad((string) ($id % 1000), 3, '0', STR_PAD_LEFT);
    }
}
