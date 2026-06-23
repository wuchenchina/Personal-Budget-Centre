<?php

declare(strict_types=1);

namespace BudgetCentre\Http;

final readonly class RedirectResponse
{
    public function __construct(
        private string $location,
        private int $status = 302,
    ) {
    }

    public function send(): void
    {
        http_response_code($this->status);
        header('Location: ' . $this->location);
        header('Cache-Control: no-store');
    }
}
