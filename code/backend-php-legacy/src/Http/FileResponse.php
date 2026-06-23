<?php

declare(strict_types=1);

namespace BudgetCentre\Http;

final readonly class FileResponse
{
    public function __construct(
        private string $path,
        private string $fileName,
        private string $contentType,
    ) {
    }

    public function send(): void
    {
        if (!is_file($this->path)) {
            JsonResponse::error('FILE_NOT_FOUND', 'Export file was not found.', 404)->send();

            return;
        }

        $fileName = basename($this->fileName);
        header("Content-Type: {$this->contentType}");
        header('Content-Length: ' . filesize($this->path));
        header('Content-Disposition: attachment; filename="' . addslashes($fileName) . '"');
        header('Cache-Control: private, max-age=0, must-revalidate');

        readfile($this->path);
    }
}
