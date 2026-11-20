const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, safeStorage } = require('electron');
const { MOD_CATALOG, DEFAULT_VERSION } = require('./config');

const dataDir = () => app.getPath('userData');
const file = name => path.join(dataDir(), name);

function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
}
function writeJson(name, data) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file(name));
}

const SCHEMA = 2;
const totalMb = () => Math.floor(os.totalmem() / 1048576);

function defaultRam() {
  // Toplam RAM'in yaklaşık 1/3'ü, 2-8 GB arası
  return Math.max(2048, Math.min(8192, Math.round(totalMb() / 3 / 512) * 512));
}
function maxRam() {
  return Math.max(1024, totalMb() - 1024);
}

const JVM_BALANCED = '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20';

function defaults() {
  const mods = {};
  for (const m of MOD_CATALOG) mods[m.id] = !!m.def;
  return {
    version: DEFAULT_VERSION,
    loader: 'fabric',          // 'fabric' | 'vanilla'
    ramMb: defaultRam(),
    width: 1280, height: 720, fullscreen: false,
    jvmArgs: JVM_BALANCED,
    preset: 'balanced',        // 'low' | 'balanced' | 'high' | 'custom'
    javaPath: '',              // boşsa otomatik (Mojang runtime)
    gameDir: path.join(app.getPath('appData'), '.jestron'),
    onLaunch: 'hide',          // 'hide' | 'close' | 'keep'
    showSnapshots: false,
    mods,
    extraMods: [],             // [{id, name, desc, icon}] Modrinth aramasından eklenenler
    jestronClient: true,       // Sağ Shift menüsü (sadece 1.21.4 Fabric)
    efektMenu: true,           // JestronPriv Efekt Menüsü (sadece 1.21.4 Fabric)
    servers: [],               // [{id, name, host, port, fav}] kullanıcının eklediği sunucular
    syncServers: true,         // sunucuları oyunun çok oyunculu listesine de yaz
    dark: false,
    accent: 0,
    checkUpdates: true,
    schema: SCHEMA,
    playtimeMs: 0,
    lastPlayedAt: 0
  };
}

let settingsCache;

function migrate(s) {
  // 1.x'te gömülü gelen "öne çıkan" sunucu ve eski tema alanları
  if (Array.isArray(s.servers)) s.servers = s.servers.filter(x => x && !x.featured);
  delete s.theme;
  delete s.layout;
  if (Object.keys(s).length && (!s.schema || s.schema < SCHEMA)) {
    // 2.0: Jestron Client ve Efekt Menüsü 1.21.4'te; zoom Efekt Menüsü'nde (C) olduğu için Zoomify kapanır
    if (s.version === '1.20.1') s.version = DEFAULT_VERSION;
    if (s.mods && typeof s.mods === 'object') s.mods.zoomify = false;
  }
  s.schema = SCHEMA;
  return s;
}

function cleanServers(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const x of list) {
    if (!x || typeof x.host !== 'string') continue;
    const host = x.host.trim().toLowerCase();
    const port = Math.max(1, Math.min(65535, parseInt(x.port, 10) || 25565));
    if (!/^[a-z0-9.\-_]+$/i.test(host) || host.length > 253) continue;
    const key = host + ':' + port;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: typeof x.id === 'string' && x.id ? x.id : key,
      name: String(x.name || host).slice(0, 48),
      host, port,
      fav: !!x.fav
    });
  }
  return out;
}

function getSettings() {
  if (!settingsCache) {
    const d = defaults();
    const s = migrate(readJson('settings.json', {}));
    settingsCache = { ...d, ...s, mods: { ...d.mods, ...(s.mods || {}) } };
    settingsCache.servers = cleanServers(settingsCache.servers);
    for (const m of MOD_CATALOG) if (m.required) settingsCache.mods[m.id] = true;
  }
  return settingsCache;
}

