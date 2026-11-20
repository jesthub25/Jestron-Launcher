const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, protocol, net: enet } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const store = require('./store');
const auth = require('./auth');
const versions = require('./versions');
const mods = require('./mods');
const game = require('./launch');
const jestron = require('./jestron');
const crash = require('./crash');
const update = require('./update');
const { ping } = require('./ping');
const config = require('./config');

let win, tray;
const logBuffer = [];
let pendingLogs = [];
let flushTimer = null;
let lastCrash = null;

// İkinci kopya açılırsa hemen çık, mevcut pencereyi öne getir
if (!app.requestSingleInstanceLock()) { app.exit(0); return; }
app.on('second-instance', () => showWin());

// Galeri: ekran görüntüleri sadece instance'ların screenshots klasörlerinden, güvenli bir şemayla sunulur
protocol.registerSchemesAsPrivileged([{ scheme: 'jshot', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function showWin() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function hideWin() {
  if (!win || win.isDestroyed()) return;
  win.hide();
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'renderer', 'assets', 'icon.png')).resize({ width: 16, height: 16 }));
    tray.setToolTip(config.APP_NAME);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Göster', click: showWin },
      { label: 'Oyunu kapat', click: () => game.kill() },
      { type: 'separator' },
      { label: 'Çıkış', click: () => { game.kill(); app.quit(); } }
    ]));
    tray.on('click', showWin);
  }
}

function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }

// Optimizasyon: oyun saniyede yüzlerce satır yazabilir; satırlar 120 ms'de bir toplu gönderilir
function log(line) {
  const s = String(line);
  logBuffer.push(s);
  if (logBuffer.length > 4000) logBuffer.splice(0, logBuffer.length - 4000);
  pendingLogs.push(s);
  if (pendingLogs.length > 2000) pendingLogs.splice(0, pendingLogs.length - 2000);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const batch = pendingLogs;
      pendingLogs = [];
      if (batch.length) send('game:logs', batch);
    }, 120);
  }
}

function instanceDir(s = store.getSettings()) {
  return path.join(s.gameDir, 'instances', `${s.version}-${s.loader}`);
}

