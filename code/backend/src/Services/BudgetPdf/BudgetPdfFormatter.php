<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

use BudgetCentre\Support\PdfLanguages;
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
            fn (string $line, int $index): string => '<div class="cell-line money-line'
                . ($index > 0 ? ' money-line-secondary' : '')
                . '">' . $this->escapeHtml(trim($line)) . '</div>',
            $lines,
            array_keys($lines),
        ));
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
        $pdfLanguages = $this->signaturePdfLanguages($config);
        if ($pdfLanguages !== null) {
            return $this->joinUnique(array_map(
                fn (string $language): string => $this->signatureLabel($this->signatureConfigForLanguage($config, $language)),
                $pdfLanguages,
            ));
        }

        $language = $this->signatureLanguage($config);
        $primaryLanguage = $this->signaturePrimaryLanguage($language);
        $labels = [
            'en' => ['confirmation' => 'Confirmation', 'signature' => 'Signature'],
            'sc' => ['confirmation' => '确认', 'signature' => '签署'],
            'tc' => ['confirmation' => '確認', 'signature' => '簽署'],
            'ja' => ['confirmation' => '確認', 'signature' => '署名'],
            'fr' => ['confirmation' => 'Confirmation', 'signature' => 'Signature'],
            'ru' => ['confirmation' => 'Подтверждение', 'signature' => 'Подпись'],
            'de' => ['confirmation' => 'Bestaetigung', 'signature' => 'Unterschrift'],
        ][$primaryLanguage];
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
            'slash' => implode(' ', $parts),
            'line' => implode("\n", $parts),
            default => implode(' ', $parts),
        };
    }

    public function signatureSectionTitle(array $config): string
    {
        if (($config['customTitleEnabled'] ?? $config['custom_title_enabled'] ?? false) === true) {
            if (is_string($config['title'] ?? null) && trim($config['title']) !== '') {
                return trim($config['title']);
            }
        }

        $pdfLanguages = $this->signaturePdfLanguages($config);
        if ($pdfLanguages !== null) {
            return $this->joinUnique(array_map(
                fn (string $language): string => $this->defaultSignatureSectionTitle($language),
                $pdfLanguages,
            ));
        }

        return $this->defaultSignatureSectionTitle($this->signatureInfoLanguage($config));
    }

    public function legacySignatureSectionTitle(array $config): string
    {
        return is_string($config['title'] ?? null) && trim($config['title']) !== ''
            ? trim($config['title'])
            : 'Preparation & Review Record';
    }

    private function defaultSignatureSectionTitle(string $language): string
    {
        if ($language === 'en_sc') {
            return 'Preparation & Review Record 制表及复核记录';
        }
        if ($language === 'en_tc') {
            return 'Preparation & Review Record 製表及覆核記錄';
        }

        $legacyTitles = [
            'Confirmation Signature',
            '签核确认信息',
            '簽核確認資訊',
        ];
        unset($legacyTitles);

        return [
            'en' => 'Preparation & Review Record',
            'sc' => '制表及复核记录',
            'tc' => '製表及覆核記錄',
            'ja' => '作成及び確認記録',
            'fr' => 'Dossier de preparation et de revue',
            'ru' => 'Запись подготовки и проверки',
            'de' => 'Erstellungs- und Pruefprotokoll',
        ][$language] ?? 'Preparation & Review Record';
    }

    public function signatureMetaLabel(array $config, string $key): string
    {
        $pdfLanguages = $this->signaturePdfLanguages($config);
        if ($pdfLanguages !== null) {
            return $this->joinUnique(array_map(
                fn (string $language): string => $this->signatureMetaLabel($this->signatureConfigForLanguage($config, $language), $key),
                $pdfLanguages,
            ));
        }

        $labels = [
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
            'ja' => [
                'participant' => '氏名',
                'capacity' => '役割',
                'position' => '職位',
                'email' => 'メール',
                'dateTime' => '日時',
            ],
            'fr' => [
                'participant' => 'Nom',
                'capacity' => 'Qualite',
                'position' => 'Poste',
                'email' => 'E-mail',
                'dateTime' => 'Date et heure',
            ],
            'ru' => [
                'participant' => 'Имя',
                'capacity' => 'Роль',
                'position' => 'Должность',
                'email' => 'Email',
                'dateTime' => 'Дата и время',
            ],
            'de' => [
                'participant' => 'Name',
                'capacity' => 'Funktion',
                'position' => 'Position',
                'email' => 'E-Mail',
                'dateTime' => 'Datum und Uhrzeit',
            ],
        ];
        $language = $this->signatureInfoLanguage($config);
        if ($this->signatureIsBilingual($language)) {
            $chineseLanguage = $this->signatureChineseLanguage($language);
            $chinese = $labels[$chineseLanguage][$key];

            return $labels['en'][$key] . ' ' . $chinese;
        }

        return $labels[$this->signaturePrimaryLanguage($language)][$key];
    }

    public function signatureRoleForDisplay(array $config, string $value): string
    {
        $pdfLanguages = $this->signaturePdfLanguages($config);
        if ($pdfLanguages !== null) {
            return $this->joinUnique(array_map(
                fn (string $language): string => $this->signatureRoleForDisplay($this->signatureConfigForLanguage($config, $language), $value),
                $pdfLanguages,
            ));
        }

        $trimmed = trim($value);
        $language = $this->signatureInfoLanguage($config);
        $primaryLanguage = $this->signaturePrimaryLanguage($language);
        $defaultRole = [
            'en' => 'Confirmed by',
            'sc' => '确认人',
            'tc' => '確認人',
            'ja' => '確認者',
            'fr' => 'Confirme par',
            'ru' => 'Подтвердил',
            'de' => 'Bestaetigt von',
        ][$primaryLanguage];
        unset($defaultRole);
        if ($trimmed === '') {
            return $this->signaturePhraseForLanguage($this->signatureRolePhrases()[6], $language);
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
            return $this->signaturePhraseForLanguage($this->signatureRolePhrases()[6], $language);
        }

        return $this->translateSignaturePhrase($trimmed, $this->signatureRolePhrases(), $language);
    }

    public function signaturePositionForDisplay(array $config, string $value): string
    {
        $pdfLanguages = $this->signaturePdfLanguages($config);
        if ($pdfLanguages !== null) {
            return $this->joinUnique(array_map(
                fn (string $language): string => $this->signaturePositionForDisplay($this->signatureConfigForLanguage($config, $language), $value),
                $pdfLanguages,
            ));
        }

        return $this->translateSignaturePhrase(
            trim($value),
            $this->signaturePositionPhrases(),
            $this->signatureInfoLanguage($config),
        );
    }

    public function signatureCustomFieldLabelForDisplay(array $config, string $value): string
    {
        $pdfLanguages = $this->signaturePdfLanguages($config);
        if ($pdfLanguages !== null) {
            return $this->joinUnique(array_map(
                fn (string $language): string => $this->signatureCustomFieldLabelForDisplay($this->signatureConfigForLanguage($config, $language), $value),
                $pdfLanguages,
            ));
        }

        $trimmed = trim($value);
        $language = $this->signatureInfoLanguage($config);
        foreach ($this->signatureMetaLabels() as $labels) {
            if ($labels['telephone'] === $trimmed) {
                return $this->signatureCustomMetaLabel('telephone', $language);
            }
            if ($labels['mobile'] === $trimmed) {
                return $this->signatureCustomMetaLabel('mobile', $language);
            }
        }

        return $value;
    }

    public function signatureDateTimeForDisplay(string $value): string
    {
        return $this->signatureDateTime($value);
    }

    public function signatureLabelForDisplay(array $config): string
    {
        $pdfLanguages = $this->signaturePdfLanguages($config);
        if ($pdfLanguages !== null) {
            return $this->joinUnique(array_map(
                fn (string $language): string => $this->signatureLabelForDisplay($this->signatureConfigForLanguage($config, $language)),
                $pdfLanguages,
            ));
        }

        $label = $this->signatureLabel($config);
        $language = $this->signatureLanguage($config);
        if (!$this->signatureIsBilingual($language)) {
            return $label;
        }

        $chineseLanguage = $this->signatureChineseLanguage($language);
        $mode = in_array($config['labelMode'] ?? null, ['confirmation_signature', 'confirmation', 'signature'], true)
            ? $config['labelMode']
            : 'confirmation_signature';
        $labels = [
            'sc' => ['confirmation' => '确认', 'signature' => '签署'],
            'tc' => ['confirmation' => '確認', 'signature' => '簽署'],
        ][$chineseLanguage];
        $parts = $mode === 'confirmation_signature'
            ? [$labels['confirmation'], $labels['signature']]
            : [$labels[$mode]];
        $chineseLabel = match ($config['labelSeparator'] ?? null) {
            'none' => implode('', $parts),
            'slash' => implode(' ', $parts),
            'line' => implode("\n", $parts),
            default => implode(' ', $parts),
        };

        return $label . ' ' . $chineseLabel;
    }

    private function signatureLanguage(array $config): string
    {
        return in_array($config['labelLanguage'] ?? null, ['en', 'sc', 'tc', 'ja', 'fr', 'ru', 'de', 'en_sc', 'en_tc'], true)
            ? $config['labelLanguage']
            : 'en';
    }

    private function signaturePdfLanguages(array $config): ?array
    {
        if (!array_key_exists('pdfLanguages', $config) && !array_key_exists('pdf_languages', $config)) {
            return null;
        }

        return PdfLanguages::normalizeList($config['pdfLanguages'] ?? $config['pdf_languages'] ?? null);
    }

    private function signatureConfigForLanguage(array $config, string $language): array
    {
        unset($config['pdfLanguages'], $config['pdf_languages']);
        $config['labelLanguage'] = $language;
        $config['infoLanguage'] = $language;

        return $config;
    }

    private function joinUnique(array $parts): string
    {
        $values = [];
        foreach ($parts as $part) {
            $text = trim((string) $part);
            if ($text === '' || in_array($text, $values, true)) {
                continue;
            }
            $values[] = $text;
        }

        return implode(' ', $values);
    }

    private function signatureInfoLanguage(array $config): string
    {
        if (in_array($config['infoLanguage'] ?? null, ['en', 'sc', 'tc', 'ja', 'fr', 'ru', 'de', 'en_sc', 'en_tc'], true)) {
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
            'ja' => ['telephone' => '電話番号', 'mobile' => '携帯電話番号'],
            'fr' => ['telephone' => 'Telephone', 'mobile' => 'Mobile'],
            'ru' => ['telephone' => 'Телефон', 'mobile' => 'Мобильный'],
            'de' => ['telephone' => 'Telefon', 'mobile' => 'Mobiltelefon'],
        ];
    }

    private function translateSignaturePhrase(string $value, array $phrases, string $language): string
    {
        foreach ($phrases as $phrase) {
            if (in_array($value, $phrase, true)) {
                return $this->signaturePhraseForLanguage($phrase, $language);
            }
        }

        return $value;
    }

    private function signaturePhraseForLanguage(array $phrase, string $language): string
    {
        if ($this->signatureIsBilingual($language)) {
            return $phrase['en'] . ' ' . $phrase[$this->signatureChineseLanguage($language)];
        }

        return $phrase[$this->signaturePrimaryLanguage($language)] ?? $phrase['en'];
    }

    private function signatureCustomMetaLabel(string $key, string $language): string
    {
        $labels = $this->signatureMetaLabels();
        if ($this->signatureIsBilingual($language)) {
            return $labels['en'][$key] . ' ' . $labels[$this->signatureChineseLanguage($language)][$key];
        }

        return $labels[$this->signaturePrimaryLanguage($language)][$key];
    }

    private function signaturePrimaryLanguage(string $language): string
    {
        return $this->signatureIsBilingual($language) ? 'en' : $language;
    }

    private function signatureChineseLanguage(string $language): string
    {
        return $language === 'en_sc' ? 'sc' : 'tc';
    }

    private function signatureIsBilingual(string $language): bool
    {
        return in_array($language, ['en_sc', 'en_tc'], true);
    }

    private function signatureRolePhrases(): array
    {
        return [
            ['en' => 'Prepared by', 'sc' => '制表', 'tc' => '製表', 'ja' => '作成者', 'fr' => 'Prepare par', 'ru' => 'Подготовил', 'de' => 'Erstellt von'],
            ['en' => 'Handled by', 'sc' => '经办', 'tc' => '經辦', 'ja' => '取扱者', 'fr' => 'Traite par', 'ru' => 'Обработал', 'de' => 'Bearbeitet von'],
            ['en' => 'Checked by', 'sc' => '复核', 'tc' => '覆核', 'ja' => '照合者', 'fr' => 'Verifie par', 'ru' => 'Проверил', 'de' => 'Geprueft von'],
            ['en' => 'Reviewed by', 'sc' => '审核', 'tc' => '審核', 'ja' => 'レビュー者', 'fr' => 'Revu par', 'ru' => 'Рассмотрел', 'de' => 'Ueberprueft von'],
            ['en' => 'Approved by', 'sc' => '审批', 'tc' => '審批', 'ja' => '承認者', 'fr' => 'Approuve par', 'ru' => 'Утвердил', 'de' => 'Genehmigt von'],
            ['en' => 'Audited by', 'sc' => '审计', 'tc' => '審計', 'ja' => '監査者', 'fr' => 'Audite par', 'ru' => 'Аудировал', 'de' => 'Revidiert von'],
            [
                'en' => 'Confirmed by',
                'sc' => '确认',
                'tc' => '確認',
                'ja' => '確認者',
                'fr' => 'Confirme par',
                'ru' => 'Подтвердил',
                'de' => 'Bestaetigt von',
            ],
            ['en' => 'Verified by', 'sc' => '核验', 'tc' => '核驗', 'ja' => '検証者', 'fr' => 'Verifie par', 'ru' => 'Проверил', 'de' => 'Verifiziert von'],
            ['en' => 'Authorised by', 'sc' => '授权', 'tc' => '授權', 'ja' => '権限者', 'fr' => 'Autorise par', 'ru' => 'Авторизовал', 'de' => 'Autorisiert von'],
            ['en' => 'Accepted by', 'sc' => '接纳', 'tc' => '接納', 'ja' => '受領者', 'fr' => 'Accepte par', 'ru' => 'Принял', 'de' => 'Akzeptiert von'],
            ['en' => 'Acknowledged by', 'sc' => '知悉确认', 'tc' => '知悉確認', 'ja' => '確認済み', 'fr' => 'Pris connaissance par', 'ru' => 'Ознакомлен', 'de' => 'Zur Kenntnis genommen von'],
            ['en' => 'Reconciled by', 'sc' => '对账', 'tc' => '對賬', 'ja' => '照合者', 'fr' => 'Rapproche par', 'ru' => 'Сверил', 'de' => 'Abgestimmt von'],
            ['en' => 'Documented by', 'sc' => '记录', 'tc' => '記錄', 'ja' => '記録者', 'fr' => 'Documente par', 'ru' => 'Задокументировал', 'de' => 'Dokumentiert von'],
            ['en' => 'Processed by', 'sc' => '处理', 'tc' => '處理', 'ja' => '処理者', 'fr' => 'Traite par', 'ru' => 'Обработал', 'de' => 'Verarbeitet von'],
            ['en' => 'Finance reviewed by', 'sc' => '财务复核', 'tc' => '財務覆核', 'ja' => '財務レビュー', 'fr' => 'Revu par finance', 'ru' => 'Финансовая проверка', 'de' => 'Finanziell geprueft von'],
        ];
    }

    private function signaturePositionPhrases(): array
    {
        return [
            ['en' => 'Account Holder', 'sc' => '账户持有人', 'tc' => '帳戶持有人', 'ja' => '口座名義人', 'fr' => 'Titulaire du compte', 'ru' => 'Владелец счета', 'de' => 'Kontoinhaber'],
            ['en' => 'Budget Owner', 'sc' => '预算负责人', 'tc' => '預算負責人', 'ja' => '予算責任者', 'fr' => 'Responsable budget', 'ru' => 'Владелец бюджета', 'de' => 'Budgetverantwortlicher'],
            ['en' => 'Finance Owner', 'sc' => '财务负责人', 'tc' => '財務負責人', 'ja' => '財務責任者', 'fr' => 'Responsable financier', 'ru' => 'Финансовый владелец', 'de' => 'Finanzverantwortlicher'],
            ['en' => 'Finance Officer', 'sc' => '财务专员', 'tc' => '財務專員', 'ja' => '財務担当者', 'fr' => 'Agent financier', 'ru' => 'Финансовый специалист', 'de' => 'Finanzsachbearbeiter'],
            ['en' => 'Accounts Officer', 'sc' => '会计专员', 'tc' => '會計專員', 'ja' => '会計担当者', 'fr' => 'Agent comptable', 'ru' => 'Бухгалтер', 'de' => 'Buchhaltung'],
            ['en' => 'Relationship Manager', 'sc' => '客户经理', 'tc' => '客戶經理', 'ja' => 'リレーション担当', 'fr' => 'Charge de relation', 'ru' => 'Менеджер по работе', 'de' => 'Kundenbetreuer'],
            ['en' => 'Operations Officer', 'sc' => '运营专员', 'tc' => '營運專員', 'ja' => '業務担当者', 'fr' => 'Agent operations', 'ru' => 'Операционный специалист', 'de' => 'Operations-Sachbearbeiter'],
            ['en' => 'Compliance Reviewer', 'sc' => '合规复核', 'tc' => '合規覆核', 'ja' => 'コンプライアンス審査', 'fr' => 'Controle conformite', 'ru' => 'Проверка комплаенса', 'de' => 'Compliance-Pruefer'],
            ['en' => 'Reviewer', 'sc' => '复核人', 'tc' => '覆核人', 'ja' => 'レビュー担当', 'fr' => 'Relecteur', 'ru' => 'Рецензент', 'de' => 'Pruefer'],
            ['en' => 'Approver', 'sc' => '审批人', 'tc' => '審批人', 'ja' => '承認者', 'fr' => 'Approbateur', 'ru' => 'Утверждающий', 'de' => 'Genehmiger'],
            ['en' => 'Internal Auditor', 'sc' => '内部审计', 'tc' => '內部審計', 'ja' => '内部監査', 'fr' => 'Auditeur interne', 'ru' => 'Внутренний аудитор', 'de' => 'Interner Auditor'],
            ['en' => 'External Auditor', 'sc' => '外部审计', 'tc' => '外部審計', 'ja' => '外部監査', 'fr' => 'Auditeur externe', 'ru' => 'Внешний аудитор', 'de' => 'Externer Auditor'],
            ['en' => 'Authorised Representative', 'sc' => '授权代表', 'tc' => '授權代表', 'ja' => '権限代表者', 'fr' => 'Representant autorise', 'ru' => 'Уполномоченный представитель', 'de' => 'Bevollmaechtigter Vertreter'],
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
