import {
  app,
  BrowserWindow,
  Menu,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type Event,
  type WebContents,
} from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  isRemoteAppUrl,
  isTrustedInAppUrl,
  navigationTarget,
  remoteAppOrigin,
  sanitizeDownloadFilename,
} from './url-policy';

const sessionPartition = 'persist:budgetcentre';
const startupUrl = `${remoteAppOrigin}/`;

let mainWindow: BrowserWindow | null = null;
const configuredWebContents = new WeakSet<WebContents>();

function appWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: '#ffffff',
    title: 'BudgetCentre',
    webPreferences: {
      contextIsolation: true,
      devTools: !app.isPackaged,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      partition: sessionPartition,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  };
}

function openInSystemBrowser(url: string): void {
  if (navigationTarget(url) !== 'system-browser') {
    return;
  }

  void shell.openExternal(url).catch(() => undefined);
}

function guardNavigation(event: Event, url: string): void {
  if (isTrustedInAppUrl(url)) {
    return;
  }

  event.preventDefault();
  openInSystemBrowser(url);
}

function configureWebContents(webContents: WebContents): void {
  if (configuredWebContents.has(webContents)) {
    return;
  }

  configuredWebContents.add(webContents);

  webContents.setWindowOpenHandler(({ url }) => {
    if (isRemoteAppUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: appWindowOptions(),
      };
    }

    openInSystemBrowser(url);
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    guardNavigation(event, url);
  });

  webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
    if (isMainFrame) {
      guardNavigation(event, url);
    }
  });

  webContents.on('did-create-window', (childWindow) => {
    configureWindow(childWindow);
  });
}

function configureWindow(window: BrowserWindow): void {
  configureWebContents(window.webContents);

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.once('did-fail-load', () => {
    window.show();
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow(appWindowOptions());

  mainWindow = window;
  configureWindow(window);

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  void window.loadURL(startupUrl).catch(() => undefined);
  return window;
}

function resolveDownloadPath(filename: string): string {
  const downloadsDirectory = app.getPath('downloads');
  const extension = path.extname(filename);
  const baseName = path.basename(filename, extension);

  for (let index = 0; ; index += 1) {
    const suffix = index === 0 ? '' : ` (${index})`;
    const candidate = path.join(downloadsDirectory, `${baseName}${suffix}${extension}`);

    if (!existsSync(candidate)) {
      return candidate;
    }
  }
}

function configureSession(): void {
  const appSession = session.fromPartition(sessionPartition);

  appSession.setPermissionCheckHandler(() => false);
  appSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  appSession.on('will-download', (_event, item) => {
    if (!isRemoteAppUrl(item.getURL())) {
      item.cancel();
      return;
    }

    const filename = sanitizeDownloadFilename(item.getFilename());
    if (filename === null) {
      item.cancel();
      return;
    }

    item.setSavePath(resolveDownloadPath(filename));
  });
}

function configureApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]));
}

function focusMainWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusMainWindow();
  });

  app.whenReady().then(() => {
    configureSession();
    configureApplicationMenu();
    createMainWindow();

    app.on('activate', () => {
      focusMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
