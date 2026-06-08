<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

final readonly class BudgetPdfTableRenderer
{
    public function __construct(
        private BudgetPdfFormatter $formatter = new BudgetPdfFormatter(),
    ) {
    }

    public function css(): string
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
            . '.summary-table td{background:#d7d7d7;}'
            . '.align-right{text-align:right;}'
            . '.align-center{text-align:center;}'
            . '.money-cell{white-space:normal;}'
            . '.cell-line{display:block;margin:0;padding:0;line-height:1.24;}'
            . '.money-line{white-space:nowrap;}'
            . '.money-code{display:inline-block;min-width:6.6mm;margin-right:1.15mm;color:#66726d;text-align:right;font-family:"SF-Mono",TCSongti,monospace;font-size:5.7pt;font-weight:700;line-height:1.15;}'
            . '.money-amount{display:inline-block;min-width:13mm;color:#000;text-align:right;font-family:"SF-Mono",TCSongti,monospace;}'
            . '.empty{text-align:center;color:#595959;}';
    }

    public function render(
        array $section,
        string $periodText,
        array $rows,
        ?array $summaryRow,
        string $emptyText,
    ): string {
        $columns = $section['columns'] ?? [];
        $colspan = max(1, count($columns));
        $colgroup = $this->colgroupHtml($columns);
        $dateLine = $periodText === ''
            ? ''
            : '<div class="date-line">Date: ' . $this->formatter->escapeHtml($periodText) . '</div>';
        $html = '<div class="template-section">'
            . '<table class="template-table section-band"><tbody><tr><td>'
            . $this->formatter->escapeHtml((string) ($section['title'] ?? ''))
            . '</td></tr></tbody></table>'
            . $dateLine
            . '<table class="template-table column-table">' . $colgroup . '<tbody><tr>';

        foreach ($columns as $index => $column) {
            $html .= '<th class="' . trim($this->headerBorderClass($index, count($columns)) . ' ' . $this->columnClass($column)) . '"'
                . $this->cellWidthStyle($column)
                . '>'
                . $this->formatter->escapeHtml((string) $column['label'])
                . '</th>';
        }

        $html .= '</tr></tbody></table>'
            . '<table class="template-table body-table">' . $colgroup . '<tbody>';

        if ($rows === []) {
            $html .= '<tr><td class="empty" colspan="' . $colspan . '">' . $this->formatter->escapeHtml($emptyText) . '</td></tr>';
        }

        foreach ($rows as $row) {
            $html .= '<tr>';
            foreach ($row as $index => $cell) {
                $column = $columns[$index] ?? [];
                $html .= '<td class="' . $this->columnClass($column) . '"'
                    . $this->cellWidthStyle($column)
                    . '>'
                    . $this->cellText($cell, $column)
                    . '</td>';
            }
            $html .= '</tr>';
        }
        $html .= '</tbody></table>';

        if ($summaryRow !== null) {
            $html .= '<table class="template-table summary-table">' . $colgroup . '<tbody><tr>';
            foreach ($summaryRow as $index => $cell) {
                $column = $columns[$index] ?? [];
                $html .= '<td class="' . $this->columnClass($column) . '"'
                    . $this->cellWidthStyle($column)
                    . '>'
                    . $this->cellText($cell, $column)
                    . '</td>';
            }
            $html .= '</tr></tbody></table>';
        }

        return $html . '</div>';
    }

    private function colgroupHtml(array $columns): string
    {
        $html = '<colgroup>';
        foreach ($columns as $column) {
            $html .= '<col' . $this->cellWidthStyle($column) . '>';
        }

        return $html . '</colgroup>';
    }

    private function cellWidthStyle(array $column): string
    {
        $width = max(1, min(100, (float) ($column['widthPercent'] ?? 25)));

        return ' style="width:' . $width . '%"';
    }

    private function headerBorderClass(int $index, int $total): string
    {
        if ($index === 0) {
            return $total === 1 ? '' : 'header-left';
        }

        return $index === $total - 1 ? 'header-last' : 'header-middle';
    }

    private function columnClass(array $column): string
    {
        $classes = match ((string) ($column['align'] ?? 'left')) {
            'right' => ['align-right'],
            'center' => ['align-center'],
            default => [],
        };
        if (($column['dataType'] ?? null) === 'money') {
            $classes[] = 'money-cell';
        }

        return implode(' ', $classes);
    }

    private function cellText(mixed $cell, array $column): string
    {
        $value = (string) $cell;
        if (($column['dataType'] ?? null) === 'money') {
            return $this->formatter->templateMoneyCellText($value);
        }

        return $this->formatter->templateCellText($value);
    }
}
