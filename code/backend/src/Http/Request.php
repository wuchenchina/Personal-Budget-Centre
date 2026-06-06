<?php

declare(strict_types=1);

namespace BudgetCentre\Http;

final readonly class Request
{
    public function __construct(
        public string $method,
        public string $path,
        public array $query,
        public array $headers,
        public array $cookies,
        private string $rawBody,
        public ?string $ipAddress,
        public ?string $userAgent,
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        $query = [];
        parse_str(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_QUERY) ?: '', $query);

        foreach ($_SERVER as $key => $value) {
            if (!str_starts_with((string) $key, 'HTTP_')) {
                continue;
            }

            $header = strtolower(str_replace('_', '-', substr((string) $key, 5)));
            $headers[$header] = (string) $value;
        }

        return new self(
            $_SERVER['REQUEST_METHOD'] ?? 'GET',
            parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/',
            $query,
            $headers,
            $_COOKIE,
            file_get_contents('php://input') ?: '',
            $_SERVER['REMOTE_ADDR'] ?? null,
            $_SERVER['HTTP_USER_AGENT'] ?? null,
        );
    }

    public function json(): array
    {
        if ($this->rawBody === '') {
            return [];
        }

        $decoded = json_decode($this->rawBody, true);
        if (!is_array($decoded)) {
            throw new InvalidJsonRequestException('Request body must be a JSON object.');
        }

        return $decoded;
    }
}
