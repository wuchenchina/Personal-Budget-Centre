<?php

declare(strict_types=1);

namespace BudgetCentre\Auth;

use BudgetCentre\Http\Request;

final readonly class CsrfGuard
{
    private const PUBLIC_UNSAFE_PATHS = [
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/email/resend',
        '/api/auth/passkey/login/verify',
    ];

    public function __construct(private SessionManager $sessionManager)
    {
    }

    public function validate(Request $request): void
    {
        if (!$this->isUnsafeMethod($request->method) || $this->isPublicUnsafePath($request->path)) {
            return;
        }

        $sessionToken = $request->cookies[$this->sessionManager->cookieName()] ?? null;
        $csrfToken = $request->headers['x-csrf-token'] ?? null;

        if (!is_string($sessionToken) || $sessionToken === '') {
            throw new AuthException('UNAUTHENTICATED', 'Authentication is required.', 401);
        }

        if (
            !is_string($csrfToken)
            || !hash_equals($this->sessionManager->csrfToken($sessionToken), $csrfToken)
        ) {
            throw new AuthException('CSRF_TOKEN_INVALID', 'CSRF token is missing or invalid.', 419);
        }
    }

    private function isUnsafeMethod(string $method): bool
    {
        return in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true);
    }

    private function isPublicUnsafePath(string $path): bool
    {
        return in_array($path, self::PUBLIC_UNSAFE_PATHS, true);
    }
}
