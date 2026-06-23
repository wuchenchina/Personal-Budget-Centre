<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class UserRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function findByEmail(string $email): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              username,
              password_hash,
              display_name,
              avatar_url,
              timezone,
              locale,
              default_pdf_theme,
              pdf_export_settings,
              status,
              is_admin,
              email_verified_at
            FROM users
            WHERE email = :email
            LIMIT 1
            SQL
        );
        $statement->execute(['email' => $email]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function findByUsername(string $username): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              username,
              password_hash,
              display_name,
              avatar_url,
              timezone,
              locale,
              default_pdf_theme,
              pdf_export_settings,
              status,
              is_admin,
              email_verified_at
            FROM users
            WHERE username = :username
            LIMIT 1
            SQL
        );
        $statement->execute(['username' => $username]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function findByIdentifier(string $identifier): ?array
    {
        return str_contains($identifier, '@')
            ? $this->findByEmail(strtolower($identifier))
            : $this->findByUsername(strtolower($identifier));
    }

    public function findById(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              username,
              password_hash,
              display_name,
              avatar_url,
              timezone,
              locale,
              default_pdf_theme,
              pdf_export_settings,
              status,
              is_admin,
              email_verified_at
            FROM users
            WHERE id = :id
            LIMIT 1
            SQL
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function findWithPasswordById(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              username,
              password_hash,
              display_name,
              avatar_url,
              timezone,
              locale,
              default_pdf_theme,
              pdf_export_settings,
              status,
              is_admin,
              email_verified_at
            FROM users
            WHERE id = :id
            LIMIT 1
            SQL
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function create(
        string $email,
        string $username,
        string $passwordHash,
        string $displayName,
        ?int $currencyId,
    ): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO users (
              email,
              username,
              password_hash,
              display_name,
              default_currency_id,
              status
            ) VALUES (
              :email,
              :username,
              :password_hash,
              :display_name,
              :default_currency_id,
              'pending'
            )
            SQL
        );
        $statement->execute([
            'email' => $email,
            'username' => $username,
            'password_hash' => $passwordHash,
            'display_name' => $displayName,
            'default_currency_id' => $currencyId,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function createSsoOnly(
        string $email,
        ?string $username,
        string $displayName,
        ?int $currencyId,
        ?string $avatarUrl,
    ): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO users (
              email,
              username,
              password_hash,
              display_name,
              avatar_url,
              default_currency_id,
              status,
              email_verified_at
            ) VALUES (
              :email,
              :username,
              NULL,
              :display_name,
              :avatar_url,
              :default_currency_id,
              'active',
              CURRENT_TIMESTAMP
            )
            SQL
        );
        $statement->execute([
            'email' => $email,
            'username' => $username,
            'display_name' => $displayName,
            'avatar_url' => $avatarUrl,
            'default_currency_id' => $currencyId,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function delete(int $userId): void
    {
        $statement = $this->pdo->prepare('DELETE FROM users WHERE id = :id');
        $statement->execute(['id' => $userId]);
    }

    public function mergeUserData(int $sourceUserId, int $targetUserId): void
    {
        $this->moveSessionsFromSourceWorkspaces($sourceUserId, $targetUserId);
        $this->deleteDuplicateWorkspaceMemberships($sourceUserId, $targetUserId);
        $this->deleteDuplicateWorkgroupMemberships($sourceUserId, $targetUserId);
        $this->deleteDuplicateBudgetShares($sourceUserId, $targetUserId);

        $updates = [
            ['email_verification_tokens', 'user_id'],
            ['user_sessions', 'user_id'],
            ['user_sso_bindings', 'user_id'],
            ['webauthn_credentials', 'user_id'],
            ['webauthn_challenges', 'user_id'],
            ['workspaces', 'owner_user_id'],
            ['workspace_members', 'user_id'],
            ['workspace_invitations', 'invited_by_user_id'],
            ['workgroups', 'created_by_user_id'],
            ['workgroup_members', 'user_id'],
            ['workgroup_members', 'added_by_user_id'],
            ['exchange_rates', 'user_id'],
            ['accounts', 'user_id'],
            ['budget_templates', 'user_id'],
            ['budgets', 'user_id'],
            ['budgets', 'owner_user_id'],
            ['budgets', 'created_by_user_id'],
            ['budget_categories', 'user_id'],
            ['budget_category_aliases', 'user_id'],
            ['budget_shares', 'created_by_user_id'],
            ['budget_shares', 'principal_id', "principal_type = 'user'"],
            ['share_links', 'created_by_user_id'],
            ['budget_participants', 'member_user_id'],
            ['budget_exports', 'user_id'],
            ['import_jobs', 'user_id'],
            ['audit_logs', 'user_id'],
        ];

        foreach ($updates as $update) {
            $this->updateUserReference(
                $update[0],
                $update[1],
                $sourceUserId,
                $targetUserId,
                $update[2] ?? null,
            );
        }
    }

    private function moveSessionsFromSourceWorkspaces(int $sourceUserId, int $targetUserId): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE user_sessions target_session
            INNER JOIN workspaces source_workspace
              ON source_workspace.id = target_session.current_workspace_id
             AND source_workspace.owner_user_id = :source_user_id
            SET target_session.current_workspace_id = (
              SELECT target_workspace.id
              FROM workspaces target_workspace
              WHERE target_workspace.owner_user_id = :target_user_id
              ORDER BY target_workspace.id ASC
              LIMIT 1
            )
            WHERE target_session.user_id = :target_session_user_id
            SQL
        );
        $statement->execute([
            'source_user_id' => $sourceUserId,
            'target_user_id' => $targetUserId,
            'target_session_user_id' => $targetUserId,
        ]);
    }

    private function updateUserReference(
        string $table,
        string $column,
        int $sourceUserId,
        int $targetUserId,
        ?string $extraWhere = null,
    ): void {
        $where = "{$column} = :source_user_id";
        if ($extraWhere !== null) {
            $where .= " AND {$extraWhere}";
        }

        $statement = $this->pdo->prepare(
            "UPDATE {$table} SET {$column} = :target_user_id WHERE {$where}"
        );
        $statement->execute([
            'source_user_id' => $sourceUserId,
            'target_user_id' => $targetUserId,
        ]);
    }

    private function deleteDuplicateWorkspaceMemberships(int $sourceUserId, int $targetUserId): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            DELETE source_member
            FROM workspace_members source_member
            INNER JOIN workspace_members target_member
              ON target_member.workspace_id = source_member.workspace_id
             AND target_member.user_id = :target_user_id
            WHERE source_member.user_id = :source_user_id
            SQL
        );
        $statement->execute([
            'source_user_id' => $sourceUserId,
            'target_user_id' => $targetUserId,
        ]);
    }

    private function deleteDuplicateWorkgroupMemberships(int $sourceUserId, int $targetUserId): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            DELETE source_member
            FROM workgroup_members source_member
            INNER JOIN workgroup_members target_member
              ON target_member.workgroup_id = source_member.workgroup_id
             AND target_member.user_id = :target_user_id
            WHERE source_member.user_id = :source_user_id
            SQL
        );
        $statement->execute([
            'source_user_id' => $sourceUserId,
            'target_user_id' => $targetUserId,
        ]);
    }

    private function deleteDuplicateBudgetShares(int $sourceUserId, int $targetUserId): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            DELETE source_share
            FROM budget_shares source_share
            INNER JOIN budget_shares target_share
              ON target_share.budget_id = source_share.budget_id
             AND target_share.principal_type = 'user'
             AND target_share.principal_id = :target_user_id
            WHERE source_share.principal_type = 'user'
              AND source_share.principal_id = :source_user_id
            SQL
        );
        $statement->execute([
            'source_user_id' => $sourceUserId,
            'target_user_id' => $targetUserId,
        ]);
    }

    public function markEmailVerificationSent(int $userId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE users SET email_verification_sent_at = CURRENT_TIMESTAMP WHERE id = :id'
        );
        $statement->execute(['id' => $userId]);
    }

    public function markEmailVerified(int $userId): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE users
            SET email_verified_at = CURRENT_TIMESTAMP,
                status = 'active'
            WHERE id = :id
            SQL
        );
        $statement->execute(['id' => $userId]);
    }

    public function updateProfile(
        int $userId,
        string $email,
        string $displayName,
        string $defaultPdfTheme,
        ?string $pdfExportSettings,
        bool $emailChanged,
    ): void {
        $emailVerifiedSql = $emailChanged ? 'email_verified_at = NULL,' : '';
        $statement = $this->pdo->prepare(
            <<<SQL
            UPDATE users
            SET email = :email,
                display_name = :display_name,
                default_pdf_theme = :default_pdf_theme,
                pdf_export_settings = :pdf_export_settings,
                {$emailVerifiedSql}
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
            SQL
        );
        $statement->execute([
            'email' => $email,
            'display_name' => $displayName,
            'default_pdf_theme' => $defaultPdfTheme,
            'pdf_export_settings' => $pdfExportSettings,
            'id' => $userId,
        ]);
    }

    public function updatePasswordHash(int $userId, string $passwordHash): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE users
            SET password_hash = :password_hash,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
            SQL
        );
        $statement->execute([
            'password_hash' => $passwordHash,
            'id' => $userId,
        ]);
    }

    public function updateAvatarUrl(int $userId, ?string $avatarUrl): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE users
            SET avatar_url = :avatar_url,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
            SQL
        );
        $statement->execute([
            'avatar_url' => $avatarUrl,
            'id' => $userId,
        ]);
    }

    public function findAdminMailTargetById(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              username,
              display_name,
              status,
              email_verified_at
            FROM users
            WHERE id = :id
            LIMIT 1
            SQL
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }
}
