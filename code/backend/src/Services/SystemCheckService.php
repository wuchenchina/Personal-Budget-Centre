<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Support\Env;

final readonly class SystemCheckService
{
    private const REQUIRED_EXTENSIONS = [
        'json',
        'pdo',
        'pdo_mysql',
        'mbstring',
        'dom',
        'xml',
        'xmlwriter',
        'zip',
        'zlib',
        'curl',
        'openssl',
        'fileinfo',
        'gd',
    ];

    public function environment(): array
    {
        $exportStorage = $this->exportStorage();
        $missingExtensions = array_values(array_filter(
            self::REQUIRED_EXTENSIONS,
            static fn (string $extension): bool => !extension_loaded($extension),
        ));
        $recommendations = [];

        if ($missingExtensions !== []) {
            $recommendations[] = 'Enable missing PHP extensions in the hosting panel.';
        }

        if (!$exportStorage['writable']) {
            $recommendations[] = 'Grant write permission to the export storage directory or set EXPORT_STORAGE_DIR.';
        }

        return [
            'phpVersion' => PHP_VERSION,
            'extensions' => array_map(
                static fn (string $extension): array => [
                    'name' => $extension,
                    'loaded' => extension_loaded($extension),
                ],
                self::REQUIRED_EXTENSIONS,
            ),
            'exportStorage' => $exportStorage,
            'ok' => $missingExtensions === [] && $exportStorage['writable'],
            'recommendations' => $recommendations,
        ];
    }

    private function exportStorage(): array
    {
        $path = rtrim(
            Env::string('EXPORT_STORAGE_DIR', dirname(__DIR__, 2) . '/storage/exports')
                ?? dirname(__DIR__, 2) . '/storage/exports',
            '/',
        );
        $parent = dirname($path);

        return [
            'path' => $path,
            'configured' => Env::string('EXPORT_STORAGE_DIR') !== null,
            'exists' => is_dir($path),
            'writable' => is_dir($path) && is_writable($path),
            'parentPath' => $parent,
            'parentWritable' => is_dir($parent) && is_writable($parent),
        ];
    }
}
