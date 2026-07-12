/*
 * IPTVy desktop — Electron main process.
 *
 * This wrapper does exactly one thing: it runs the web build's local host
 * (web/dev-server.mjs) in-process and points a window at it. The renderer loads
 * http://127.0.0.1:<port>/app/ — the same static app and the same /api/proxy
 * handler that production (Vercel) serves — so the desktop app is the web app,
 * byte for byte, with no separate code path to maintain.
 *
 * We bind to 127.0.0.1 on an OS-assigned free port (listen(0)), so nothing is
 * exposed off-machine and two instances never fight over a fixed port.
 */
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Serving over plain http://127.0.0.1 means the app never hits the browser's
// mixed-content block, so it can talk to http:// Xtream panels directly (the
// proxy still handles CORS-blocked ones) — same behaviour as `node dev-server`.

// Resolve the local host module. In dev it sits one dir up; packaged, it's
// copied under resources/web (see extraResources in package.json).
const devServerPath = app.isPackaged
  ? join(process.resourcesPath, 'web', 'dev-server.mjs')
  : join(import.meta.dirname, '..', 'dev-server.mjs');

let server = null;
let mainWindow = null;

// Start the in-process host and resolve with the URL to load.
function startHost() {
  return new Promise((resolve, reject) => {
    import(pathToFileURL(devServerPath).href)
      .then(({ createIptvyServer }) => {
        server = createIptvyServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address();
          resolve(`http://127.0.0.1:${port}/app/`);
        });
      })
      .catch(reject);
  });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#15120C',
    autoHideMenuBar: true,
    title: 'IPTVy',
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Open external links (e.g. the app download) in the system browser, not a
  // nested Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.loadURL(url);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  let url;
  try {
    url = await startHost();
  } catch (err) {
    console.error('[IPTVy] failed to start local host', err);
    app.quit();
    return;
  }
  createWindow(url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (server) { try { server.close(); } catch (e) {} }
});
