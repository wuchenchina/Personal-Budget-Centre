<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

use BudgetCentre\Services\BudgetPdf\Themes\BudgetPdfThemeDefinition;
use BudgetCentre\Services\BudgetPdf\Themes\ClassicPdfTheme;

final readonly class BudgetPdfTableRenderer
{
    public function __construct(
        private BudgetPdfFormatter $formatter = new BudgetPdfFormatter(),
    ) {
    }

    public function css(?BudgetPdfThemeDefinition $theme = null): string
    {
        return ($theme ?? new ClassicPdfTheme())->budgetTableCss();
    }

    public function render(
        array $section,
        string $periodText,
        array $rows,
        ?array $summaryRow,
        string $emptyText,
        string $datePrefix = 'Date: ',
    ): string {
        $columns = $section['columns'] ?? [];
        $colspan = max(1, count($columns));
        $colgroup = $this->colgroupHtml($columns);
        $dateLine = $periodText === ''
            ? ''
            : '<div class="date-line">' . $this->formatter->escapeHtml($datePrefix)
                . $this->formatter->escapeHtml($periodText) . '</div>';
        $html = '<div class="template-section">'
            . '<table class="template-table section-band"><tbody><tr><td>'
            . $this->formatter->templateCellText((string) ($section['title'] ?? ''))
            . '</td></tr></tbody></table>'
            . $dateLine
            . '<table class="template-table column-table">' . $colgroup . '<tbody><tr>';

        foreach ($columns as $index => $column) {
            $html .= '<th class="' . trim($this->headerBorderClass($index, count($columns)) . ' ' . $this->columnClass($column)) . '"'
                . $this->cellWidthStyle($column)
                . '>'
                . $this->formatter->templateCellText((string) $column['label'])
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
