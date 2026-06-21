<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Services\BudgetPdf\BudgetPdfConfigFactory;
use BudgetCentre\Services\BudgetPdf\BudgetPdfDocumentRenderer;
use Mpdf\Mpdf;

final readonly class BudgetPdfRenderer
{
    private BudgetPdfConfigFactory $configFactory;

    private BudgetPdfDocumentRenderer $documentRenderer;

    public function __construct(
        ?BudgetPdfConfigFactory $configFactory = null,
        ?BudgetPdfDocumentRenderer $documentRenderer = null,
    ) {
        $this->configFactory = $configFactory ?? new BudgetPdfConfigFactory();
        $this->documentRenderer = $documentRenderer ?? new BudgetPdfDocumentRenderer();
    }

    public function write(
        array $budget,
        array $template,
        string $path,
        string $tempDir,
        array $options = [],
    ): void {
        $mpdf = new Mpdf($this->configFactory->config($tempDir));
        $mpdf->WriteHTML($this->renderHtml($budget, $template, $options));
        if ($mpdf->page <= 1) {
            $mpdf = new Mpdf($this->configFactory->config($tempDir));
            $mpdf->WriteHTML($this->renderHtml($budget, $template, [
                ...$options,
                'suppressPageFooter' => true,
            ]));
        }
        $mpdf->Output($path, 'F');
    }

    public function renderHtml(array $budget, array $template, array $options = []): string
    {
        return $this->documentRenderer->render($budget, $template, $options);
    }
}
