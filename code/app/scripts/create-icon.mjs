import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, '..');
const sourceIcon = resolve(appDirectory, '../frontend/public/favicon.png');
const buildDirectory = join(appDirectory, 'build');
const iconSetDirectory = join(buildDirectory, 'BudgetCentre.iconset');
const targetIcon = join(buildDirectory, 'icon.icns');

const iconVariants = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });

  if (result.status !== 0) {
    throw new Error(`${command} failed while creating the BudgetCentre icon.`);
  }
}

if (!existsSync(sourceIcon)) {
  throw new Error(`Missing source icon: ${sourceIcon}`);
}

mkdirSync(buildDirectory, { recursive: true });
rmSync(iconSetDirectory, { recursive: true, force: true });
rmSync(targetIcon, { force: true });
mkdirSync(iconSetDirectory, { recursive: true });

for (const [filename, size] of iconVariants) {
  run('sips', ['-z', String(size), String(size), sourceIcon, '--out', join(iconSetDirectory, filename)]);
}

run('iconutil', ['-c', 'icns', iconSetDirectory, '-o', targetIcon]);
rmSync(iconSetDirectory, { recursive: true, force: true });
