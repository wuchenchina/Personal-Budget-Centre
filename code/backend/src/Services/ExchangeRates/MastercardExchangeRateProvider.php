<?php

declare(strict_types=1);

namespace BudgetCentre\Services\ExchangeRates;

use BudgetCentre\Auth\AuthException;
use JsonException;

final readonly class MastercardExchangeRateProvider
{
    public const SOURCE = 'mastercard';
    public const SOURCE_NAME = 'Mastercard International Incorporated';
    public const CONVERTER_URL = 'https://www.mastercard.com/sg/en/personal/get-support/currency-exchange-rate-converter.html';
    private const CURRENCIES_URL = 'https://www.mastercard.com/marketingservices/public/mccom-services/currency-conversions/currencies';
    private const RATES_URL = 'https://www.mastercard.com/marketingservices/public/mccom-services/currency-conversions/conversion-rates';

    public function supportedCurrencies(): array
    {
        $payload = $this->jsonGet(self::CURRENCIES_URL);
        $currencies = $payload['data']['currencies'] ?? null;
        if (!is_array($currencies)) {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_INVALID',
                'Mastercard currency list could not be parsed.',
                502,
            );
        }

        $codes = [];
        foreach ($currencies as $currency) {
            if (is_array($currency) && isset($currency['alphaCd']) && is_string($currency['alphaCd'])) {
                $codes[] = strtoupper($currency['alphaCd']);
            }
        }

        return array_values(array_unique($codes));
    }

    public function quote(
        string $transactionCurrency,
        string $billingCurrency,
        string $exchangeDate,
        float $bankFee = 0.0,
        float $transactionAmount = 1.0,
    ): ?array {
        $url = $this->rateUrl(
            $transactionCurrency,
            $billingCurrency,
            $exchangeDate,
            $bankFee,
            $transactionAmount,
        );
        $payload = $this->jsonGet($url, allowProviderError: true);
        $data = $payload['data'] ?? null;
        if (!is_array($data)) {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_INVALID',
                'Mastercard exchange rate response could not be parsed.',
                502,
            );
        }

        if (isset($data['errorCode']) || isset($data['errorMessage'])) {
            return null;
        }

        if (!isset($data['conversionRate'], $data['fxDate']) || !is_numeric($data['conversionRate'])) {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_INVALID',
                'Mastercard exchange rate response is missing conversionRate.',
                502,
            );
        }

        return [
            'source' => self::SOURCE,
            'sourceName' => self::SOURCE_NAME,
            'sourceUrl' => $url,
            'converterUrl' => self::CONVERTER_URL,
            'fromCurrency' => strtoupper($transactionCurrency),
            'toCurrency' => strtoupper($billingCurrency),
            'rate' => (float) $data['conversionRate'],
            'rateDate' => (string) $data['fxDate'],
            'bankFee' => $bankFee,
            'transactionAmount' => $transactionAmount,
            'convertedAmount' => isset($data['crdhldBillAmt']) && is_numeric($data['crdhldBillAmt'])
                ? (float) $data['crdhldBillAmt']
                : null,
            'fetchedAt' => date('Y-m-d H:i:s'),
        ];
    }

    private function rateUrl(
        string $transactionCurrency,
        string $billingCurrency,
        string $exchangeDate,
        float $bankFee,
        float $transactionAmount,
    ): string {
        return self::RATES_URL . '?' . http_build_query([
            'exchange_date' => $exchangeDate,
            'transaction_currency' => strtoupper($transactionCurrency),
            'cardholder_billing_currency' => strtoupper($billingCurrency),
            'bank_fee' => $this->numberString($bankFee),
            'transaction_amount' => $this->numberString($transactionAmount),
        ]);
    }

    private function jsonGet(string $url, bool $allowProviderError = false): array
    {
        $context = stream_context_create([
            'http' => [
                'timeout' => 12,
                'ignore_errors' => true,
                'header' => "User-Agent: BudgetCentre/1.0\r\nAccept: application/json\r\n",
            ],
        ]);
        $body = @file_get_contents($url, false, $context);
        if (!is_string($body) || trim($body) === '') {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_FAILED',
                'Mastercard exchange rate endpoint is unavailable.',
                502,
            );
        }

        try {
            $payload = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_INVALID',
                'Mastercard exchange rate response is not valid JSON.',
                502,
            );
        }

        if (!is_array($payload)) {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_INVALID',
                'Mastercard exchange rate response could not be parsed.',
                502,
            );
        }

        if (!$allowProviderError && isset($payload['data']['errorMessage'])) {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_FAILED',
                (string) $payload['data']['errorMessage'],
                502,
            );
        }

        return $payload;
    }

    private function numberString(float $value): string
    {
        $formatted = rtrim(rtrim(number_format($value, 6, '.', ''), '0'), '.');

        return $formatted === '' ? '0' : $formatted;
    }
}
