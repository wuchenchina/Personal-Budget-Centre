<?php

declare(strict_types=1);

namespace BudgetCentre\Auth;

use BudgetCentre\Support\Env;

final class SessionManager
{
    public const SESSION_DAYS = 30;

    public function cookieName(): string
    {
        return Env::string('SESSION_COOKIE', 'budgetcentre_session') ?? 'budgetcentre_session';
    }

    public function issueCookie(string $token): void
    {
        setcookie($this->cookieName(), $token, [
            'expires' => time() + (self::SESSION_DAYS * 24 * 60 * 60),
            'path' => '/',
            'secure' => $this->isSecureCookie(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public function clearCookie(): void
    {
        setcookie($this->cookieName(), '', [
            'expires' => time() - 3600,
            'path' => '/',
            'secure' => $this->isSecureCookie(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public function csrfToken(string $token): string
    {
        return hash_hmac('sha256', 'budgetcentre-csrf-v1', $token);
    }

    public function newToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    public function expiresAt(): string
    {
        return gmdate('Y-m-d H:i:s', time() + (self::SESSION_DAYS * 24 * 60 * 60));
    }

    private function isSecureCookie(): bool
    {
        $apiUrl = Env::string('API_URL', '');
        $appUrl = Env::string('APP_URL', '');

        return str_starts_with((string) $apiUrl, 'https://')
            || str_starts_with((string) $appUrl, 'https://');
    }
}
