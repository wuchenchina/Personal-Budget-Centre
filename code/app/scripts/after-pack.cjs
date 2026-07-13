const { existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const keysToRemove = [
  'NSAppTransportSecurity',
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
];

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');

  if (!existsSync(infoPlistPath)) {
    throw new Error(`Missing macOS app metadata: ${infoPlistPath}`);
  }

  for (const key of keysToRemove) {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Delete :${key}`, infoPlistPath], {
      stdio: 'inherit',
    });
  }
};
