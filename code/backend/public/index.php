<?php

declare(strict_types=1);

use BudgetCentre\App;
use BudgetCentre\Http\JsonResponse;
use BudgetCentre\Http\Request;
use BudgetCentre\Support\Env;

require dirname(__DIR__) . '/src/bootstrap.php';

try {
    (new App())->handle(Request::fromGlobals())->send();
} catch (Throwable $exception) {
    JsonResponse::error(
        'INTERNAL_SERVER_ERROR',
        'Unexpected server error.',
        500,
        ['detail' => Env::string('APP_ENV') === 'local' ? $exception->getMessage() : null],
    )->send();
}
