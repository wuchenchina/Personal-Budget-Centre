<?php

declare(strict_types=1);

namespace BudgetCentre\Http;

final readonly class JsonResponse
{
    public function __construct(
        private array $payload,
        private int $status = 200,
    ) {
    }

    public static function ok(array $data = [], int $status = 200): self
    {
        return new self([
            'ok' => true,
            'data' => $data,
            'error' => null,
        ], $status);
    }

    public static function error(
        string $code,
        string $message,
        int $status = 400,
        array $meta = [],
    ): self {
        return new self([
            'ok' => false,
            'data' => null,
            'error' => [
                'code' => $code,
                'message' => $message,
                'meta' => $meta,
            ],
        ], $status);
    }

    public function send(): void
    {
        http_response_code($this->status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');

        echo json_encode($this->payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
