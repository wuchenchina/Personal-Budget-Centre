<?php

declare(strict_types=1);

namespace BudgetCentre\Services\ExchangeRates;

use BudgetCentre\Auth\AuthException;
use DateTimeImmutable;
use DOMDocument;
use DOMElement;
use DOMXPath;

final readonly class BochkExchangeRateProvider
{
    public const SOURCE = 'bochk';
    public const SOURCE_NAME = 'Bank of China (Hong Kong) Limited';
    public const SOURCE_URL = 'https://www.bochk.com/whk/rates/exchangeRatesHKD/exchangeRatesHKD-input.action?lang=hk';

    private const CURRENCY_MAP = [
        '人民幣(在岸)' => 'CNY',
        '人民幣(離岸)' => 'CNH',
        '美元' => 'USD',
        '英鎊' => 'GBP',
        '日圓' => 'JPY',
        '澳元' => 'AUD',
        '紐元' => 'NZD',
        '加元' => 'CAD',
        '歐羅' => 'EUR',
        '瑞士法郎' => 'CHF',
        '丹麥克郎' => 'DKK',
        '挪威克郎' => 'NOK',
        '瑞典克郎' => 'SEK',
        '新加坡元' => 'SGD',
        '泰國銖' => 'THB',
        '文萊元' => 'BND',
        '南非蘭特' => 'ZAR',
    ];

    public function fetch(): array
    {
        $html = $this->fetchHtml();
        $document = $this->document($html);
        $xpath = new DOMXPath($document);
        $updatedAt = $this->updatedAt($document);
        $rates = [];

        foreach ($xpath->query('//tr') ?: [] as $row) {
            if (!$row instanceof DOMElement) {
                continue;
            }

            $cells = $this->cells($row);
            if (count($cells) !== 3 || $cells[0] === '貨幣') {
                continue;
            }

            $currencyCode = self::CURRENCY_MAP[$cells[0]] ?? null;
            $customerSell = $this->number($cells[1]);
            $customerBuy = $this->number($cells[2]);
            if ($currencyCode === null || $customerSell === null || $customerBuy === null) {
                continue;
            }

            $rates[] = [
                'currencyCode' => $currencyCode,
                'label' => $cells[0],
                'customerSell' => $customerSell,
                'customerBuy' => $customerBuy,
            ];
        }

        if ($rates === []) {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_EMPTY',
                'BOCHK exchange rate table could not be parsed.',
                502,
            );
        }

        return [
            'source' => self::SOURCE,
            'sourceName' => self::SOURCE_NAME,
            'sourceUrl' => self::SOURCE_URL,
            'baseCurrency' => 'HKD',
            'providerUpdatedAt' => $updatedAt,
            'rateDate' => substr($updatedAt, 0, 10),
            'fetchedAt' => (new DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
            'rates' => $rates,
        ];
    }

    private function fetchHtml(): string
    {
        $context = stream_context_create([
            'http' => [
                'timeout' => 12,
                'header' => "User-Agent: BudgetCentre/1.0\r\nAccept: text/html\r\n",
            ],
        ]);
        $html = @file_get_contents(self::SOURCE_URL, false, $context);
        if (!is_string($html) || trim($html) === '') {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_FAILED',
                'BOCHK exchange rate endpoint is unavailable.',
                502,
            );
        }

        return $html;
    }

    private function document(string $html): DOMDocument
    {
        $document = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $document->loadHTML('<?xml encoding="utf-8" ?>' . $html);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        return $document;
    }

    private function updatedAt(DOMDocument $document): string
    {
        $text = trim($document->textContent);
        if (!preg_match('/資料更新於香港時間：\s*([0-9]{4})\/([0-9]{2})\/([0-9]{2})\s+([0-9]{2}:[0-9]{2}:[0-9]{2})/u', $text, $matches)) {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_INVALID',
                'BOCHK exchange rate update time is missing.',
                502,
            );
        }

        return "{$matches[1]}-{$matches[2]}-{$matches[3]} {$matches[4]}";
    }

    private function cells(DOMElement $row): array
    {
        $cells = [];
        foreach ($row->childNodes as $cell) {
            if (!$cell instanceof DOMElement || !in_array(strtolower($cell->tagName), ['td', 'th'], true)) {
                continue;
            }

            $cells[] = trim(preg_replace('/\s+/u', ' ', $cell->textContent) ?? '');
        }

        return array_values(array_filter($cells, static fn (string $cell): bool => $cell !== ''));
    }

    private function number(string $value): ?float
    {
        $normalized = str_replace(',', '', trim($value));

        return is_numeric($normalized) ? (float) $normalized : null;
    }
}
