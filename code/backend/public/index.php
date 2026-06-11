<?php

declare(strict_types=1);

use BudgetCentre\App;
use BudgetCentre\Http\JsonResponse;
use BudgetCentre\Http\Request;
use BudgetCentre\Support\AppLog;
use BudgetCentre\Support\Env;

require dirname(__DIR__) . '/src/bootstrap.php';

ini_set('display_errors', '0');
ob_start();

try {
    $request = Request::fromGlobals();
    $response = (new App())->handle($request);
    if (ob_get_level() > 0) {
        ob_clean();
    }
    $response->send();
} catch (Throwable $exception) {
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    AppLog::error($exception, isset($request) && $request instanceof Request ? $request : null);

    JsonResponse::error(
        'INTERNAL_SERVER_ERROR',
        'Unexpected server error.',
        500,
        ['detail' => Env::string('APP_ENV') === 'local' ? $exception->getMessage() : null],
    )->send();
}