function screenshotDirs() {
  const root = path.join(store.getSettings().gameDir, 'instances');
  try {
    return fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(root, d.name, 'screenshots'));
  } catch { return []; }
}
function isInside(file, dir) {
  const rel = path.relative(dir, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
function resolveShot(id) {
  // id = <instance>/<dosya.png>
  const m = /^([^/\\]+)\/([^/\\]+\.png)$/i.exec(String(id || ''));
  if (!m || m[1].includes('..') || m[2].includes('..')) return null;
  const f = path.join(store.getSettings().gameDir, 'instances', m[1], 'screenshots', m[2]);
  return screenshotDirs().some(d => isInside(f, d)) && fs.existsSync(f) ? f : null;
}

function createWindow() {
  const s = store.getSettings();
  win = new BrowserWindow({
    width: 1180, height: 720, minWidth: 980, minHeight: 620,
    frame: false, backgroundColor: s.dark ? '#111114' : '#ffffff', show: false,
    title: config.APP_NAME,
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false
    }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
}

app.whenReady().then(() => {
  protocol.handle('jshot', req => {
    try {
      // jshot://s/<encodeURIComponent(id)>
      const u = new URL(req.url);
      const f = resolveShot(decodeURIComponent(u.pathname.slice(1)));
      if (!f) return new Response('yok', { status: 404 });
      return enet.fetch(pathToFileURL(f).toString());
    } catch {
      return new Response('hata', { status: 400 });
    }
  });
  createWindow();
});
app.on('window-all-closed', () => { if (!game.isRunning()) app.quit(); });

// Hataları arayüze {ok,false,error} olarak döndüren sarmalayıcı
function handle(ch, fn) {
  ipcMain.handle(ch, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
  });
}

// Pencere
ipcMain.on('win:min', () => win && win.minimize());
ipcMain.on('win:max', () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on('win:close', () => (game.isRunning() ? hideWin() : app.quit()));

// Genel
handle('app:info', () => ({
  name: config.APP_NAME, version: app.getVersion(),
  totalRamMb: store.totalMb(), maxRamMb: store.maxRam(),
  catalog: config.MOD_CATALOG, platform: process.platform,
  jestronMc: config.JESTRON_MC, client: jestron.clientInfo(),
  repo: config.LAUNCHER_REPO, efektRepo: config.EFEKT_REPO
}));
handle('app:openDir', () => { const d = store.getSettings().gameDir; fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });
handle('app:openSub', sub => {
  const allowed = { mods: 'mods', resourcepacks: 'resourcepacks', shaderpacks: 'shaderpacks', screenshots: 'screenshots' };
  if (!allowed[sub]) throw new Error('Geçersiz klasör');
  const d = path.join(instanceDir(), allowed[sub]);
  fs.mkdirSync(d, { recursive: true });
  return shell.openPath(d);
});
handle('app:openUrl', url => {
  if (!/^https:\/\/(github\.com|modrinth\.com)\//.test(String(url))) throw new Error('İzin verilmeyen bağlantı');
  return shell.openExternal(url);
});
handle('app:pickJava', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Java seç', properties: ['openFile'], filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [] });
  return r.canceled ? null : r.filePaths[0];
});
handle('app:pickDir', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Oyun klasörü seç', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
handle('app:update', force => update.check(!!force));
handle('app:repair', () => {
  const s = store.getSettings();
  const root = s.gameDir;
  const removed = [];
  const rm = p => { try { if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); removed.push(path.relative(root, p)); } } catch {} };
  rm(path.join(root, 'versions', s.version));
  try {
    for (const d of fs.readdirSync(path.join(root, 'versions'))) if (d.startsWith('fabric-loader-') && d.endsWith('-' + s.version)) rm(path.join(root, 'versions', d));
  } catch {}
  rm(path.join(root, 'assets', 'indexes', `${s.version}.json`));
  rm(path.join(instanceDir(s), 'mods', '.jestron.json'));
  store.clearCaches();
  return removed;
});

// Ayarlar
handle('settings:get', () => store.getSettings());
handle('settings:set', patch => store.setSettings(patch));
handle('settings:preset', name => store.setSettings(store.presetPatch(name)));

// Hesaplar
handle('acc:list', () => store.publicAccounts());
handle('acc:addMicrosoft', () => auth.addMicrosoft());
handle('acc:addOffline', name => auth.addOffline(name));
handle('acc:remove', id => auth.remove(id));
handle('acc:select', id => auth.select(id));

// Sürümler, modlar, paketler
handle('ver:list', showSnap => versions.listVersions(showSnap));
handle('mods:search', (q, v, type) => mods.searchProjects(q, v, type));
handle('packs:install', (slug, type) => mods.installPack(instanceDir(), slug, store.getSettings().version, type));
handle('packs:list', () => mods.listPacks(instanceDir()));
handle('packs:remove', async (type, name) => {
  const p = mods.packPath(instanceDir(), type, name);
  if (!fs.existsSync(p)) return true;
  await shell.trashItem(p);
  return true;
});
handle('jestron:efekt', force => jestron.latestEfekt(!!force));

// Sunucular
handle('srv:ping', (host, port) => ping(host, port));

// Galeri
handle('shots:list', () => {
  const out = [];
  for (const d of screenshotDirs()) {
    let files = [];
    try { files = fs.readdirSync(d).filter(f => /\.png$/i.test(f)); } catch { continue; }
    const inst = path.basename(path.dirname(d));
    for (const f of files) {
      try {
        const st = fs.statSync(path.join(d, f));
        out.push({ id: `${inst}/${f}`, name: f, instance: inst, time: st.mtimeMs, size: st.size });
      } catch {}
    }
  }
  return out.sort((a, b) => b.time - a.time).slice(0, 300);
});
handle('shots:open', id => { const f = resolveShot(id); if (!f) throw new Error('Dosya bulunamadı'); return shell.openPath(f); });
handle('shots:reveal', id => { const f = resolveShot(id); if (!f) throw new Error('Dosya bulunamadı'); shell.showItemInFolder(f); return true; });
handle('shots:delete', async id => { const f = resolveShot(id); if (!f) throw new Error('Dosya bulunamadı'); await shell.trashItem(f); return true; });

// Oyun
handle('game:logs', () => logBuffer.slice(-1500));
handle('game:running', () => game.isRunning());
handle('game:kill', () => game.kill());
handle('game:crash', () => lastCrash);
handle('game:launch', async opts => {
  lastCrash = null;
  await game.launch(opts || {}, {
    progress: (stage, pct) => send('game:progress', { stage, pct }),
    log,
    started: () => {
      send('game:state', 'running');
      const mode = store.getSettings().onLaunch;
      if (mode === 'hide' || mode === 'close') hideWin();
    },
    closed: (code, killed) => {
      send('game:state', 'closed');
      const mode = store.getSettings().onLaunch;
      if (mode === 'close' && (code === 0 || killed)) return app.quit();
      showWin();
      if (code !== 0 && !killed) {
        lastCrash = crash.analyze(logBuffer, code) || { title: 'Oyun kapandı', hint: '', line: '' };
        lastCrash.code = code;
        send('game:crash', lastCrash);
      }
    }
  });
  return true;
});
