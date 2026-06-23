<?php

declare(strict_types=1);

namespace BudgetCentre\Auth;

use RuntimeException;

final class AuthException extends RuntimeException
{
    public function __construct(
        private readonly string $errorCode,
        string $message,
        private readonly int $status = 400,
        private readonly array $meta = [],
    ) {
        parent::__construct($message);
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }

    public function status(): int
    {
        return $this->status;
    }

    public function meta(): array
    {
        return $this->meta;
    }
}
