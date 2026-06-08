<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class BudgetRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function listForWorkspace(int $workspaceId, int $userId, bool $includePrivate): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              b.id,
              b.workspace_id,
              b.title,
              b.owner_name,
              b.start_date,
              b.end_date,
              b.budget_type,
              b.installment_period_unit,
              b.visibility,
              b.status,
              b.note,
              b.signature_config,
              b.created_at,
              b.updated_at,
              base.code AS base_currency,
              display.code AS display_currency,
              bt.template_key,
              bt.name AS template_name,
              COALESCE(bit.total_budget_base, 0) AS total_budget_base,
              COALESCE(bit.total_estimated_base, 0) AS total_estimated_base,
              COALESCE(bit.total_variance_base, 0) AS total_variance_base,
              COALESCE(tx.transaction_count, 0) AS transaction_count,
              COALESCE(tx.transaction_total_base, 0) AS transaction_total_base
            FROM budgets b
            INNER JOIN currencies base ON base.id = b.base_currency_id
            INNER JOIN currencies display ON display.id = b.display_currency_id
            LEFT JOIN budget_templates bt ON bt.id = b.template_id
            LEFT JOIN (
              SELECT
                bi.budget_id,
                SUM(
                  CASE
                    WHEN bi.budget_amount_original = 0 AND bi.budget_amount_base = 0 AND COALESCE(txc.transaction_total_base, 0) <> 0
                      THEN COALESCE(txc.transaction_total_base, 0)
                    ELSE bi.budget_amount_base
                  END
                ) AS total_budget_base,
                SUM(COALESCE(txc.transaction_total_base, 0)) AS total_estimated_base,
                SUM(
                  CASE
                    WHEN bi.budget_amount_original = 0 AND bi.budget_amount_base = 0 AND COALESCE(txc.transaction_total_base, 0) <> 0
                      THEN COALESCE(txc.transaction_total_base, 0)
                    ELSE bi.budget_amount_base
                  END - COALESCE(txc.transaction_total_base, 0)
                ) AS total_variance_base
              FROM budget_items bi
              LEFT JOIN (
                SELECT
                  budget_id,
                  category_id,
                  SUM(amount_base) AS transaction_total_base
                FROM budget_transactions
                GROUP BY budget_id, category_id
              ) txc ON txc.budget_id = bi.budget_id
                AND txc.category_id <=> bi.category_id
              GROUP BY bi.budget_id
            ) bit ON bit.budget_id = b.id
            LEFT JOIN (
              SELECT
                budget_id,
                COUNT(*) AS transaction_count,
                SUM(amount_base) AS transaction_total_base
              FROM budget_transactions
              GROUP BY budget_id
            ) tx ON tx.budget_id = b.id
            WHERE b.workspace_id = :workspace_id
              AND (
                :include_private = 1
                OR b.visibility = 'workspace'
                OR b.user_id = :user_id
                OR b.owner_user_id = :owner_user_id
                OR b.created_by_user_id = :creator_user_id
                OR EXISTS (
                  SELECT 1
                  FROM budget_shares bs
                  LEFT JOIN workgroups share_wg
                    ON bs.principal_type = 'workgroup'
                    AND share_wg.id = bs.principal_id
                  LEFT JOIN workgroup_members share_wgm
                    ON share_wgm.workgroup_id = share_wg.id
                    AND share_wgm.user_id = :share_user_id
                  WHERE bs.budget_id = b.id
                    AND (bs.expires_at IS NULL OR bs.expires_at > UTC_TIMESTAMP())
                    AND (
                      (bs.principal_type = 'workspace' AND bs.principal_id = b.workspace_id)
                      OR (bs.principal_type = 'user' AND bs.principal_id = :share_direct_user_id)
                      OR (
                        bs.principal_type = 'workgroup'
                        AND share_wg.workspace_id = b.workspace_id
                        AND share_wgm.user_id IS NOT NULL
                      )
                    )
                )
              )
            ORDER BY b.start_date IS NULL ASC, b.start_date DESC, b.updated_at DESC, b.id DESC
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'owner_user_id' => $userId,
            'creator_user_id' => $userId,
            'share_user_id' => $userId,
            'share_direct_user_id' => $userId,
            'include_private' => $includePrivate ? 1 : 0,
        ]);

        return array_map(
            fn (array $row): array => $this->budgetFromRow($row),
            $statement->fetchAll(),
        );
    }

    public function create(
        int $workspaceId,
        int $userId,
        int $ownerUserId,
        int $createdByUserId,
        ?int $templateId,
        string $title,
        string $ownerName,
        ?string $startDate,
        ?string $endDate,
        int $baseCurrencyId,
        int $displayCurrencyId,
        string $budgetType,
        string $installmentPeriodUnit,
        string $visibility,
        string $status,
        ?string $note,
        ?string $signatureConfig,
    ): int {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budgets (
              workspace_id,
              user_id,
              owner_user_id,
              created_by_user_id,
              template_id,
              title,
              owner_name,
              start_date,
              end_date,
              base_currency_id,
              display_currency_id,
              budget_type,
              installment_period_unit,
              visibility,
              status,
              note,
              signature_config
            ) VALUES (
              :workspace_id,
              :user_id,
              :owner_user_id,
              :created_by_user_id,
              :template_id,
              :title,
              :owner_name,
              :start_date,
              :end_date,
              :base_currency_id,
              :display_currency_id,
              :budget_type,
              :installment_period_unit,
              :visibility,
              :status,
              :note,
              :signature_config
            )
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'owner_user_id' => $ownerUserId,
            'created_by_user_id' => $createdByUserId,
            'template_id' => $templateId,
            'title' => $title,
            'owner_name' => $ownerName,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'base_currency_id' => $baseCurrencyId,
            'display_currency_id' => $displayCurrencyId,
            'budget_type' => $budgetType,
            'installment_period_unit' => $installmentPeriodUnit,
            'visibility' => $visibility,
            'status' => $status,
            'note' => $note,
            'signature_config' => $signatureConfig,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function findForUser(int $budgetId, int $userId, bool $includePrivate): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              b.id,
              b.workspace_id,
              b.title,
              b.owner_name,
              b.start_date,
              b.end_date,
              b.budget_type,
              b.installment_period_unit,
              b.visibility,
              b.status,
              b.note,
              b.signature_config,
              b.created_at,
              b.updated_at,
              base.code AS base_currency,
              display.code AS display_currency,
              bt.template_key,
              bt.name AS template_name,
              COALESCE(bit.total_budget_base, 0) AS total_budget_base,
              COALESCE(bit.total_estimated_base, 0) AS total_estimated_base,
              COALESCE(bit.total_variance_base, 0) AS total_variance_base,
              COALESCE(tx.transaction_count, 0) AS transaction_count,
              COALESCE(tx.transaction_total_base, 0) AS transaction_total_base
            FROM budgets b
            INNER JOIN currencies base ON base.id = b.base_currency_id
            INNER JOIN currencies display ON display.id = b.display_currency_id
            LEFT JOIN budget_templates bt ON bt.id = b.template_id
            LEFT JOIN (
              SELECT
                bi.budget_id,
                SUM(
                  CASE
                    WHEN bi.budget_amount_original = 0 AND bi.budget_amount_base = 0 AND COALESCE(txc.transaction_total_base, 0) <> 0
                      THEN COALESCE(txc.transaction_total_base, 0)
                    ELSE bi.budget_amount_base
                  END
                ) AS total_budget_base,
                SUM(COALESCE(txc.transaction_total_base, 0)) AS total_estimated_base,
                SUM(
                  CASE
                    WHEN bi.budget_amount_original = 0 AND bi.budget_amount_base = 0 AND COALESCE(txc.transaction_total_base, 0) <> 0
                      THEN COALESCE(txc.transaction_total_base, 0)
                    ELSE bi.budget_amount_base
                  END - COALESCE(txc.transaction_total_base, 0)
                ) AS total_variance_base
              FROM budget_items bi
              LEFT JOIN (
                SELECT
                  budget_id,
                  category_id,
                  SUM(amount_base) AS transaction_total_base
                FROM budget_transactions
                GROUP BY budget_id, category_id
              ) txc ON txc.budget_id = bi.budget_id
                AND txc.category_id <=> bi.category_id
              GROUP BY bi.budget_id
            ) bit ON bit.budget_id = b.id
            LEFT JOIN (
              SELECT
                budget_id,
                COUNT(*) AS transaction_count,
                SUM(amount_base) AS transaction_total_base
              FROM budget_transactions
              GROUP BY budget_id
            ) tx ON tx.budget_id = b.id
            WHERE b.id = :budget_id
              AND (
                :include_private = 1
                OR b.visibility = 'workspace'
                OR b.user_id = :user_id
                OR b.owner_user_id = :owner_user_id
                OR b.created_by_user_id = :creator_user_id
                OR EXISTS (
                  SELECT 1
                  FROM budget_shares bs
                  LEFT JOIN workgroups share_wg
                    ON bs.principal_type = 'workgroup'
                    AND share_wg.id = bs.principal_id
                  LEFT JOIN workgroup_members share_wgm
                    ON share_wgm.workgroup_id = share_wg.id
                    AND share_wgm.user_id = :share_user_id
                  WHERE bs.budget_id = b.id
                    AND (bs.expires_at IS NULL OR bs.expires_at > UTC_TIMESTAMP())
                    AND (
                      (bs.principal_type = 'workspace' AND bs.principal_id = b.workspace_id)
                      OR (bs.principal_type = 'user' AND bs.principal_id = :share_direct_user_id)
                      OR (
                        bs.principal_type = 'workgroup'
                        AND share_wg.workspace_id = b.workspace_id
                        AND share_wgm.user_id IS NOT NULL
                      )
                    )
                )
              )
            LIMIT 1
            SQL
        );
        $statement->execute([
            'budget_id' => $budgetId,
            'user_id' => $userId,
            'owner_user_id' => $userId,
            'creator_user_id' => $userId,
            'share_user_id' => $userId,
            'share_direct_user_id' => $userId,
            'include_private' => $includePrivate ? 1 : 0,
        ]);
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        return [
            ...$this->budgetFromRow($row),
            'items' => $this->itemsForBudget($budgetId),
            'transactions' => $this->transactionsForBudget($budgetId),
        ];
    }

    public function workspaceIdForBudget(int $budgetId): ?int
    {
        $statement = $this->pdo->prepare(
            'SELECT workspace_id FROM budgets WHERE id = :budget_id LIMIT 1'
        );
        $statement->execute(['budget_id' => $budgetId]);
        $workspaceId = $statement->fetchColumn();

        return $workspaceId === false ? null : (int) $workspaceId;
    }

    public function accessBasics(int $budgetId): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              workspace_id,
              user_id,
              owner_user_id,
              created_by_user_id,
              visibility
            FROM budgets
            WHERE id = :budget_id
            LIMIT 1
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'workspaceId' => (int) $row['workspace_id'],
            'userId' => (int) $row['user_id'],
            'ownerUserId' => (int) $row['owner_user_id'],
            'createdByUserId' => (int) $row['created_by_user_id'],
            'visibility' => $row['visibility'],
        ];
    }

    public function currencyBasics(int $budgetId): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              b.id,
              b.workspace_id,
              b.start_date,
              b.base_currency_id,
              base.code AS base_currency
            FROM budgets b
            INNER JOIN currencies base ON base.id = b.base_currency_id
            WHERE b.id = :budget_id
            LIMIT 1
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'workspaceId' => (int) $row['workspace_id'],
            'startDate' => $row['start_date'],
            'baseCurrencyId' => (int) $row['base_currency_id'],
            'baseCurrency' => $row['base_currency'],
        ];
    }

    public function update(
        int $budgetId,
        string $title,
        string $ownerName,
        ?string $startDate,
        ?string $endDate,
        int $baseCurrencyId,
        int $displayCurrencyId,
        string $budgetType,
        string $installmentPeriodUnit,
        string $visibility,
        string $status,
        ?string $note,
        ?string $signatureConfig,
    ): void {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE budgets
            SET
              title = :title,
              owner_name = :owner_name,
              start_date = :start_date,
              end_date = :end_date,
              base_currency_id = :base_currency_id,
              display_currency_id = :display_currency_id,
              budget_type = :budget_type,
              installment_period_unit = :installment_period_unit,
              visibility = :visibility,
              status = :status,
              note = :note,
              signature_config = :signature_config
            WHERE id = :budget_id
            SQL
        );
        $statement->execute([
            'budget_id' => $budgetId,
            'title' => $title,
            'owner_name' => $ownerName,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'base_currency_id' => $baseCurrencyId,
            'display_currency_id' => $displayCurrencyId,
            'budget_type' => $budgetType,
            'installment_period_unit' => $installmentPeriodUnit,
            'visibility' => $visibility,
            'status' => $status,
            'note' => $note,
            'signature_config' => $signatureConfig,
        ]);
    }

    public function delete(int $budgetId): void
    {
        $statement = $this->pdo->prepare('DELETE FROM budgets WHERE id = :budget_id');
        $statement->execute(['budget_id' => $budgetId]);
    }

    private function itemsForBudget(int $budgetId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              bi.id,
              bi.category_id,
              bi.label,
              bc.name AS category_name,
              budget_currency.code AS budget_currency,
              bi.budget_amount_original,
              bi.budget_rate_to_base,
              bi.budget_amount_base,
              estimated_currency.code AS estimated_currency,
              bi.estimated_amount_original,
              bi.estimated_rate_to_base,
              bi.estimated_amount_base,
              bi.variance_amount_base,
              bi.installment_config,
              bi.sort_order
            FROM budget_items bi
            LEFT JOIN budget_categories bc ON bc.id = bi.category_id
            INNER JOIN currencies budget_currency ON budget_currency.id = bi.budget_currency_id
            INNER JOIN currencies estimated_currency ON estimated_currency.id = bi.estimated_currency_id
            WHERE bi.budget_id = :budget_id
            ORDER BY bi.sort_order ASC, bi.id ASC
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);

        return array_map(
            fn (array $row): array => [
                'id' => (int) $row['id'],
                'categoryId' => $row['category_id'] === null ? null : (int) $row['category_id'],
                'category' => $row['category_name'],
                'label' => $row['label'],
                'budget' => [
                    'currency' => $row['budget_currency'],
                    'amountOriginal' => $this->decimal($row['budget_amount_original']),
                    'rateToBase' => $this->decimal($row['budget_rate_to_base']),
                    'amountBase' => $this->decimal($row['budget_amount_base']),
                ],
                'estimatedActuals' => [
                    'currency' => $row['estimated_currency'],
                    'amountOriginal' => $this->decimal($row['estimated_amount_original']),
                    'rateToBase' => $this->decimal($row['estimated_rate_to_base']),
                    'amountBase' => $this->decimal($row['estimated_amount_base']),
                ],
                'varianceBase' => $this->decimal($row['variance_amount_base']),
                'installmentConfig' => $this->installmentConfig($row['installment_config'] ?? null),
                'sortOrder' => (int) $row['sort_order'],
            ],
            $statement->fetchAll(),
        );
    }

    private function transactionsForBudget(int $budgetId): array
    {
        $hasReferenceColumns = $this->hasTransactionReferenceColumns();
        $referenceSelect = $hasReferenceColumns
            ? <<<'SQL'
              reference_currency.code AS reference_currency,
              bt.reference_amount_original,
            SQL
            : <<<'SQL'
              NULL AS reference_currency,
              NULL AS reference_amount_original,
            SQL;
        $referenceJoin = $hasReferenceColumns
            ? 'LEFT JOIN currencies reference_currency ON reference_currency.id = bt.reference_currency_id'
            : '';
        $statement = $this->pdo->prepare(
            <<<SQL
            SELECT
              bt.id,
              bt.category_id,
              bt.transaction_date,
              bt.details,
              bc.name AS category_name,
              currency.code AS currency,
              bt.amount_original,
              bt.rate_to_base,
              bt.amount_base,
            {$referenceSelect}
              bt.remark,
              bt.sort_order
            FROM budget_transactions bt
            LEFT JOIN budget_categories bc ON bc.id = bt.category_id
            INNER JOIN currencies currency ON currency.id = bt.currency_id
            {$referenceJoin}
            WHERE bt.budget_id = :budget_id
            ORDER BY bt.sort_order ASC, bt.id ASC
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);

        return array_map(
            fn (array $row): array => [
                'id' => (int) $row['id'],
                'categoryId' => $row['category_id'] === null ? null : (int) $row['category_id'],
                'category' => $row['category_name'],
                'transactionDate' => $row['transaction_date'],
                'details' => $row['details'],
                'currency' => $row['currency'],
                'amountOriginal' => $this->decimal($row['amount_original']),
                'rateToBase' => $this->decimal($row['rate_to_base']),
                'amountBase' => $this->decimal($row['amount_base']),
                'referenceCurrency' => $row['reference_currency'],
                'referenceAmountOriginal' => $row['reference_amount_original'] === null
                    ? null
                    : $this->decimal($row['reference_amount_original']),
                'remark' => $row['remark'],
                'sortOrder' => (int) $row['sort_order'],
            ],
            $statement->fetchAll(),
        );
    }

    private function budgetFromRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'workspaceId' => (int) $row['workspace_id'],
            'title' => $row['title'],
            'ownerName' => $row['owner_name'],
            'startDate' => $row['start_date'],
            'endDate' => $row['end_date'],
            'baseCurrency' => $row['base_currency'],
            'displayCurrency' => $row['display_currency'],
            'budgetType' => $row['budget_type'] ?? 'regular',
            'installmentPeriodUnit' => $row['installment_period_unit'] ?? 'month',
            'visibility' => $row['visibility'],
            'status' => $row['status'],
            'note' => $row['note'],
            'signatureConfig' => $this->signatureConfig($row['signature_config'] ?? null),
            'template' => [
                'key' => $row['template_key'],
                'name' => $row['template_name'],
            ],
            'totals' => [
                'totalBudgetBase' => $this->decimal($row['total_budget_base']),
                'totalEstimatedBase' => $this->decimal($row['total_estimated_base']),
                'totalVarianceBase' => $this->decimal($row['total_variance_base']),
                'totalTransactionBase' => $this->decimal($row['transaction_total_base']),
                'transactionCount' => (int) $row['transaction_count'],
            ],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
    }

    private function decimal(mixed $value): float
    {
        return $value === null ? 0.0 : (float) $value;
    }

    private function installmentConfig(mixed $value): array
    {
        if (!is_string($value) || trim($value) === '') {
            return $this->emptyInstallmentConfig();
        }

        $decoded = json_decode($value, true);
        if (!is_array($decoded)) {
            return $this->emptyInstallmentConfig();
        }

        $months = is_int($decoded['months'] ?? null) ? $decoded['months'] : null;
        $paidMonths = is_int($decoded['paidMonths'] ?? null) ? $decoded['paidMonths'] : 0;

        return [
            'enabled' => ($decoded['enabled'] ?? false) === true,
            'months' => $months,
            'paidMonths' => max(0, min($months ?? 0, $paidMonths)),
            'monthlyAmount' => is_numeric($decoded['monthlyAmount'] ?? null)
                ? (float) $decoded['monthlyAmount']
                : null,
            'totalAmount' => is_numeric($decoded['totalAmount'] ?? null)
                ? (float) $decoded['totalAmount']
                : null,
            'startMonth' => is_string($decoded['startMonth'] ?? null) && preg_match('/^\d{4}-\d{2}$/', $decoded['startMonth']) === 1
                ? $decoded['startMonth']
                : null,
            'periodUnit' => in_array($decoded['periodUnit'] ?? null, ['day', 'week', 'month', 'year'], true)
                ? $decoded['periodUnit']
                : 'month',
            'remark' => is_string($decoded['remark'] ?? null) && trim($decoded['remark']) !== ''
                ? trim($decoded['remark'])
                : null,
        ];
    }

    private function emptyInstallmentConfig(): array
    {
        return [
            'enabled' => false,
            'months' => null,
            'paidMonths' => 0,
            'monthlyAmount' => null,
            'totalAmount' => null,
            'startMonth' => null,
            'periodUnit' => 'month',
            'remark' => null,
        ];
    }

    private function signatureConfig(mixed $value): array
    {
        if (!is_string($value) || trim($value) === '') {
            return $this->emptySignatureConfig();
        }

        $decoded = json_decode($value, true);
        if (!is_array($decoded)) {
            return $this->emptySignatureConfig();
        }
        $infoLanguage = in_array($decoded['infoLanguage'] ?? null, ['en', 'sc', 'tc'], true)
            ? $decoded['infoLanguage']
            : (in_array($decoded['labelLanguage'] ?? null, ['en', 'sc', 'tc'], true) ? $decoded['labelLanguage'] : 'en');
        $title = is_string($decoded['title'] ?? null) && trim($decoded['title']) !== ''
            ? trim($decoded['title'])
            : 'Preparation & Review Record';

        return [
            'enabled' => ($decoded['enabled'] ?? false) === true,
            'title' => $this->signatureSectionTitle($title, $infoLanguage),
            'infoLanguage' => $infoLanguage,
            'labelLanguage' => in_array($decoded['labelLanguage'] ?? null, ['en', 'sc', 'tc'], true)
                ? $decoded['labelLanguage']
                : 'en',
            'labelMode' => in_array($decoded['labelMode'] ?? null, ['confirmation_signature', 'confirmation', 'signature'], true)
                ? $decoded['labelMode']
                : 'confirmation_signature',
            'labelSeparator' => in_array($decoded['labelSeparator'] ?? null, ['none', 'space', 'slash', 'line'], true)
                ? $decoded['labelSeparator']
                : 'space',
            'sectionAlign' => ($decoded['sectionAlign'] ?? null) === 'right' ? 'right' : 'full',
            'labelAlign' => ($decoded['labelAlign'] ?? $decoded['label_align'] ?? null) === 'right' ? 'right' : 'left',
            'showControlText' => ($decoded['showControlText'] ?? $decoded['show_control_text'] ?? true) !== false,
            'rows' => is_array($decoded['rows'] ?? null)
                ? array_values(array_filter(array_map(
                    fn (mixed $row): ?array => is_array($row) ? $this->signatureRow($row) : null,
                    $decoded['rows'],
                )))
                : [],
        ];
    }

    private function signatureRow(array $row): array
    {
        return [
            'id' => is_string($row['id'] ?? null) && trim($row['id']) !== '' ? trim($row['id']) : bin2hex(random_bytes(8)),
            'participantType' => ($row['participantType'] ?? null) === 'workspace_member' ? 'workspace_member' : 'manual',
            'memberUserId' => is_int($row['memberUserId'] ?? null) ? $row['memberUserId'] : null,
            'roleLabel' => is_string($row['roleLabel'] ?? null) ? trim($row['roleLabel']) : '',
            'displayName' => is_string($row['displayName'] ?? null) ? trim($row['displayName']) : '',
            'email' => is_string($row['email'] ?? null) && trim($row['email']) !== '' ? trim($row['email']) : null,
            'position' => is_string($row['position'] ?? null) && trim($row['position']) !== '' ? trim($row['position']) : null,
            'signedAt' => is_string($row['signedAt'] ?? null) && trim($row['signedAt']) !== '' ? trim($row['signedAt']) : null,
            'customFields' => is_array($row['customFields'] ?? $row['custom_fields'] ?? null)
                ? array_values(array_filter(array_map(
                    fn (mixed $field): ?array => is_array($field) ? $this->signatureCustomField($field) : null,
                    $row['customFields'] ?? $row['custom_fields'],
                )))
                : [],
            'showRole' => ($row['showRole'] ?? true) !== false,
            'showName' => ($row['showName'] ?? true) !== false,
            'showEmail' => ($row['showEmail'] ?? false) === true,
            'showPosition' => ($row['showPosition'] ?? false) === true,
            'showSignature' => ($row['showSignature'] ?? true) !== false,
            'showDateTime' => ($row['showDateTime'] ?? true) !== false,
        ];
    }

    private function signatureCustomField(array $field): ?array
    {
        $label = is_string($field['label'] ?? null) ? trim($field['label']) : '';
        $value = is_string($field['value'] ?? null) ? trim($field['value']) : '';
        if ($label === '' && $value === '') {
            return null;
        }

        return [
            'id' => is_string($field['id'] ?? null) && trim($field['id']) !== '' ? trim($field['id']) : bin2hex(random_bytes(8)),
            'label' => $label,
            'value' => $value,
            'show' => ($field['show'] ?? true) !== false,
        ];
    }

    private function signatureSectionTitle(string $title, string $language): string
    {
        $legacyTitles = [
            'Confirmation Signature',
            '签核确认信息',
            '簽核確認資訊',
        ];
        if (!in_array($title, $legacyTitles, true)) {
            return $title;
        }

        return [
            'en' => 'Preparation & Review Record',
            'sc' => '制表及复核记录',
            'tc' => '製表及覆核記錄',
        ][$language] ?? 'Preparation & Review Record';
    }

    private function emptySignatureConfig(): array
    {
        return [
            'enabled' => false,
            'title' => 'Preparation & Review Record',
            'infoLanguage' => 'en',
            'labelLanguage' => 'en',
            'labelMode' => 'confirmation_signature',
            'labelSeparator' => 'space',
            'sectionAlign' => 'full',
            'labelAlign' => 'left',
            'showControlText' => true,
            'rows' => [],
        ];
    }

    private function hasTransactionReferenceColumns(): bool
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'budget_transactions'
              AND column_name IN ('reference_currency_id', 'reference_amount_original')
            SQL
        );
        $statement->execute();

        return (int) $statement->fetchColumn() === 2;
    }
}
