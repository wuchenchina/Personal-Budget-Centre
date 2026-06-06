<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Support\Env;
use RuntimeException;

final class SmtpMailer
{
    public function send(string $to, string $subject, string $body): void
    {
        $host = Env::string('SMTP_HOST');
        $port = Env::int('SMTP_PORT', 465);
        $username = Env::string('SMTP_USERNAME');
        $password = Env::string('SMTP_PASSWORD');
        $from = Env::string('MAIL_FROM', $username);
        $fromName = Env::string('MAIL_FROM_NAME', 'BudgetCentre');

        if ($host === null || $username === null || $password === null || $from === null) {
            throw new RuntimeException('SMTP is not configured.');
        }

        $socket = stream_socket_client(
            "ssl://{$host}:{$port}",
            $errno,
            $error,
            15,
        );

        if ($socket === false) {
            throw new RuntimeException("SMTP connection failed: {$error}", $errno);
        }

        try {
            $this->expect($socket, 220);
            $this->command($socket, 'EHLO budgetcentre.local', 250);
            $this->command($socket, 'AUTH LOGIN', 334);
            $this->command($socket, base64_encode($username), 334);
            $this->command($socket, base64_encode($password), 235);
            $this->command($socket, "MAIL FROM:<{$from}>", 250);
            $this->command($socket, "RCPT TO:<{$to}>", [250, 251]);
            $this->command($socket, 'DATA', 354);

            $headers = [
                'From: ' . $this->formatAddress($from, $fromName),
                "To: <{$to}>",
                'Subject: ' . $this->encodeHeader($subject),
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
            ];
            fwrite($socket, implode("\r\n", $headers) . "\r\n\r\n" . $this->escapeBody($body) . "\r\n.");
            fwrite($socket, "\r\n");
            $this->expect($socket, 250);
            $this->command($socket, 'QUIT', 221);
        } finally {
            fclose($socket);
        }
    }

    /**
     * @param resource $socket
     * @param int|array<int> $expected
     */
    private function command(mixed $socket, string $command, int|array $expected): void
    {
        fwrite($socket, $command . "\r\n");
        $this->expect($socket, $expected);
    }

    /**
     * @param resource $socket
     * @param int|array<int> $expected
     */
    private function expect(mixed $socket, int|array $expected): void
    {
        $expectedCodes = is_array($expected) ? $expected : [$expected];
        $response = '';

        do {
            $line = fgets($socket);
            if ($line === false) {
                throw new RuntimeException('SMTP server closed the connection.');
            }
            $response .= $line;
        } while (isset($line[3]) && $line[3] === '-');

        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $expectedCodes, true)) {
            throw new RuntimeException("SMTP command failed: {$response}");
        }
    }

    private function formatAddress(string $email, string $name): string
    {
        return $this->encodeHeader($name) . " <{$email}>";
    }

    private function encodeHeader(string $value): string
    {
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }

    private function escapeBody(string $body): string
    {
        return preg_replace('/^\./m', '..', $body) ?? $body;
    }
}
