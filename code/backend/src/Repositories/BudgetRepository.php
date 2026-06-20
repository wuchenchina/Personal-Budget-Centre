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
        $participantModeSelect = $this->hasBudgetParticipantModeColumn()
            ? 'b.participant_mode,'
            : "'solo' AS participant_mode,";
        $pricingEnabledSelect = $this->hasBudgetPricingEnabledColumn()
            ? 'b.pricing_enabled,'
            : '0 AS pricing_enabled,';
        $budgetTotalsJoin = $this->budgetTotalsJoinSql();
        $statement = $this->pdo->prepare(
            <<<SQL
            SELECT
              b.id,
              b.workspace_id,
              w.name AS workspace_name,
              b.title,
              b.owner_name,
              b.start_date,
              b.end_date,
              b.budget_type,
              {$participantModeSelect}
              b.installment_display_mode,
              b.installment_period_unit,
              {$pricingEnabledSelect}
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
            INNER JOIN workspaces w ON w.id = b.workspace_id
            INNER JOIN currencies base ON base.id = b.base_currency_id
            INNER JOIN currencies display ON display.id = b.display_currency_id
            LEFT JOIN budget_templates bt ON bt.id = b.template_id
            {$budgetTotalsJoin}
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
        string $participantMode,
        string $installmentDisplayMode,
        string $installmentPeriodUnit,
        bool $pricingEnabled,
        string $visibility,
        string $status,
        ?string $note,
        ?string $signatureConfig,
    ): int {
        $participantModeInsertColumn = $this->hasBudgetParticipantModeColumn()
            ? 'participant_mode,'
            : '';
        $participantModeInsertValue = $this->hasBudgetParticipantModeColumn()
            ? ':participant_mode,'
            : '';
        $pricingEnabledInsertColumn = $this->hasBudgetPricingEnabledColumn()
            ? 'pricing_enabled,'
            : '';
        $pricingEnabledInsertValue = $this->hasBudgetPricingEnabledColumn()
            ? ':pricing_enabled,'
            : '';
        $statement = $this->pdo->prepare(
            <<<SQL
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
              {$participantModeInsertColumn}
              installment_display_mode,
              installment_period_unit,
              {$pricingEnabledInsertColumn}
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
              {$participantModeInsertValue}
              :installment_display_mode,
              :installment_period_unit,
              {$pricingEnabledInsertValue}
              :visibility,
              :status,
              :note,
              :signature_config
            )
            SQL
        );
        $payload = [
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
            'installment_display_mode' => $installmentDisplayMode,
            'installment_period_unit' => $installmentPeriodUnit,
            'visibility' => $visibility,
            'status' => $status,
            'note' => $note,
            'signature_config' => $signatureConfig,
        ];
        if ($this->hasBudgetParticipantModeColumn()) {
            $payload['participant_mode'] = $participantMode;
        }
        if ($this->hasBudgetPricingEnabledColumn()) {
            $payload['pricing_enabled'] = $pricingEnabled ? 1 : 0;
        }
        $statement->execute($payload);

        return (int) $this->pdo->lastInsertId();
    }

    public function findForUser(int $budgetId, int $userId, bool $includePrivate): ?array
    {
        $participantModeSelect = $this->hasBudgetParticipantModeColumn()
            ? 'b.participant_mode,'
            : "'solo' AS participant_mode,";
        $pricingEnabledSelect = $this->hasBudgetPricingEnabledColumn()
            ? 'b.pricing_enabled,'
            : '0 AS pricing_enabled,';
        $budgetTotalsJoin = $this->budgetTotalsJoinSql();
        $statement = $this->pdo->prepare(
            <<<SQL
            SELECT
              b.id,
              b.workspace_id,
              w.name AS workspace_name,
              b.title,
              b.owner_name,
              b.start_date,
              b.end_date,
              b.budget_type,
              {$participantModeSelect}
              b.installment_display_mode,
              b.installment_period_unit,
              {$pricingEnabledSelect}
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
            INNER JOIN workspaces w ON w.id = b.workspace_id
            INNER JOIN currencies base ON base.id = b.base_currency_id
            INNER JOIN currencies display ON display.id = b.display_currency_id
            LEFT JOIN budget_templates bt ON bt.id = b.template_id
            {$budgetTotalsJoin}
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
            'participants' => $this->participantsForBudget($budgetId),
            'items' => $this->itemsForBudget(
                $budgetId,
                $this->installmentPeriodUnit($row['installment_period_unit'] ?? null),
            ),
            'overallInstallmentPlan' => $this->overallInstallmentPlanForBudget($budgetId),
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
              b.installment_period_unit,
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
            'installmentPeriodUnit' => $this->installmentPeriodUnit($row['installment_period_unit'] ?? null),
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
        string $participantMode,
        string $installmentDisplayMode,
        string $installmentPeriodUnit,
        bool $pricingEnabled,
        string $visibility,
        string $status,
        ?string $note,
        ?string $signatureConfig,
    ): void {
        $participantModeSet = $this->hasBudgetParticipantModeColumn()
            ? 'participant_mode = :participant_mode,'
            : '';
        $pricingEnabledSet = $this->hasBudgetPricingEnabledColumn()
            ? 'pricing_enabled = :pricing_enabled,'
            : '';
        $statement = $this->pdo->prepare(
            <<<SQL
            UPDATE budgets
            SET
              title = :title,
              owner_name = :owner_name,
              start_date = :start_date,
              end_date = :end_date,
              base_currency_id = :base_currency_id,
              display_currency_id = :display_currency_id,
              budget_type = :budget_type,
              {$participantModeSet}
              installment_display_mode = :installment_display_mode,
              installment_period_unit = :installment_period_unit,
              {$pricingEnabledSet}
              visibility = :visibility,
              status = :status,
              note = :note,
              signature_config = :signature_config
            WHERE id = :budget_id
            SQL
        );
        $payload = [
            'budget_id' => $budgetId,
            'title' => $title,
            'owner_name' => $ownerName,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'base_currency_id' => $baseCurrencyId,
            'display_currency_id' => $displayCurrencyId,
            'budget_type' => $budgetType,
            'installment_display_mode' => $installmentDisplayMode,
            'installment_period_unit' => $installmentPeriodUnit,
            'visibility' => $visibility,
            'status' => $status,
            'note' => $note,
            'signature_config' => $signatureConfig,
        ];
        if ($this->hasBudgetParticipantModeColumn()) {
            $payload['participant_mode'] = $participantMode;
        }
        if ($this->hasBudgetPricingEnabledColumn()) {
            $payload['pricing_enabled'] = $pricingEnabled ? 1 : 0;
        }
        $statement->execute($payload);
    }

    public function delete(int $budgetId): void
    {
        $statement = $this->pdo->prepare('DELETE FROM budgets WHERE id = :budget_id');
        $statement->execute(['budget_id' => $budgetId]);
    }

    public function participantsForBudget(int $budgetId): array
    {
        if (!$this->hasGroupBudgetTables()) {
            return [];
        }

        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              member_user_id,
              name,
              email,
              sort_order,
              created_at,
              updated_at
            FROM budget_participants
            WHERE budget_id = :budget_id
            ORDER BY sort_order ASC, id ASC
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);

        return array_map(
            fn (array $row): array => [
                'id' => (int) $row['id'],
                'memberUserId' => $row['member_user_id'] === null ? null : (int) $row['member_user_id'],
                'name' => $row['name'],
                'email' => $row['email'],
                'sortOrder' => (int) $row['sort_order'],
                'createdAt' => $row['created_at'],
                'updatedAt' => $row['updated_at'],
            ],
            $statement->fetchAll(),
        );
    }

    public function participantIdsForBudget(int $budgetId): array
    {
        return array_map(
            static fn (array $participant): int => (int) $participant['id'],
            $this->participantsForBudget($budgetId),
        );
    }

    public function replaceParticipants(int $budgetId, array $participants): void
    {
        if (!$this->hasGroupBudgetTables()) {
            return;
        }

        $existingIds = $this->participantIdsForBudget($budgetId);
        $existingIdSet = array_fill_keys($existingIds, true);
        $keptIds = [];

        foreach ($participants as $index => $participant) {
            $id = $participant['id'] ?? null;
            $payload = [
                'budget_id' => $budgetId,
                'member_user_id' => $participant['memberUserId'] ?? null,
                'name' => $participant['name'],
                'email' => $participant['email'] ?? null,
                'sort_order' => $participant['sortOrder'] ?? ($index + 1),
            ];

            if (is_int($id) && isset($existingIdSet[$id])) {
                $statement = $this->pdo->prepare(
                    <<<'SQL'
                    UPDATE budget_participants
                    SET
                      member_user_id = :member_user_id,
                      name = :name,
                      email = :email,
                      sort_order = :sort_order
                    WHERE id = :id
                      AND budget_id = :budget_id
                    SQL
                );
                $statement->execute(['id' => $id, ...$payload]);
                $keptIds[] = $id;

                continue;
            }

            $statement = $this->pdo->prepare(
                <<<'SQL'
                INSERT INTO budget_participants (
                  budget_id,
                  member_user_id,
                  name,
                  email,
                  sort_order
                ) VALUES (
                  :budget_id,
                  :member_user_id,
                  :name,
                  :email,
                  :sort_order
                )
                SQL
            );
            $statement->execute($payload);
            $keptIds[] = (int) $this->pdo->lastInsertId();
        }

        $idsToDelete = array_values(array_diff($existingIds, $keptIds));
        if ($idsToDelete === []) {
            return;
        }

        $placeholders = implode(',', array_fill(0, count($idsToDelete), '?'));
        $statement = $this->pdo->prepare(
            "DELETE FROM budget_participants WHERE budget_id = ? AND id IN ({$placeholders})"
        );
        $statement->execute([$budgetId, ...$idsToDelete]);
    }

    private function itemsForBudget(int $budgetId, string $budgetInstallmentPeriodUnit): array
    {
        $pricingConfigSelect = $this->hasBudgetItemPricingConfigColumn()
            ? 'bi.pricing_config,'
            : 'NULL AS pricing_config,';
        $statement = $this->pdo->prepare(
            <<<SQL
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
              {$pricingConfigSelect}
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
        $rows = $statement->fetchAll();
        $splits = $this->itemSplitsForBudget($budgetId);

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
                'installmentConfig' => $this->installmentConfig(
                    $row['installment_config'] ?? null,
                    $budgetInstallmentPeriodUnit,
                ),
                'pricingConfig' => $this->pricingConfig($row['pricing_config'] ?? null),
                'split' => $splits[(int) $row['id']] ?? null,
                'sortOrder' => (int) $row['sort_order'],
            ],
            $rows,
        );
    }

    private function itemSplitsForBudget(int $budgetId): array
    {
        if (!$this->hasGroupBudgetTables()) {
            return [];
        }

        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              bis.id,
              bis.budget_item_id,
              bis.paid_by_participant_id,
              bis.split_type,
              bis.note
            FROM budget_item_splits bis
            INNER JOIN budget_items bi ON bi.id = bis.budget_item_id
            WHERE bi.budget_id = :budget_id
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);
        $splitRows = $statement->fetchAll();
        if ($splitRows === []) {
            return [];
        }

        $splitsById = [];
        $splitsByItem = [];
        foreach ($splitRows as $row) {
            $splitId = (int) $row['id'];
            $split = [
                'id' => $splitId,
                'budgetItemId' => (int) $row['budget_item_id'],
                'paidByParticipantId' => $row['paid_by_participant_id'] === null
                    ? null
                    : (int) $row['paid_by_participant_id'],
                'splitType' => $this->itemSplitType($row['split_type'] ?? null),
                'note' => $row['note'],
                'participants' => [],
            ];
            $splitsById[$splitId] = $split;
            $splitsByItem[(int) $row['budget_item_id']] = $splitId;
        }

        $participantStatement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              bisp.split_id,
              bisp.participant_id,
              bisp.is_included,
              bisp.share_ratio,
              bisp.share_amount_base
            FROM budget_item_split_participants bisp
            INNER JOIN budget_item_splits bis ON bis.id = bisp.split_id
            INNER JOIN budget_items bi ON bi.id = bis.budget_item_id
            WHERE bi.budget_id = :budget_id
            ORDER BY bisp.id ASC
            SQL
        );
        $participantStatement->execute(['budget_id' => $budgetId]);
        foreach ($participantStatement->fetchAll() as $row) {
            $splitId = (int) $row['split_id'];
            if (!isset($splitsById[$splitId])) {
                continue;
            }

            $splitsById[$splitId]['participants'][] = [
                'participantId' => (int) $row['participant_id'],
                'isIncluded' => (int) $row['is_included'] === 1,
                'shareRatio' => $row['share_ratio'] === null ? null : $this->decimal($row['share_ratio']),
                'shareAmountBase' => $row['share_amount_base'] === null
                    ? null
                    : $this->decimal($row['share_amount_base']),
            ];
        }

        $result = [];
        foreach ($splitsByItem as $itemId => $splitId) {
            $result[$itemId] = $splitsById[$splitId];
        }

        return $result;
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
        $paidBySelect = $this->hasTransactionPaidByColumn()
            ? 'bt.paid_by_participant_id,'
            : 'NULL AS paid_by_participant_id,';
        $pricingConfigSelect = $this->hasTransactionPricingConfigColumn()
            ? 'bt.pricing_config,'
            : 'NULL AS pricing_config,';
        $statement = $this->pdo->prepare(
            <<<SQL
            SELECT
              bt.id,
              bt.category_id,
              {$paidBySelect}
              bt.transaction_date,
              bt.details,
              bc.name AS category_name,
              currency.code AS currency,
              bt.amount_original,
              bt.rate_to_base,
              bt.amount_base,
              {$pricingConfigSelect}
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
        $paymentsByTransaction = $this->transactionPaymentsForBudget($budgetId);

        return array_map(
            function (array $row) use ($paymentsByTransaction): array {
                $transactionId = (int) $row['id'];

                return [
                    'id' => $transactionId,
                    'categoryId' => $row['category_id'] === null ? null : (int) $row['category_id'],
                    'paidByParticipantId' => $row['paid_by_participant_id'] === null
                        ? null
                        : (int) $row['paid_by_participant_id'],
                    'payments' => $paymentsByTransaction[$transactionId] ?? [],
                    'category' => $row['category_name'],
                    'transactionDate' => $row['transaction_date'],
                    'details' => $row['details'],
                    'currency' => $row['currency'],
                    'amountOriginal' => $this->decimal($row['amount_original']),
                    'rateToBase' => $this->decimal($row['rate_to_base']),
                    'amountBase' => $this->decimal($row['amount_base']),
                    'pricingConfig' => $this->pricingConfig($row['pricing_config'] ?? null),
                    'referenceCurrency' => $row['reference_currency'],
                    'referenceAmountOriginal' => $row['reference_amount_original'] === null
                        ? null
                        : $this->decimal($row['reference_amount_original']),
                    'remark' => $row['remark'],
                    'sortOrder' => (int) $row['sort_order'],
                ];
            },
            $statement->fetchAll(),
        );
    }

    private function transactionPaymentsForBudget(int $budgetId): array
    {
        if (!$this->hasTransactionPaymentsTable()) {
            return [];
        }

        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              btp.transaction_id,
              btp.participant_id,
              btp.amount_original,
              btp.amount_base
            FROM budget_transaction_payments btp
            INNER JOIN budget_transactions bt ON bt.id = btp.transaction_id
            WHERE bt.budget_id = :budget_id
            ORDER BY btp.id ASC
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);

        $paymentsByTransaction = [];
        foreach ($statement->fetchAll() as $row) {
            $transactionId = (int) $row['transaction_id'];
            $paymentsByTransaction[$transactionId][] = [
                'participantId' => (int) $row['participant_id'],
                'amountOriginal' => $this->decimal($row['amount_original']),
                'amountBase' => $this->decimal($row['amount_base']),
            ];
        }

        return $paymentsByTransaction;
    }

    private function overallInstallmentPlanForBudget(int $budgetId): array
    {
        if (!$this->hasBudgetInstallmentPlanTable()) {
            return $this->emptyOverallInstallmentPlan();
        }

        $periodLockedSelect = $this->hasBudgetInstallmentPlanColumn('period_locked')
            ? 'period_locked,'
            : 'NULL AS period_locked,';
        $statement = $this->pdo->prepare(
            <<<SQL
            SELECT
              period_amounts,
              {$periodLockedSelect}
              period_progress,
              period_remarks,
              updated_at
            FROM budget_installment_plans
            WHERE budget_id = :budget_id
              AND scope = 'overall'
            LIMIT 1
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);
        $row = $statement->fetch();

        if ($row === false) {
            return $this->emptyOverallInstallmentPlan();
        }

        return [
            'periodAmounts' => $this->numberListFromJson($row['period_amounts'] ?? null),
            'periodLocked' => $this->boolListFromJson($row['period_locked'] ?? null),
            'periodProgress' => $this->boolListFromJson($row['period_progress'] ?? null),
            'periodRemarks' => $this->stringListFromJson($row['period_remarks'] ?? null),
            'updatedAt' => $row['updated_at'],
        ];
    }

    private function budgetFromRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'workspaceId' => (int) $row['workspace_id'],
            'workspaceName' => $row['workspace_name'] ?? null,
            'title' => $row['title'],
            'ownerName' => $row['owner_name'],
            'startDate' => $row['start_date'],
            'endDate' => $row['end_date'],
            'baseCurrency' => $row['base_currency'],
            'displayCurrency' => $row['display_currency'],
            'budgetType' => $row['budget_type'] ?? 'regular',
            'participantMode' => $this->participantMode($row['participant_mode'] ?? null),
            'installmentDisplayMode' => $row['installment_display_mode'] ?? 'item',
            'installmentPeriodUnit' => $this->installmentPeriodUnit($row['installment_period_unit'] ?? null),
            'pricingEnabled' => (int) ($row['pricing_enabled'] ?? 0) === 1,
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

    private function installmentPeriodUnit(mixed $value): string
    {
        return in_array($value, ['day', 'week', 'month', 'year'], true) ? (string) $value : 'month';
    }

    private function participantMode(mixed $value): string
    {
        return in_array($value, ['solo', 'group'], true) ? (string) $value : 'solo';
    }

    private function installmentConfig(mixed $value, string $budgetInstallmentPeriodUnit): array
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
        $periodUnit = $this->installmentPeriodUnit($budgetInstallmentPeriodUnit);
        $periodCount = $months === null ? null : $this->installmentPeriodCountFromMonths($months, $periodUnit);

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
            'periodAmounts' => $this->installmentPeriodAmounts($decoded['periodAmounts'] ?? null, $periodCount),
            'periodLocked' => $this->installmentPeriodProgress($decoded['periodLocked'] ?? null, $periodCount),
            'periodProgress' => $this->installmentPeriodProgress($decoded['periodProgress'] ?? null, $periodCount),
            'periodRemarks' => $this->installmentPeriodRemarks($decoded['periodRemarks'] ?? null, $periodCount),
            'versions' => $this->installmentVersions($decoded['versions'] ?? null),
            'startMonth' => is_string($decoded['startMonth'] ?? null) && preg_match('/^\d{4}-\d{2}$/', $decoded['startMonth']) === 1
                ? $decoded['startMonth']
                : null,
            'periodUnit' => $periodUnit,
            'remark' => is_string($decoded['remark'] ?? null) && trim($decoded['remark']) !== ''
                ? trim($decoded['remark'])
                : null,
        ];
    }

    private function pricingConfig(mixed $value): array
    {
        if (!is_string($value) || trim($value) === '') {
            return $this->emptyPricingConfig();
        }

        $decoded = json_decode($value, true);
        if (!is_array($decoded) || ($decoded['enabled'] ?? false) !== true) {
            return $this->emptyPricingConfig();
        }

        $unitPrice = is_numeric($decoded['unitPrice'] ?? null)
            ? max(0.0, (float) $decoded['unitPrice'])
            : null;
        $quantity = is_numeric($decoded['quantity'] ?? null)
            ? max(0.0, (float) $decoded['quantity'])
            : null;
        $totalAmount = is_numeric($decoded['totalAmount'] ?? null)
            ? max(0.0, (float) $decoded['totalAmount'])
            : null;

        if ($unitPrice !== null && $quantity !== null) {
            $totalAmount = round($unitPrice * $quantity, 2);
        }

        return [
            'enabled' => true,
            'unitPrice' => $unitPrice,
            'quantity' => $quantity,
            'totalAmount' => $totalAmount,
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
            'periodAmounts' => [],
            'periodLocked' => [],
            'periodProgress' => [],
            'periodRemarks' => [],
            'versions' => [],
            'startMonth' => null,
            'periodUnit' => 'month',
            'remark' => null,
        ];
    }

    private function emptyPricingConfig(): array
    {
        return [
            'enabled' => false,
            'unitPrice' => null,
            'quantity' => null,
            'totalAmount' => null,
        ];
    }

    private function emptyOverallInstallmentPlan(): array
    {
        return [
            'periodAmounts' => [],
            'periodLocked' => [],
            'periodProgress' => [],
            'periodRemarks' => [],
            'updatedAt' => null,
        ];
    }

    /**
     * @return list<float>
     */
    private function numberListFromJson(mixed $value): array
    {
        $decoded = is_string($value) ? json_decode($value, true) : null;
        if (!is_array($decoded)) {
            return [];
        }

        $numbers = [];
        foreach ($decoded as $item) {
            if (!is_numeric($item) || (float) $item < 0.0) {
                continue;
            }

            $numbers[] = (float) $item;
        }

        return $numbers;
    }

    /**
     * @return list<bool>
     */
    private function boolListFromJson(mixed $value): array
    {
        $decoded = is_string($value) ? json_decode($value, true) : null;
        if (!is_array($decoded)) {
            return [];
        }

        return array_map(static fn (mixed $item): bool => $item === true, $decoded);
    }

    /**
     * @return list<string>
     */
    private function stringListFromJson(mixed $value): array
    {
        $decoded = is_string($value) ? json_decode($value, true) : null;
        if (!is_array($decoded)) {
            return [];
        }

        return array_map(
            static fn (mixed $item): string => is_string($item) ? trim($item) : '',
            $decoded,
        );
    }

    /**
     * @return list<float>
     */
    private function installmentPeriodAmounts(mixed $value, ?int $periodCount): array
    {
        if (!is_array($value) || $periodCount === null) {
            return [];
        }

        $amounts = [];
        foreach (array_slice($value, 0, $periodCount) as $amount) {
            if (!is_numeric($amount) || (float) $amount < 0.0) {
                continue;
            }

            $amounts[] = (float) $amount;
        }

        return $amounts;
    }

    /**
     * @return list<bool>
     */
    private function installmentPeriodProgress(mixed $value, ?int $periodCount): array
    {
        if (!is_array($value) || $periodCount === null) {
            return [];
        }

        return array_map(
            static fn (mixed $item): bool => $item === true,
            array_slice($value, 0, $periodCount),
        );
    }

    /**
     * @return list<string>
     */
    private function installmentPeriodRemarks(mixed $value, ?int $periodCount): array
    {
        if (!is_array($value) || $periodCount === null) {
            return [];
        }

        return array_map(
            static fn (mixed $item): string => is_string($item) ? trim($item) : '',
            array_slice($value, 0, $periodCount),
        );
    }

    /**
     * @return list<array{id: string, createdAt: string, label: string, periodAmounts: list<float>, periodProgress: list<bool>, periodRemarks: list<string>, totalAmount: ?float}>
     */
    private function installmentVersions(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $versions = [];
        foreach ($value as $item) {
            if (!is_array($item)) {
                continue;
            }

            $id = is_string($item['id'] ?? null) && trim($item['id']) !== ''
                ? trim((string) $item['id'])
                : bin2hex(random_bytes(8));
            $createdAt = is_string($item['createdAt'] ?? null) ? (string) $item['createdAt'] : '';
            $label = is_string($item['label'] ?? null) ? trim((string) $item['label']) : '';

            $versions[] = [
                'id' => $id,
                'createdAt' => $createdAt,
                'label' => $label,
                'periodAmounts' => $this->installmentPeriodAmountsWithoutLimit($item['periodAmounts'] ?? null),
                'periodProgress' => $this->installmentPeriodProgressWithoutLimit($item['periodProgress'] ?? null),
                'periodRemarks' => $this->installmentPeriodRemarksWithoutLimit($item['periodRemarks'] ?? null),
                'totalAmount' => is_numeric($item['totalAmount'] ?? null) ? (float) $item['totalAmount'] : null,
            ];
        }

        return array_slice($versions, 0, 25);
    }

    /**
     * @return list<float>
     */
    private function installmentPeriodAmountsWithoutLimit(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $amounts = [];
        foreach ($value as $amount) {
            if (!is_numeric($amount) || (float) $amount < 0.0) {
                continue;
            }

            $amounts[] = (float) $amount;
        }

        return $amounts;
    }

    /**
     * @return list<bool>
     */
    private function installmentPeriodProgressWithoutLimit(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        return array_map(static fn (mixed $item): bool => $item === true, $value);
    }

    /**
     * @return list<string>
     */
    private function installmentPeriodRemarksWithoutLimit(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        return array_map(static fn (mixed $item): string => is_string($item) ? trim($item) : '', $value);
    }

    private function installmentPeriodCountFromMonths(int $months, string $periodUnit): int
    {
        return max(1, (int) ceil(match ($periodUnit) {
            'day' => $months * (365 / 12),
            'week' => $months * (52 / 12),
            'year' => $months / 12,
            default => $months,
        }));
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
        return $this->cachedSchemaCapability(__FUNCTION__, function (): bool {
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
        });
    }

    private function hasTransactionPaidByColumn(): bool
    {
        return $this->cachedSchemaCapability(__FUNCTION__, function (): bool {
            $statement = $this->pdo->prepare(
                <<<'SQL'
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'budget_transactions'
                  AND column_name = 'paid_by_participant_id'
                SQL
            );
            $statement->execute();

            return (int) $statement->fetchColumn() === 1;
        });
    }

    private function hasTransactionPaymentsTable(): bool
    {
        return $this->cachedSchemaCapability(__FUNCTION__, function (): bool {
            $statement = $this->pdo->prepare(
                <<<'SQL'
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name = 'budget_transaction_payments'
                SQL
            );
            $statement->execute();

            return (int) $statement->fetchColumn() === 1;
        });
    }

    private function hasBudgetInstallmentPlanTable(): bool
    {
        return $this->cachedSchemaCapability(__FUNCTION__, function (): bool {
            $statement = $this->pdo->prepare(
                <<<'SQL'
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name = 'budget_installment_plans'
                SQL
            );
            $statement->execute();

            return (int) $statement->fetchColumn() === 1;
        });
    }

    private function hasBudgetInstallmentPlanColumn(string $column): bool
    {
        return $this->cachedSchemaCapability(__FUNCTION__ . ':' . $column, function () use ($column): bool {
            $statement = $this->pdo->prepare(
                <<<'SQL'
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'budget_installment_plans'
                  AND column_name = :column
                SQL
            );
            $statement->execute(['column' => $column]);

            return (int) $statement->fetchColumn() === 1;
        });
    }

    private function hasBudgetParticipantModeColumn(): bool
    {
        return $this->cachedSchemaCapability(__FUNCTION__, function (): bool {
            $statement = $this->pdo->prepare(
                <<<'SQL'
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'budgets'
                  AND column_name = 'participant_mode'
                SQL
            );
            $statement->execute();

            return (int) $statement->fetchColumn() === 1;
        });
    }

    private function hasBudgetPricingEnabledColumn(): bool
    {
        return $this->cachedSchemaCapability(__FUNCTION__, function (): bool {
            $statement = $this->pdo->prepare(
                <<<'SQL'
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'budgets'
                  AND column_name = 'pricing_enabled'
                SQL
            );
            $statement->execute();

            return (int) $statement->fetchColumn() === 1;
        });
    }

    private function hasBudgetItemPricingConfigColumn(): bool
    {
        return $this->cachedSchemaCapability(__FUNCTION__, function (): bool {
            $statement = $this->pdo->prepare(
                <<<'SQL'
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'budget_items'
                  AND column_name = 'pricing_config'
                SQL
            );
            $statement->execute();

            return (int) $statement->fetchColumn() === 1;
        });
    }

    private function hasTransactionPricingConfigColumn(): bool
    {
        return $this->cachedSchemaCapability(__FUNCTION__, function (): bool {
            $statement = $this->pdo->prepare(
                <<<'SQL'
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'budget_transactions'
                  AND column_name = 'pricing_config'
                SQL
            );
            $statement->execute();

            return (int) $statement->fetchColumn() === 1;
        });
    }

    private function hasGroupBudgetTables(): bool
    {
        return $this->cachedSchemaCapability(__FUNCTION__, function (): bool {
            $statement = $this->pdo->prepare(
                <<<'SQL'
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name IN (
                    'budget_participants',
                    'budget_item_splits',
                    'budget_item_split_participants'
                  )
                SQL
            );
            $statement->execute();

            return (int) $statement->fetchColumn() === 3;
        });
    }

    private function cachedSchemaCapability(string $key, callable $resolver): bool
    {
        /** @var array<string, bool> $cache */
        static $cache = [];

        if (!array_key_exists($key, $cache)) {
            $cache[$key] = (bool) $resolver();
        }

        return $cache[$key];
    }

    private function budgetTotalsJoinSql(): string
    {
        if (!$this->hasGroupBudgetTables()) {
            return <<<'SQL'
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
            SQL;
        }

        return <<<'SQL'
            LEFT JOIN (
              SELECT
                bi.budget_id,
                SUM(
                  CASE
                    WHEN bi.budget_amount_original = 0 AND bi.budget_amount_base = 0 AND (
                      COALESCE(txc.transaction_total_base, 0) * CASE
                        WHEN bis.split_type = 'per_person'
                          THEN COALESCE(NULLIF(split_participants.included_count, 0), 1)
                        ELSE 1
                      END
                    ) <> 0
                      THEN COALESCE(txc.transaction_total_base, 0) * CASE
                        WHEN bis.split_type = 'per_person'
                          THEN COALESCE(NULLIF(split_participants.included_count, 0), 1)
                        ELSE 1
                      END
                    ELSE bi.budget_amount_base * CASE
                      WHEN bis.split_type = 'per_person'
                        THEN COALESCE(NULLIF(split_participants.included_count, 0), 1)
                      ELSE 1
                    END
                  END
                ) AS total_budget_base,
                SUM(
                  COALESCE(txc.transaction_total_base, 0) * CASE
                    WHEN bis.split_type = 'per_person'
                      THEN COALESCE(NULLIF(split_participants.included_count, 0), 1)
                    ELSE 1
                  END
                ) AS total_estimated_base,
                SUM(
                  CASE
                    WHEN bi.budget_amount_original = 0 AND bi.budget_amount_base = 0 AND (
                      COALESCE(txc.transaction_total_base, 0) * CASE
                        WHEN bis.split_type = 'per_person'
                          THEN COALESCE(NULLIF(split_participants.included_count, 0), 1)
                        ELSE 1
                      END
                    ) <> 0
                      THEN COALESCE(txc.transaction_total_base, 0) * CASE
                        WHEN bis.split_type = 'per_person'
                          THEN COALESCE(NULLIF(split_participants.included_count, 0), 1)
                        ELSE 1
                      END
                    ELSE bi.budget_amount_base * CASE
                      WHEN bis.split_type = 'per_person'
                        THEN COALESCE(NULLIF(split_participants.included_count, 0), 1)
                      ELSE 1
                    END
                  END - COALESCE(txc.transaction_total_base, 0) * CASE
                    WHEN bis.split_type = 'per_person'
                      THEN COALESCE(NULLIF(split_participants.included_count, 0), 1)
                    ELSE 1
                  END
                ) AS total_variance_base
              FROM budget_items bi
              LEFT JOIN budget_item_splits bis ON bis.budget_item_id = bi.id
              LEFT JOIN (
                SELECT
                  split_id,
                  COUNT(*) AS included_count
                FROM budget_item_split_participants
                WHERE is_included = 1
                GROUP BY split_id
              ) split_participants ON split_participants.split_id = bis.id
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
            SQL;
    }

    private function itemSplitType(mixed $value): string
    {
        return in_array($value, ['equal', 'personal', 'individual', 'per_person', 'custom_amount', 'custom_share', 'excluded'], true)
            ? (string) $value
            : 'equal';
    }
}