function setSettings(patch) {
  const s = { ...getSettings(), ...(patch || {}) };
  s.mods = { ...s.mods };
  for (const m of MOD_CATALOG) if (m.required) s.mods[m.id] = true;
  s.ramMb = Math.max(1024, Math.min(maxRam(), Number(s.ramMb) || defaultRam()));
  s.width = Math.max(640, Math.min(7680, parseInt(s.width, 10) || 1280));
  s.height = Math.max(480, Math.min(4320, parseInt(s.height, 10) || 720));
  s.accent = Math.max(0, Math.min(5, parseInt(s.accent, 10) || 0));
  s.servers = cleanServers(s.servers);
  if (!Array.isArray(s.extraMods)) s.extraMods = [];
  s.extraMods = s.extraMods.filter(m => m && typeof m.id === 'string' && /^[a-z0-9_\-]+$/i.test(m.id)).slice(0, 200);
  settingsCache = s;
  writeJson('settings.json', s);
  return s;
}

/** Performans ön ayarı: RAM, JVM argümanları ve modları birlikte ayarlar. */
function presetPatch(name) {
  const s = getSettings();
  const mods = { ...s.mods };
  const set = (pred, v) => { for (const m of MOD_CATALOG) if (pred(m)) mods[m.id] = v; };
  if (name === 'low') {
    set(m => m.perf, true);
    set(m => m.heavy, false);
    return { preset: 'low', ramMb: Math.min(maxRam(), 2048), jvmArgs: '-XX:+UseG1GC -XX:MaxGCPauseMillis=50 -XX:+DisableExplicitGC', mods, fullscreen: s.fullscreen };
  }
  if (name === 'high') {
    set(m => m.perf, true);
    set(m => m.heavy, true);
    return { preset: 'high', ramMb: Math.min(maxRam(), Math.max(defaultRam(), 6144)), jvmArgs: JVM_BALANCED, mods };
  }
  set(m => m.perf, true);
  return { preset: 'balanced', ramMb: defaultRam(), jvmArgs: JVM_BALANCED, mods };
}

// ---- Hesaplar ----
// refresh token'lar işletim sisteminin anahtarlığıyla şifrelenir (safeStorage)
function enc(str) {
  if (!str) return '';
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(str).toString('base64');
  return 'raw:' + Buffer.from(str).toString('base64');
}
function dec(str) {
  if (!str) return '';
  if (str.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(str.slice(4), 'base64'));
  if (str.startsWith('raw:')) return Buffer.from(str.slice(4), 'base64').toString();
  return '';
}

function getAccountsRaw() {
  const a = readJson('accounts.json', { selected: null, list: [] });
  if (!a || !Array.isArray(a.list)) return { selected: null, list: [] };
  return a;
}
function saveAccountsRaw(a) { writeJson('accounts.json', a); }

// Arayüze gönderilen güvenli liste (token yok)
function publicAccounts() {
  const a = getAccountsRaw();
  return {
    selected: a.selected,
    canOffline: a.list.some(x => x.type === 'microsoft' && x.owned),
    list: a.list.map(({ id, type, name, uuid, owned }) => ({ id, type, name, uuid, owned }))
  };
}

// Küçük önbellek dosyaları (GitHub / Modrinth yanıtları)
function readCache(name, maxAgeMs) {
  const c = readJson('cache-' + name + '.json', null);
  if (!c || typeof c.at !== 'number' || Date.now() - c.at > maxAgeMs) return null;
  return c.data;
}
function writeCache(name, data) {
  try { writeJson('cache-' + name + '.json', { at: Date.now(), data }); } catch {}
}
function clearCaches() {
  try {
    for (const f of fs.readdirSync(dataDir())) if (f.startsWith('cache-')) fs.unlinkSync(path.join(dataDir(), f));
  } catch {}
}

module.exports = {
  getSettings, setSettings, presetPatch, defaultRam, maxRam, totalMb,
  getAccountsRaw, saveAccountsRaw, publicAccounts, enc, dec,
  readCache, writeCache, clearCaches
};
