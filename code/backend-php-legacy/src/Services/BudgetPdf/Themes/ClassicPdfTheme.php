<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf\Themes;

use BudgetCentre\Services\BudgetPdf\BudgetPdfFormatter;
use BudgetCentre\Services\BudgetPdf\BudgetPdfTheme;

final readonly class ClassicPdfTheme implements BudgetPdfThemeDefinition
{
    public function key(): string
    {
        return BudgetPdfTheme::CLASSIC;
    }

    public function budgetDocumentCss(): string
    {
        return '@page{margin:29mm 29mm 22mm;footer:html_budgetPageFooter;}'
            . 'body{font-family:"SF-Mono",TCSongti,monospace;color:#000;font-size:7.5pt;}'
            . '.title{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 4mm;}'
            . '.title-line{display:block;line-height:1.25;}'
            . '.title sup{font-size:7pt;line-height:0;vertical-align:super;}'
            . '.subtitle{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 7mm;}'
            . '.subtitle-line{display:block;line-height:1.25;}'
            . '.page-footer{font-family:"SF-Mono",TCSongti,monospace;font-size:7pt;color:#666;text-align:center;}';
    }

    public function budgetTableCss(): string
    {
        return '.template-section{width:100%;margin-top:5mm;}'
            . '.template-section + .template-section{margin-top:7mm;}'
            . '.template-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}'
            . '.template-table th,.template-table td{border:0;padding:0.12mm 1.55mm;vertical-align:top;}'
            . '.section-band td{background:#a4a4a4;border:0.2mm solid #7e7e7e;font-family:"SF-Mono",TCSongti,monospace;font-size:9pt;font-weight:400;line-height:1.12;padding-top:0.35mm;padding-bottom:0.35mm;}'
            . '.date-line{border-top:0.2mm solid #7e7e7e;padding:0.12mm 1.55mm;text-decoration:underline;line-height:1.2;font-family:"SF-Mono-Light",TCSongti,monospace;font-size:6.8pt;}'
            . '.column-table th{background:#d7d7d7;font-family:"SF-Mono",TCSongti,monospace;font-size:6.8pt;font-weight:400;line-height:1.18;text-align:left;}'
            . '.column-table .header-left{border-right:0.2mm solid #7e7e7e;}'
            . '.column-table .header-middle{border-left:0.2mm solid #7e7e7e;border-right:0.2mm solid #7e7e7e;}'
            . '.column-table .header-last{border-left:0.2mm solid #7e7e7e;}'
            . '.body-table td,.summary-table td{font-size:6.8pt;line-height:1.32;}'
            . '.summary-table{border-top:0.35mm solid #5f5f5f;}'
            . '.summary-table td{background:#d7d7d7;border-top:0;}'
            . '.align-right{text-align:right;}'
            . '.align-center{text-align:center;}'
            . '.money-cell{white-space:normal;}'
            . '.cell-line{display:block;margin:0;padding:0;line-height:1.24;}'
            . '.money-line{white-space:nowrap;}'
            . '.money-line-secondary{font-size:6pt;color:#595959;}'
            . '.empty{text-align:center;color:#595959;}';
    }

    public function bookkeepingDocumentCss(): string
    {
        return '@page{margin:18mm 14mm 15mm;footer:html_budgetPageFooter;}'
            . 'body{font-family:"SF-Mono",TCSongti,monospace;color:#000;font-size:6.8pt;}'
            . '.title{font-family:TimesNewRoman,TCSongti,serif;font-size:13pt;font-weight:400;text-align:center;margin:0 0 3mm;}'
            . '.title-line{display:block;line-height:1.25;}'
            . '.title sup{font-size:7pt;line-height:0;vertical-align:super;}'
            . '.subtitle{font-family:TimesNewRoman,TCSongti,serif;font-size:13pt;font-weight:400;text-align:center;margin:0 0 6mm;}'
            . '.subtitle-line{display:block;line-height:1.25;}'
            . '.page-footer{font-family:"SF-Mono",TCSongti,monospace;font-size:7pt;color:#666;text-align:center;}';
    }

    public function bookkeepingTableCss(): string
    {
        return '.bookkeeping-section{width:100%;margin-top:5mm;}'
            . '.bookkeeping-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}'
            . '.bookkeeping-table th,.bookkeeping-table td{border:0;padding:0.12mm 1.15mm;vertical-align:top;}'
            . '.bookkeeping-section-row td{background:#a4a4a4;border:0.2mm solid #7e7e7e;font-family:"SF-Mono",TCSongti,monospace;font-size:9pt;font-weight:400;line-height:1.12;padding-top:0.35mm;padding-bottom:0.35mm;}'
            . '.bookkeeping-date-row td{border-top:0.2mm solid #7e7e7e;text-decoration:underline;line-height:1.2;font-family:"SF-Mono-Light",TCSongti,monospace;font-size:6.4pt;}'
            . '.bookkeeping-header-row th{background:#d7d7d7;font-family:"SF-Mono",TCSongti,monospace;font-size:6.1pt;font-weight:400;line-height:1.14;text-align:left;}'
            . '.bookkeeping-header-row th + th{border-left:0.2mm solid #7e7e7e;}'
            . '.bookkeeping-body-row td{font-size:6.4pt;line-height:1.24;}'
            . '.bookkeeping-empty-row td{text-align:center;color:#595959;font-size:6.4pt;}'
            . '.bookkeeping-total-row td{background:#f4f4f4;border-top:0.2mm solid #7e7e7e;font-size:6.4pt;font-weight:700;line-height:1.24;}'
            . '.bookkeeping-total-row-first td{border-top:0.35mm solid #5f5f5f;}'
            . '.bookkeeping-total-label{text-align:right;}'
            . '.bookkeeping-align-right{text-align:right;}'
            . '.bookkeeping-align-center{text-align:center;}'
            . '.bookkeeping-text-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-word;}'
            . '.bookkeeping-code-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-all;}'
            . '.bookkeeping-money-cell{white-space:normal;}'
            . '.bookkeeping-cell-line{display:block;margin:0;padding:0;line-height:1.22;}'
            . '.bookkeeping-money-line{white-space:nowrap;}'
            . '.bookkeeping-money-line-secondary{font-size:5.8pt;color:#595959;}';
    }

    public function signatureCss(): string
    {
        return '.signature-section{width:100%;margin-top:4mm;page-break-inside:avoid;}'
            . '.signature-svg{display:block;width:100%;height:auto;}';
    }

    public function signatureFullWidthMm(): float
    {
        return 152.0;
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
        return '<div class="title">' . $titleHtml . '</div>' . $subtitleHtml;
    }
}
