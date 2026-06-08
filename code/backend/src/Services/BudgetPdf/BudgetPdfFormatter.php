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
        $lines = preg_split('/\R/u', $value);
        if ($lines === false || count($lines) <= 1) {
            return $this->escapeHtml($value);
        }

        return implode('', array_map(
            fn (string $line): string => '<div class="cell-line">' . $this->escapeHtml($line) . '</div>',
            $lines,
        ));
    }

    public function templateMoneyCellText(string $value): string
    {
        $lines = preg_split('/\R/u', $value);
        if ($lines === false) {
            return $this->escapeHtml($value);
        }

        return implode('', array_map(
            fn (string $line): string => $this->moneyLineHtml($line),
            $lines,
        ));
    }

    private function moneyLineHtml(string $value): string
    {
        $trimmed = trim($value);
        if ($trimmed === '') {
            return '<div class="cell-line money-line">&nbsp;</div>';
        }

        if (preg_match('/^([A-Z]{3})\s+(.+)$/u', $trimmed, $matches) !== 1) {
            return '<div class="cell-line">' . $this->escapeHtml($trimmed) . '</div>';
        }

        return '<div class="cell-line money-line">'
            . '<span class="money-code">' . $this->escapeHtml($matches[1]) . '</span>'
            . '<span class="money-amount">' . $this->escapeHtml(trim($matches[2])) . '</span>'
            . '</div>';
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
            $amount = 0.0;
        }

        return trim($currency) . ' ' . number_format($amount, 2, '.', '');
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

    public function signatureSectionTitle(array $config): string
    {
        $language = $this->signatureInfoLanguage($config);
        $title = is_string($config['title'] ?? null) && trim($config['title']) !== ''
            ? trim($config['title'])
            : 'Preparation & Review Record';
        $legacyTitles = [
            'Confirmation Signature',
            '签核确认信息',
            '簽核確認資訊',
        ];
        if (in_array($title, $legacyTitles, true)) {
            return [
                'en' => 'Preparation & Review Record',
                'sc' => '制表及复核记录',
                'tc' => '製表及覆核記錄',
            ][$language];
        }

        return $title;
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

        if (in_array($trimmed, $legacyRoleLabels, true) || $trimmed === $this->signatureLabel($config)) {
            return $defaultRole;
        }

        return $this->translateSignaturePhrase($trimmed, $this->signatureRolePhrases(), $language);
    }

    public function signaturePositionForDisplay(array $config, string $value): string
    {
        return $this->translateSignaturePhrase(
            trim($value),
            $this->signaturePositionPhrases(),
            $this->signatureInfoLanguage($config),
        );
    }

    public function signatureCustomFieldLabelForDisplay(array $config, string $value): string
    {
        $trimmed = trim($value);
        $language = $this->signatureInfoLanguage($config);
        foreach ($this->signatureMetaLabels() as $labels) {
            if ($labels['telephone'] === $trimmed) {
                return $this->signatureMetaLabels()[$language]['telephone'];
            }
            if ($labels['mobile'] === $trimmed) {
                return $this->signatureMetaLabels()[$language]['mobile'];
            }
        }

        return $value;
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

    private function signatureMetaLabels(): array
    {
        return [
            'en' => ['telephone' => 'Tel. No.', 'mobile' => 'Mobile No.'],
            'sc' => ['telephone' => '电话号码', 'mobile' => '流动电话号码'],
            'tc' => ['telephone' => '電話號碼', 'mobile' => '流動電話號碼'],
        ];
    }

    private function translateSignaturePhrase(string $value, array $phrases, string $language): string
    {
        foreach ($phrases as $phrase) {
            if ($phrase['en'] === $value || $phrase['sc'] === $value || $phrase['tc'] === $value) {
                return $phrase[$language] ?? $value;
            }
        }

        return $value;
    }

    private function signatureRolePhrases(): array
    {
        return [
            ['en' => 'Prepared by', 'sc' => '制表', 'tc' => '製表'],
            ['en' => 'Handled by', 'sc' => '经办', 'tc' => '經辦'],
            ['en' => 'Checked by', 'sc' => '复核', 'tc' => '覆核'],
            ['en' => 'Reviewed by', 'sc' => '审核', 'tc' => '審核'],
            ['en' => 'Approved by', 'sc' => '审批', 'tc' => '審批'],
            ['en' => 'Audited by', 'sc' => '审计', 'tc' => '審計'],
            ['en' => 'Confirmed by', 'sc' => '确认', 'tc' => '確認'],
            ['en' => 'Verified by', 'sc' => '核验', 'tc' => '核驗'],
            ['en' => 'Authorised by', 'sc' => '授权', 'tc' => '授權'],
            ['en' => 'Accepted by', 'sc' => '接纳', 'tc' => '接納'],
            ['en' => 'Acknowledged by', 'sc' => '知悉确认', 'tc' => '知悉確認'],
            ['en' => 'Reconciled by', 'sc' => '对账', 'tc' => '對賬'],
            ['en' => 'Documented by', 'sc' => '记录', 'tc' => '記錄'],
            ['en' => 'Processed by', 'sc' => '处理', 'tc' => '處理'],
            ['en' => 'Finance reviewed by', 'sc' => '财务复核', 'tc' => '財務覆核'],
        ];
    }

    private function signaturePositionPhrases(): array
    {
        return [
            ['en' => 'Account Holder', 'sc' => '账户持有人', 'tc' => '帳戶持有人'],
            ['en' => 'Budget Owner', 'sc' => '预算负责人', 'tc' => '預算負責人'],
            ['en' => 'Finance Owner', 'sc' => '财务负责人', 'tc' => '財務負責人'],
            ['en' => 'Finance Officer', 'sc' => '财务专员', 'tc' => '財務專員'],
            ['en' => 'Accounts Officer', 'sc' => '会计专员', 'tc' => '會計專員'],
            ['en' => 'Relationship Manager', 'sc' => '客户经理', 'tc' => '客戶經理'],
            ['en' => 'Operations Officer', 'sc' => '运营专员', 'tc' => '營運專員'],
            ['en' => 'Compliance Reviewer', 'sc' => '合规复核', 'tc' => '合規覆核'],
            ['en' => 'Reviewer', 'sc' => '复核人', 'tc' => '覆核人'],
            ['en' => 'Approver', 'sc' => '审批人', 'tc' => '審批人'],
            ['en' => 'Internal Auditor', 'sc' => '内部审计', 'tc' => '內部審計'],
            ['en' => 'External Auditor', 'sc' => '外部审计', 'tc' => '外部審計'],
            ['en' => 'Authorised Representative', 'sc' => '授权代表', 'tc' => '授權代表'],
        ];
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
