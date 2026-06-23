<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class BudgetTemplateRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function findByKey(string $templateKey): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              name,
              template_key,
              style_json,
              structure_json
            FROM budget_templates
            WHERE template_key = :template_key
              AND scope_key = 'global'
              AND workspace_id IS NULL
            LIMIT 1
            SQL
        );
        $statement->execute(['template_key' => $templateKey]);
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        $style = json_decode((string) $row['style_json'], true, flags: JSON_THROW_ON_ERROR);
        $structure = json_decode((string) $row['structure_json'], true, flags: JSON_THROW_ON_ERROR);

        return [
            'key' => $row['template_key'],
            'name' => $row['name'],
            'titleTemplate' => $structure['titleTemplate'] ?? '',
            'subtitleTemplate' => $structure['subtitleTemplate'] ?? '',
            'sections' => $structure['sections'] ?? [],
            'style' => $style,
        ];
    }

    public function findGlobalIdByKey(string $templateKey): ?int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT id
            FROM budget_templates
            WHERE template_key = :template_key
              AND scope_key = 'global'
              AND workspace_id IS NULL
            LIMIT 1
            SQL
        );
        $statement->execute(['template_key' => $templateKey]);
        $templateId = $statement->fetchColumn();

        return $templateId === false ? null : (int) $templateId;
    }
}
