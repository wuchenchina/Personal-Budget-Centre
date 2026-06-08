<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BudgetRepository;
use BudgetCentre\Repositories\BudgetTemplateRepository;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Support\Input;
use DateTimeImmutable;
use PDO;
use Throwable;

final readonly class BudgetService
{
    private const VISIBILITIES = ['private', 'workspace', 'custom'];
    private const STATUSES = ['draft', 'active', 'closed', 'archived'];
    private const SIGNATURE_ROW_LIMIT = 50;
    private const SIGNATURE_CUSTOM_FIELD_LIMIT = 12;

    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function budgets(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($request->query['workspaceId'] ?? null);
        if ($workspaceId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId query parameter is required.', 422);
        }

        $permissions = $this->permissions();
        $role = $permissions->requireWorkspaceRole($workspaceId, (int) $session['user_id']);
        $includePrivate = $permissions->canReadPrivateBudgets($role);

        return (new BudgetRepository($this->pdo))->listForWorkspace(
            $workspaceId,
            (int) $session['user_id'],
            $includePrivate,
        );
    }

    public function createBudget(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        $title = Input::string($input['title'] ?? null);
        $ownerName = $this->ownerNameFromInput($input, (string) $session['display_name']);
        $startDate = $this->optionalDateFromInput($input, 'startDate', 'start_date');
        $endDate = $this->optionalDateFromInput($input, 'endDate', 'end_date');
        $baseCurrencyCode = strtoupper(
            Input::string($input['baseCurrency'] ?? $input['base_currency'] ?? null) ?? 'CNY',
        );
        $displayCurrencyCode = strtoupper(
            Input::string($input['displayCurrency'] ?? $input['display_currency'] ?? null)
                ?? $baseCurrencyCode,
        );
        $visibility = Input::string($input['visibility'] ?? null) ?? 'private';
        $status = Input::string($input['status'] ?? null) ?? 'draft';
        $note = Input::string($input['note'] ?? null);
        $signatureConfig = $this->signatureConfigJsonFromInput($input);

        if ($workspaceId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId is required.', 422);
        }

        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );
        $this->validateBudgetInput($title, $ownerName, $startDate, $endDate, $visibility, $status, $note);

        $currencies = new CurrencyRepository($this->pdo);
        $baseCurrencyId = $currencies->findIdByCode($baseCurrencyCode);
        $displayCurrencyId = $currencies->findIdByCode($displayCurrencyCode);
        if ($baseCurrencyId === null || $displayCurrencyId === null) {
            throw new AuthException('CURRENCY_NOT_FOUND', 'Budget currency is not available.', 422);
        }

        $templateId = (new BudgetTemplateRepository($this->pdo))->findGlobalIdByKey(
            'personal_living_budget',
        );

        $repository = new BudgetRepository($this->pdo);
        $this->pdo->beginTransaction();
        try {
            $budgetId = $repository->create(
                $workspaceId,
                (int) $session['user_id'],
                (int) $session['user_id'],
                (int) $session['user_id'],
                $templateId,
                $title,
                $ownerName,
                $startDate,
                $endDate,
                $baseCurrencyId,
                $displayCurrencyId,
                $visibility,
                $status,
                $note,
                $signatureConfig,
            );
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return $repository->findForUser($budgetId, (int) $session['user_id'], true) ?? [
            'id' => $budgetId,
            'workspaceId' => $workspaceId,
            'title' => $title,
            'ownerName' => $ownerName,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'baseCurrency' => $baseCurrencyCode,
            'displayCurrency' => $displayCurrencyCode,
            'visibility' => $visibility,
            'status' => $status,
            'note' => $note,
            'signatureConfig' => $this->signatureConfigFromJson($signatureConfig),
            'items' => [],
            'transactions' => [],
        ];
    }

    public function budget(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($request->query['id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Budget id query parameter is required.', 422);
        }

        $repository = new BudgetRepository($this->pdo);

        $permissions = $this->permissions();
        $role = $permissions->requireBudgetRole($budgetId, (int) $session['user_id']);
        $includePrivate = $permissions->canReadPrivateBudgets($role);
        $budget = $repository->findForUser($budgetId, (int) $session['user_id'], $includePrivate);
        if ($budget === null) {
            throw new AuthException('BUDGET_NOT_FOUND', 'Budget was not found.', 404);
        }

        return $budget;
    }

    public function updateBudget(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($input['id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Budget id is required.', 422);
        }

        $repository = new BudgetRepository($this->pdo);
        $this->permissions()->requireBudgetRole(
            $budgetId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );

        $payload = $this->validatedBudgetPayload($input, (string) $session['display_name']);
        if (!$this->hasSignatureConfigInput($input)) {
            $existingBudget = $repository->findForUser($budgetId, (int) $session['user_id'], true)
                ?? throw new AuthException('BUDGET_NOT_FOUND', 'Budget was not found.', 404);
            $payload['signatureConfig'] = json_encode(
                $existingBudget['signatureConfig'] ?? $this->emptySignatureConfig(),
                JSON_UNESCAPED_UNICODE,
            ) ?: null;
        }

        $currencies = new CurrencyRepository($this->pdo);
        $baseCurrencyId = $currencies->findIdByCode($payload['baseCurrency']);
        $displayCurrencyId = $currencies->findIdByCode($payload['displayCurrency']);
        if ($baseCurrencyId === null || $displayCurrencyId === null) {
            throw new AuthException('CURRENCY_NOT_FOUND', 'Budget currency is not available.', 422);
        }

        $repository->update(
            $budgetId,
            $payload['title'],
            $payload['ownerName'],
            $payload['startDate'],
            $payload['endDate'],
            $baseCurrencyId,
            $displayCurrencyId,
            $payload['visibility'],
            $payload['status'],
            $payload['note'],
            $payload['signatureConfig'],
        );

        return $repository->findForUser($budgetId, (int) $session['user_id'], true)
            ?? throw new AuthException('BUDGET_NOT_FOUND', 'Budget was not found.', 404);
    }

    public function deleteBudget(array $input, Request $request): void
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($input['id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Budget id is required.', 422);
        }

        $repository = new BudgetRepository($this->pdo);
        $this->permissions()->requireBudgetRole(
            $budgetId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );
        $repository->delete($budgetId);
    }

    private function permissions(): PermissionGuard
    {
        return new PermissionGuard($this->pdo, $this->authenticator);
    }

    private function validatedBudgetPayload(array $input, string $defaultOwnerName): array
    {
        $title = Input::string($input['title'] ?? null);
        $ownerName = $this->ownerNameFromInput($input, $defaultOwnerName);
        $startDate = $this->optionalDateFromInput($input, 'startDate', 'start_date');
        $endDate = $this->optionalDateFromInput($input, 'endDate', 'end_date');
        $baseCurrencyCode = strtoupper(
            Input::string($input['baseCurrency'] ?? $input['base_currency'] ?? null) ?? 'CNY',
        );
        $displayCurrencyCode = strtoupper(
            Input::string($input['displayCurrency'] ?? $input['display_currency'] ?? null)
                ?? $baseCurrencyCode,
        );
        $visibility = Input::string($input['visibility'] ?? null) ?? 'private';
        $status = Input::string($input['status'] ?? null) ?? 'draft';
        $note = Input::string($input['note'] ?? null);
        $signatureConfig = $this->signatureConfigJsonFromInput($input);

        $this->validateBudgetInput($title, $ownerName, $startDate, $endDate, $visibility, $status, $note);

        return [
            'title' => $title,
            'ownerName' => $ownerName,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'baseCurrency' => $baseCurrencyCode,
            'displayCurrency' => $displayCurrencyCode,
            'visibility' => $visibility,
            'status' => $status,
            'note' => $note,
            'signatureConfig' => $signatureConfig,
        ];
    }

    private function validateBudgetInput(
        ?string $title,
        string $ownerName,
        ?string $startDate,
        ?string $endDate,
        string $visibility,
        string $status,
        ?string $note,
    ): void {
        if ($title === null || strlen($title) > 255) {
            throw new AuthException('VALIDATION_ERROR', 'Budget title is required and must be 255 characters or less.', 422);
        }

        if (strlen($ownerName) > 160) {
            throw new AuthException('VALIDATION_ERROR', 'Owner name must be 160 characters or less.', 422);
        }

        if (($startDate === null) !== ($endDate === null)) {
            throw new AuthException('VALIDATION_ERROR', 'Budget period must include both start date and end date.', 422);
        }

        if ($startDate !== null && $endDate !== null && $startDate > $endDate) {
            throw new AuthException('VALIDATION_ERROR', 'Start date must be before or equal to end date.', 422);
        }

        if (!in_array($visibility, self::VISIBILITIES, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Budget visibility must be private, workspace, or custom.', 422);
        }

        if (!in_array($status, self::STATUSES, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Budget status must be draft, active, closed, or archived.', 422);
        }

        if ($note !== null && strlen($note) > 20000) {
            throw new AuthException('VALIDATION_ERROR', 'Budget note must be 20000 characters or less.', 422);
        }
    }

    private function ownerNameFromInput(array $input, string $defaultOwnerName): string
    {
        foreach (['ownerName', 'owner_name'] as $key) {
            if (!array_key_exists($key, $input)) {
                continue;
            }

            return is_string($input[$key]) ? trim($input[$key]) : '';
        }

        return $defaultOwnerName;
    }

    private function optionalDateFromInput(array $input, string $camelKey, string $snakeKey): ?string
    {
        foreach ([$camelKey, $snakeKey] as $key) {
            if (!array_key_exists($key, $input)) {
                continue;
            }

            if ($input[$key] === null || $input[$key] === '') {
                return null;
            }

            $date = Input::date($input[$key]);
            if ($date === null) {
                throw new AuthException('VALIDATION_ERROR', 'Budget period dates must use YYYY-MM-DD.', 422);
            }

            return $date;
        }

        return null;
    }

    private function signatureConfigJsonFromInput(array $input): ?string
    {
        $raw = $input['signatureConfig'] ?? $input['signature_config'] ?? null;
        if ($raw === null) {
            return null;
        }

        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                throw new AuthException('VALIDATION_ERROR', 'Signature settings must be valid JSON.', 422);
            }
            $raw = $decoded;
        }

        if (!is_array($raw)) {
            throw new AuthException('VALIDATION_ERROR', 'Signature settings must be an object.', 422);
        }

        $config = $this->signatureConfigFromArray($raw);
        $json = json_encode($config, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw new AuthException('VALIDATION_ERROR', 'Signature settings could not be encoded.', 422);
        }

        return $json;
    }

    private function hasSignatureConfigInput(array $input): bool
    {
        return array_key_exists('signatureConfig', $input) || array_key_exists('signature_config', $input);
    }

    private function signatureConfigFromJson(?string $json): array
    {
        if ($json === null || trim($json) === '') {
            return $this->emptySignatureConfig();
        }

        $decoded = json_decode($json, true);

        return is_array($decoded) ? $decoded : $this->emptySignatureConfig();
    }

    private function signatureConfigFromArray(array $input): array
    {
        $title = $this->limitedString($input['title'] ?? null, 120) ?? 'Confirmation Signature';
        $rows = [];
        $rawRows = is_array($input['rows'] ?? null) ? array_slice($input['rows'], 0, self::SIGNATURE_ROW_LIMIT) : [];
        foreach ($rawRows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $normalized = $this->signatureRowFromArray($row);
            if ($normalized !== null) {
                $rows[] = $normalized;
            }
        }

        return [
            'enabled' => ($input['enabled'] ?? false) === true,
            'title' => $title,
            'labelLanguage' => $this->signatureLabelLanguage($input['labelLanguage'] ?? $input['label_language'] ?? null),
            'labelMode' => $this->signatureLabelMode($input['labelMode'] ?? $input['label_mode'] ?? null),
            'labelSeparator' => $this->signatureLabelSeparator($input['labelSeparator'] ?? $input['label_separator'] ?? null),
            'sectionAlign' => ($input['sectionAlign'] ?? $input['section_align'] ?? null) === 'right' ? 'right' : 'full',
            'showControlText' => ($input['showControlText'] ?? $input['show_control_text'] ?? true) !== false,
            'rows' => $rows,
        ];
    }

    private function signatureRowFromArray(array $row): ?array
    {
        $displayName = $this->limitedString($row['displayName'] ?? $row['display_name'] ?? null, 160) ?? '';
        $roleLabel = $this->limitedString($row['roleLabel'] ?? $row['role_label'] ?? null, 120) ?? '';
        $email = $this->limitedString($row['email'] ?? null, 190);
        $position = $this->limitedString($row['position'] ?? null, 160);
        $signedAt = $this->signatureDateTime($row['signedAt'] ?? $row['signed_at'] ?? null);
        $memberUserId = Input::positiveInt($row['memberUserId'] ?? $row['member_user_id'] ?? null);
        $customFields = $this->signatureCustomFieldsFromArray($row['customFields'] ?? $row['custom_fields'] ?? null);

        if (
            $displayName === ''
            && $roleLabel === ''
            && $email === null
            && $position === null
            && $signedAt === null
            && $customFields === []
            && $memberUserId === null
        ) {
            return null;
        }

        return [
            'id' => $this->limitedString($row['id'] ?? null, 80) ?? bin2hex(random_bytes(8)),
            'participantType' => ($row['participantType'] ?? $row['participant_type'] ?? null) === 'workspace_member'
                ? 'workspace_member'
                : 'manual',
            'memberUserId' => $memberUserId,
            'roleLabel' => $roleLabel,
            'displayName' => $displayName,
            'email' => $email,
            'position' => $position,
            'signedAt' => $signedAt,
            'customFields' => $customFields,
            'showRole' => ($row['showRole'] ?? $row['show_role'] ?? true) !== false,
            'showName' => ($row['showName'] ?? $row['show_name'] ?? true) !== false,
            'showEmail' => ($row['showEmail'] ?? $row['show_email'] ?? false) === true,
            'showPosition' => ($row['showPosition'] ?? $row['show_position'] ?? false) === true,
            'showSignature' => ($row['showSignature'] ?? $row['show_signature'] ?? true) !== false,
            'showDateTime' => ($row['showDateTime'] ?? $row['show_date_time'] ?? true) !== false,
        ];
    }

    private function signatureCustomFieldsFromArray(mixed $fields): array
    {
        if (!is_array($fields)) {
            return [];
        }

        $normalizedFields = [];
        foreach (array_slice($fields, 0, self::SIGNATURE_CUSTOM_FIELD_LIMIT) as $field) {
            if (!is_array($field)) {
                continue;
            }

            $normalized = $this->signatureCustomFieldFromArray($field);
            if ($normalized !== null) {
                $normalizedFields[] = $normalized;
            }
        }

        return $normalizedFields;
    }

    private function signatureCustomFieldFromArray(array $field): ?array
    {
        $label = $this->limitedString($field['label'] ?? null, 80) ?? '';
        $value = $this->limitedString($field['value'] ?? null, 240) ?? '';

        if ($label === '' && $value === '') {
            return null;
        }

        return [
            'id' => $this->limitedString($field['id'] ?? null, 80) ?? bin2hex(random_bytes(8)),
            'label' => $label,
            'value' => $value,
            'show' => ($field['show'] ?? true) !== false,
        ];
    }

    private function signatureDateTime(mixed $value): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }

        $trimmed = trim($value);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed) === 1) {
            $date = Input::date($trimmed);
            if ($date !== null) {
                return $date;
            }
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/', $trimmed) === 1) {
            $normalized = strlen($trimmed) === 16 ? $trimmed . ':00' : $trimmed;
            $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $normalized);
            if ($date !== false && $date->format('Y-m-d H:i:s') === $normalized) {
                return $normalized;
            }
        }

        throw new AuthException('VALIDATION_ERROR', 'Signature date and time must use YYYY-MM-DD HH:mm:ss.', 422);
    }

    private function limitedString(mixed $value, int $maxLength): ?string
    {
        $string = Input::string($value);
        if ($string === null) {
            return null;
        }

        if (strlen($string) > $maxLength) {
            throw new AuthException('VALIDATION_ERROR', 'Signature settings contain text that is too long.', 422);
        }

        return $string;
    }

    private function signatureLabelLanguage(mixed $value): string
    {
        return in_array($value, ['en', 'sc', 'tc'], true) ? $value : 'en';
    }

    private function signatureLabelMode(mixed $value): string
    {
        return in_array($value, ['confirmation_signature', 'confirmation', 'signature'], true)
            ? $value
            : 'confirmation_signature';
    }

    private function signatureLabelSeparator(mixed $value): string
    {
        return in_array($value, ['none', 'space', 'slash', 'line'], true) ? $value : 'space';
    }

    private function emptySignatureConfig(): array
    {
        return [
            'enabled' => false,
            'title' => 'Confirmation Signature',
            'labelLanguage' => 'en',
            'labelMode' => 'confirmation_signature',
            'labelSeparator' => 'space',
            'sectionAlign' => 'full',
            'showControlText' => true,
            'rows' => [],
        ];
    }
}
