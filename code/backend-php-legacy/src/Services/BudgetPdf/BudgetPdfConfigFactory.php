<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

use Mpdf\Config\ConfigVariables;
use Mpdf\Config\FontVariables;

final readonly class BudgetPdfConfigFactory
{
    public function config(string $tempDir): array
    {
        $configDefaults = (new ConfigVariables())->getDefaults();
        $fontDefaults = (new FontVariables())->getDefaults();
        $fontDir = dirname(__DIR__, 4) . '/font';

        return [
            'mode' => 'utf-8',
            'format' => 'A4',
            'tempDir' => $tempDir,
            'fontDir' => array_merge($configDefaults['fontDir'], [$fontDir]),
            'fontdata' => array_merge($fontDefaults['fontdata'], [
                'timesnewroman' => [
                    'R' => 'Times New Roman.ttf',
                    'B' => 'Times New Roman Bold.ttf',
                    'I' => 'Times New Roman Italic.ttf',
                    'BI' => 'Times New Roman Bold Italic.ttf',
                ],
                'sf-mono' => [
                    'R' => 'SF-Mono-Regular.ttf',
                    'B' => 'SF-Mono-Bold.ttf',
                    'I' => 'SF-Mono-RegularItalic.ttf',
                    'BI' => 'SF-Mono-BoldItalic.ttf',
                ],
                'sf-mono-light' => [
                    'R' => 'SF-Mono-Light.ttf',
                    'I' => 'SF-Mono-LightItalic.ttf',
                ],
                'tcsongti' => [
                    'R' => 'Songti-TC-Regular.ttf',
                    'B' => 'Songti-TC-Bold.ttf',
                ],
            ]),
            'backupSubsFont' => ['tcsongti'],
            'default_font' => 'sf-mono',
            'autoScriptToLang' => false,
            'autoLangToFont' => false,
            'useSubstitutions' => true,
        ];
    }
}
