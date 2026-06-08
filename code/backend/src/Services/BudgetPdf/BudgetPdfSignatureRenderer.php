<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

final readonly class BudgetPdfSignatureRenderer
{
    public function __construct(
        private BudgetPdfFormatter $formatter = new BudgetPdfFormatter(),
    ) {
    }

    public function css(): string
    {
        return '.signature-section{width:100%;margin-top:4mm;page-break-inside:avoid;}'
            . '.signature-svg{display:block;width:100%;height:auto;}';
    }

    public function render(array $budget): string
    {
        $config = $budget['signatureConfig'] ?? null;
        if (!is_array($config) || ($config['enabled'] ?? false) !== true || !is_array($config['rows'] ?? null) || $config['rows'] === []) {
            return '';
        }

        $width = ($config['sectionAlign'] ?? null) === 'right' ? 76.0 : 152.0;
        $svg = $this->svg($config, $width);
        $height = $this->svgHeight($config, $width);

        $image = $this->imageHtml($svg, $width, $height, 'block');

        if (($config['sectionAlign'] ?? null) === 'right') {
            return '<div class="template-section signature-section" style="text-align:right">'
                . $this->imageHtml($svg, $width, $height, 'inline-block')
                . '</div>';
        }

        return '<div class="template-section signature-section">' . $image . '</div>';
    }

    private function imageHtml(string $svg, float $width, float $height, string $display): string
    {
        return '<img class="signature-svg" src="data:image/svg+xml;base64,'
            . base64_encode($svg)
            . '" style="display:' . $display
            . ';width:' . $this->number($width)
            . 'mm;height:' . $this->number($height)
            . 'mm" alt="">';
    }

    private function svg(array $config, float $width): string
    {
        $height = $this->svgHeight($config, $width);
        $title = is_string($config['title'] ?? null) && trim($config['title']) !== ''
            ? trim($config['title'])
            : 'Confirmation Signature';
        $rows = array_values(array_filter(
            $config['rows'],
            static fn (mixed $row): bool => is_array($row),
        ));

        $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' . $this->number($width) . 'mm" height="' . $this->number($height) . 'mm" viewBox="0 0 ' . $this->number($width) . ' ' . $this->number($height) . '">'
            . '<rect x="0" y="0" width="' . $this->number($width) . '" height="6" fill="#a4a4a4" stroke="#7e7e7e" stroke-width="0.2"/>'
            . $this->text(2, 4.35, $title, 3.7, '#000')
            . '<rect x="0" y="6" width="' . $this->number($width) . '" height="' . $this->number($height - 6) . '" fill="#fff" stroke="#7e7e7e" stroke-width="0.2"/>';

        $rowTop = 8.0;
        foreach ($rows as $index => $row) {
            $rowHeight = $this->rowHeight($row, $config, $width);
            if ($index > 0) {
                $svg .= '<line x1="2" y1="' . $this->number($rowTop - 1.1) . '" x2="' . $this->number($width - 2) . '" y2="' . $this->number($rowTop - 1.1) . '" stroke="#bfbfbf" stroke-width="0.16"/>';
            }
            $fields = $this->signatureFields($row, $config);
            $svg .= $this->metaSvg($fields, $rowTop, $width);
            if (($row['showSignature'] ?? true) !== false) {
                $svg .= $this->signatureBoxSvg($config, $rowTop, $width, max(1, count($fields)));
            }
            $rowTop += $rowHeight;
        }

        return $svg . '</svg>';
    }

    private function svgHeight(array $config, float $width): float
    {
        $rows = is_array($config['rows'] ?? null)
            ? array_values(array_filter($config['rows'], static fn (mixed $row): bool => is_array($row)))
            : [];
        if ($rows === []) {
            return 10.0 + $this->minimumRowHeight($width);
        }

        return 10.0 + array_sum(array_map(
            fn (array $row): float => $this->rowHeight($row, $config, $width),
            $rows,
        ));
    }

    private function rowHeight(array $row, array $config, float $width): float
    {
        $fieldCount = max(1, count($this->signatureFields($row, $config)));
        if ($width <= 80.0) {
            return max($this->minimumRowHeight($width), max(29.0, 5.0 + ($fieldCount * 5.0)) + 28.0);
        }

        return max($this->minimumRowHeight($width), 9.0 + ($fieldCount * 5.0));
    }

    private function minimumRowHeight(float $width): float
    {
        return $width <= 80.0 ? 58.0 : 34.0;
    }

    private function signatureFields(array $row, array $config): array
    {
        $fields = [];
        if (($row['showName'] ?? true) !== false && trim((string) ($row['displayName'] ?? '')) !== '') {
            $fields[] = [$this->formatter->signatureMetaLabel($config, 'participant'), (string) $row['displayName']];
        }
        if (($row['showRole'] ?? true) !== false && trim((string) ($row['roleLabel'] ?? '')) !== '') {
            $fields[] = [
                $this->formatter->signatureMetaLabel($config, 'capacity'),
                $this->formatter->signatureRoleForDisplay($config, (string) $row['roleLabel']),
            ];
        }
        if (($row['showPosition'] ?? false) === true && trim((string) ($row['position'] ?? '')) !== '') {
            $fields[] = [$this->formatter->signatureMetaLabel($config, 'position'), (string) $row['position']];
        }
        if (($row['showEmail'] ?? false) === true && trim((string) ($row['email'] ?? '')) !== '') {
            $fields[] = [$this->formatter->signatureMetaLabel($config, 'email'), (string) $row['email']];
        }
        foreach (($row['customFields'] ?? []) as $field) {
            if (!is_array($field) || ($field['show'] ?? true) === false) {
                continue;
            }

            $label = trim((string) ($field['label'] ?? ''));
            $value = trim((string) ($field['value'] ?? ''));
            if ($label === '' && $value === '') {
                continue;
            }

            $fields[] = [$label, $value];
        }
        if (($row['showDateTime'] ?? true) !== false) {
            $fields[] = [
                $this->formatter->signatureMetaLabel($config, 'dateTime'),
                $this->formatter->signatureDateTimeForDisplay((string) ($row['signedAt'] ?? '')),
            ];
        }

        return $fields;
    }

    private function metaSvg(array $fields, float $rowTop, float $width): string
    {
        $labelX = 3.0;
        $valueX = $width <= 80.0 ? 23.0 : 27.0;
        $valueWidth = $width <= 80.0 ? 48.0 : 43.0;
        $baseline = $rowTop + 4.0;
        $svg = '';
        foreach (array_slice($fields, 0, 18) as $index => [$label, $value]) {
            $y = $baseline + ($index * 5.0);
            $svg .= $this->text($labelX, $y, $this->fitText((string) $label, $valueX - $labelX - 2.0), 2.25, '#555', 'sf-mono-light');
            $svg .= $this->text($valueX, $y, $this->fitText((string) $value, $valueWidth), 2.55, '#111');
        }

        return $svg;
    }

    private function signatureBoxSvg(array $config, float $rowTop, float $width, int $fieldCount): string
    {
        $boxWidth = $width <= 80.0 ? 66.0 : 74.0;
        $boxHeight = $width <= 80.0 ? 23.0 : 24.0;
        $boxX = $width <= 80.0 ? 5.0 : $width - $boxWidth - 7.0;
        $boxY = $width <= 80.0 ? $rowTop + max(29.0, 5.0 + ($fieldCount * 5.0)) : $rowTop + 4.0;
        $label = $this->formatter->signatureLabel($config);
        $lineY = $boxY + $boxHeight - 5.0;
        $caption = $this->fitText($label, $boxWidth - 8.0);
        $captionAlign = ($config['labelAlign'] ?? null) === 'right' ? 'right' : 'left';
        $captionX = $captionAlign === 'right' ? $boxX + $boxWidth - 4.0 : $boxX + 4.0;

        $svg = '<rect x="' . $this->number($boxX) . '" y="' . $this->number($boxY) . '" width="' . $this->number($boxWidth) . '" height="' . $this->number($boxHeight) . '" fill="#fff" stroke="#7e7e7e" stroke-width="0.2"/>'
            . $this->securityPatternSvg($boxX, $boxY, $boxWidth, $boxHeight)
            . '<line x1="' . $this->number($boxX + 4.0) . '" y1="' . $this->number($lineY) . '" x2="' . $this->number($boxX + $boxWidth - 4.0) . '" y2="' . $this->number($lineY) . '" stroke="#8f8f8f" stroke-width="0.16"/>'
            . $this->text($captionX, $boxY + $boxHeight - 1.6, $caption, 1.75, '#555', 'sf-mono-light', $captionAlign === 'right' ? 'end' : 'start');

        return $svg;
    }

    private function securityPatternSvg(float $x, float $y, float $width, float $height): string
    {
        $innerTop = $y + 4.8;
        $innerBottom = $y + $height - 7.3;
        $left = $x + 4.0;
        $right = $x + $width - 4.0;
        $middle = $y + ($height / 2) - 0.8;
        $waveOneTop = $innerTop + $this->randomFloat(-0.7, 0.9);
        $waveOneBottom = $innerBottom + $this->randomFloat(-0.8, 0.8);
        $waveTwoTop = $innerTop + $this->randomFloat(-0.5, 0.7);
        $waveTwoBottom = $innerBottom + $this->randomFloat(-0.6, 0.9);
        $waveGap = $this->randomFloat(1.7, 2.8);
        $crossStartY = $y + $this->randomFloat(5.7, 7.0);
        $crossEndY = $y + $height - $this->randomFloat(7.8, 9.3);
        $counterCrossStartY = $y + $this->randomFloat(5.9, 7.2);
        $counterCrossEndY = $y + $height - $this->randomFloat(7.7, 9.0);
        $guideY = $y + $this->randomFloat(7.7, 10.2);
        $thirdMiddle = $middle + $this->randomFloat(3.1, 4.5);

        return '<path d="M ' . $this->number($left) . ' ' . $this->number($middle)
            . ' C ' . $this->number($x + $this->randomFloat(17.0, 22.0)) . ' ' . $this->number($waveOneTop)
            . ', ' . $this->number($x + $width - $this->randomFloat(17.0, 22.0)) . ' ' . $this->number($waveOneBottom)
            . ', ' . $this->number($right) . ' ' . $this->number($middle)
            . '" fill="none" stroke="#eeeeee" stroke-width="0.18"/>'
            . '<path d="M ' . $this->number($left) . ' ' . $this->number($middle + $waveGap)
            . ' C ' . $this->number($x + $this->randomFloat(18.0, 23.0)) . ' ' . $this->number($waveTwoBottom)
            . ', ' . $this->number($x + $width - $this->randomFloat(18.0, 23.0)) . ' ' . $this->number($waveTwoTop)
            . ', ' . $this->number($right) . ' ' . $this->number($middle + $waveGap)
            . '" fill="none" stroke="#f1f1f1" stroke-width="0.18"/>'
            . '<path d="M ' . $this->number($left + 2.0) . ' ' . $this->number($thirdMiddle)
            . ' C ' . $this->number($x + $this->randomFloat(20.0, 25.0)) . ' ' . $this->number($innerTop + $this->randomFloat(2.2, 4.0))
            . ', ' . $this->number($x + $width - $this->randomFloat(20.0, 25.0)) . ' ' . $this->number($innerBottom + $this->randomFloat(0.4, 1.6))
            . ', ' . $this->number($right - 2.0) . ' ' . $this->number($thirdMiddle + $this->randomFloat(-0.8, 0.6))
            . '" fill="none" stroke="#eeeeee" stroke-width="0.16"/>'
            . '<line x1="' . $this->number($x + 7) . '" y1="' . $this->number($crossStartY) . '" x2="' . $this->number($x + $width - 7) . '" y2="' . $this->number($crossEndY) . '" stroke="#f3f3f3" stroke-width="0.12"/>'
            . '<line x1="' . $this->number($x + $width - 7) . '" y1="' . $this->number($counterCrossStartY) . '" x2="' . $this->number($x + 7) . '" y2="' . $this->number($counterCrossEndY) . '" stroke="#f3f3f3" stroke-width="0.12"/>'
            . '<line x1="' . $this->number($x + 7) . '" y1="' . $this->number($guideY) . '" x2="' . $this->number($x + $width - 7) . '" y2="' . $this->number($guideY + $this->randomFloat(-0.35, 0.35)) . '" stroke="#f4f4f4" stroke-width="0.12"/>';
    }

    private function text(
        float $x,
        float $y,
        string $value,
        float $size,
        string $color,
        string $font = 'sf-mono',
        string $anchor = 'start',
    ): string {
        $anchorAttribute = $anchor === 'start' ? '' : ' text-anchor="' . $anchor . '"';

        return '<text x="' . $this->number($x) . '" y="' . $this->number($y) . '"'
            . ' font-family="' . $this->fontFamily($value, $font) . '"'
            . ' font-size="' . $this->number($size) . '"'
            . ' fill="' . $color . '"'
            . $anchorAttribute
            . '>'
            . $this->svgEscape($value)
            . '</text>';
    }

    private function fitText(string $value, float $maxWidth): string
    {
        $trimmed = trim($value);
        $limit = max(10, (int) floor($maxWidth / 1.25));
        $length = function_exists('mb_strlen') ? mb_strlen($trimmed, 'UTF-8') : strlen($trimmed);
        if ($length <= $limit) {
            return $trimmed;
        }

        return (function_exists('mb_substr')
            ? mb_substr($trimmed, 0, $limit - 1, 'UTF-8')
            : substr($trimmed, 0, $limit - 1))
            . '...';
    }

    private function svgEscape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private function randomFloat(float $min, float $max): float
    {
        return random_int((int) round($min * 100), (int) round($max * 100)) / 100;
    }

    private function fontFamily(string $value, string $font): string
    {
        if (preg_match('/[\x{3400}-\x{9fff}\x{f900}-\x{faff}]/u', $value) === 1) {
            return 'tcsongti, Songti TC, serif';
        }

        return $font . ', sf-mono, monospace';
    }

    private function number(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
    }
}
