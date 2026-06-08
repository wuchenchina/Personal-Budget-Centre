<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

use DateTimeImmutable;

final readonly class BudgetPdfFormatter
{
    public function escapeHtml(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    public function templateCellText(string $value): string
    {
        return nl2br($this->escapeHtml($value), false);
    }

    public function periodText(array $budget): string
    {
        $start = $this->parseDate((string) $budget['startDate']);
        $end = $this->parseDate((string) $budget['endDate']);
        if ($start === null && $end === null) {
            return '';
        }

        return ($start === null ? (string) $budget['startDate'] : $this->periodDate($start))
            . ' to '
            . ($end === null ? (string) $budget['endDate'] : $this->periodDate($end));
    }

    public function templateMoney(string $currency, float $amount, bool $trimWhole = false): string
    {
        if (abs($amount) < 0.005) {
            return $currency . '0';
        }

        if ($trimWhole && abs($amount - round($amount)) < 0.005) {
            return $currency . (string) (int) round($amount);
        }

        return $currency . number_format($amount, 2, '.', '');
    }

    public function signatureLabel(array $config): string
    {
        $language = $this->signatureLanguage($config);
        $labels = [
            'en' => ['confirmation' => 'Confirmation', 'signature' => 'Signature'],
            'sc' => ['confirmation' => '确认', 'signature' => '签署'],
            'tc' => ['confirmation' => '確認', 'signature' => '簽署'],
        ][$language];
        $mode = in_array($config['labelMode'] ?? null, ['confirmation_signature', 'confirmation', 'signature'], true)
            ? $config['labelMode']
            : 'confirmation_signature';
        $parts = $mode === 'confirmation_signature'
            ? [$labels['confirmation'], $labels['signature']]
            : [$labels[$mode]];

        if (count($parts) === 1) {
            return $parts[0];
        }

        return match ($config['labelSeparator'] ?? null) {
            'none' => implode('', $parts),
            'slash' => implode(' / ', $parts),
            'line' => implode("\n", $parts),
            default => implode(' ', $parts),
        };
    }

    public function signatureMetaLabel(array $config, string $key): string
    {
        return [
            'en' => [
                'participant' => 'Name',
                'capacity' => 'Capacity',
                'position' => 'Position',
                'email' => 'Email',
                'dateTime' => 'Date & Time',
            ],
            'sc' => [
                'participant' => '姓名',
                'capacity' => '身份',
                'position' => '职务',
                'email' => '电子邮件',
                'dateTime' => '日期及时间',
            ],
            'tc' => [
                'participant' => '姓名',
                'capacity' => '身份',
                'position' => '職務',
                'email' => '電子郵件',
                'dateTime' => '日期及時間',
            ],
        ][$this->signatureInfoLanguage($config)][$key];
    }

    public function signatureRoleForDisplay(array $config, string $value): string
    {
        $trimmed = trim($value);
        $language = $this->signatureInfoLanguage($config);
        $defaultRole = [
            'en' => 'Confirmed by',
            'sc' => '确认人',
            'tc' => '確認人',
        ][$language];
        if ($trimmed === '') {
            return $defaultRole;
        }

        $legacyRoleLabels = [
            'Confirmation Signature',
            'Confirmation / Signature',
            'Participant',
            'Signer / Confirmer',
            '确认签署',
            '确认 / 签署',
            '签核/确认人',
            '確認簽署',
            '確認 / 簽署',
            '簽核/確認人',
        ];

        return in_array($trimmed, $legacyRoleLabels, true) || $trimmed === $this->signatureLabel($config)
            ? $defaultRole
            : $trimmed;
    }

    public function signatureDateTimeForDisplay(string $value): string
    {
        return $this->signatureDateTime($value);
    }

    private function signatureLanguage(array $config): string
    {
        return in_array($config['labelLanguage'] ?? null, ['en', 'sc', 'tc'], true)
            ? $config['labelLanguage']
            : 'en';
    }

    private function signatureInfoLanguage(array $config): string
    {
        if (in_array($config['infoLanguage'] ?? null, ['en', 'sc', 'tc'], true)) {
            return $config['infoLanguage'];
        }

        return $this->signatureLanguage($config);
    }

    private function signatureDateTime(string $value): string
    {
        $trimmed = trim($value);

        return $trimmed === '' ? date('Y-m-d H:i:s') : $trimmed;
    }

    private function periodDate(DateTimeImmutable $date): string
    {
        return $date->format('j F, Y');
    }

    private function parseDate(string $date): ?DateTimeImmutable
    {
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);

        return $parsed === false ? null : $parsed;
    }
}
