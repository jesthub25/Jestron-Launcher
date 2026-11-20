const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
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

const SCHEMA = 3;
const totalMb = () => Math.floor(os.totalmem() / 1048576);

function defaultRam() {
  // Toplam RAM'in yaklaşık 1/3'ü, 2-8 GB arası
  return Math.max(2048, Math.min(8192, Math.round(totalMb() / 3 / 512) * 512));
}
function maxRam() {
  return Math.max(1024, totalMb() - 1024);
}

const JVM_BALANCED = '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20';
const JVM_LOW = '-XX:+UseG1GC -XX:MaxGCPauseMillis=50 -XX:+DisableExplicitGC';
const PROFILE_COLORS = 8;
const PRESETS = ['low', 'balanced', 'high', 'custom'];
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.\-_ ]{0,31}$/; // başta harf/rakam: '..' gibi yol parçaları olamaz
const DIR_RE = /^[A-Za-z0-9._\- ]{1,64}$/;
// Profillere taşınan eski (2.0) üst düzey alanlar
const PROFILE_KEYS = ['version', 'loader', 'mods', 'extraMods', 'jestronClient', 'efektMenu', 'ramMb', 'jvmArgs', 'preset', 'width', 'height', 'fullscreen'];

/** Uygulama geneli ayarlar (profilden bağımsız). */
function defaults() {
  return {
    javaPath: '',              // boşsa otomatik (Mojang runtime); profil kendi yolunu verebilir
    gameDir: path.join(app.getPath('appData'), '.jestron'),
    onLaunch: 'hide',          // 'hide' | 'close' | 'keep'
    showSnapshots: false,
    servers: [],               // [{id, name, host, port, fav}] kullanıcının eklediği sunucular
    syncServers: true,         // sunucuları oyunun çok oyunculu listesine de yaz
    dark: false,
    accent: 0,
    checkUpdates: true,
    schema: SCHEMA,
    playtimeMs: 0,
    lastPlayedAt: 0,
    profiles: [],
    profileId: null
  };
}

function profileDefaults() {
  const mods = {};
  for (const m of MOD_CATALOG) mods[m.id] = !!m.def;
  return {
    id: '', name: 'Profil', color: 0,
    version: DEFAULT_VERSION,
    loader: 'fabric',          // 'fabric' | 'vanilla'
    mods,
    extraMods: [],             // [{id, name, desc, icon}] Modrinth aramasından eklenenler
    jestronClient: true,       // Sağ Shift menüsü (sadece 1.21.4 Fabric)
    efektMenu: true,           // JestronPriv Efekt Menüsü (sadece 1.21.4 Fabric)
    ramMb: defaultRam(),
    jvmArgs: JVM_BALANCED,
    preset: 'balanced',        // 'low' | 'balanced' | 'high' | 'custom'
    width: 1280, height: 720, fullscreen: false,
    javaPath: '',              // boşsa genel ayar / otomatik
    server: null,              // {host, port}: Oyna'ya basınca bu sunucuya direkt bağlan
    dir: '',                   // instances/<dir> oyun klasörü
    createdAt: 0, lastPlayedAt: 0, playtimeMs: 0
  };
}

const newId = () => 'p-' + crypto.randomBytes(5).toString('hex');
const clampInt = (v, min, max, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
const cleanText = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const nonNeg = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

function cleanServer(x) {
  if (!x || typeof x.host !== 'string') return null;
  const host = x.host.trim().toLowerCase();
  const port = clampInt(x.port, 1, 65535, 25565);
  if (!/^[a-z0-9.\-_]+$/i.test(host) || host.length > 253) return null;
  return { host, port };
}

function cleanExtraMods(list) {
  const out = [];
  const seen = new Set();
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || typeof m.id !== 'string' || !/^[a-z0-9_\-]{1,64}$/i.test(m.id) || seen.has(m.id)) continue;
    seen.add(m.id);
    const icon = typeof m.icon === 'string' && /^https:\/\/[^\s"'<>]{1,500}$/.test(m.icon) ? m.icon : '';
    out.push({ id: m.id, name: cleanText(m.name, 64) || m.id, desc: cleanText(m.desc, 200), icon });
    if (out.length >= 200) break;
  }
  return out;
}

/** Profili doğrular ve sadece bilinen alanları bırakır. */
function cleanProfile(p, fallbackName) {
  const d = profileDefaults();
  const src = p && typeof p === 'object' ? p : {};
  const o = { ...d };
  o.id = typeof src.id === 'string' && /^p-[a-z0-9]{4,24}$/.test(src.id) ? src.id : newId();
  o.name = cleanText(src.name, 32) || fallbackName || 'Profil';
  o.color = clampInt(src.color, 0, PROFILE_COLORS - 1, 0);
  o.version = typeof src.version === 'string' && VERSION_RE.test(src.version.trim()) ? src.version.trim() : DEFAULT_VERSION;
  o.loader = src.loader === 'vanilla' ? 'vanilla' : 'fabric';
  o.mods = { ...d.mods };
  if (src.mods && typeof src.mods === 'object') {
    for (const m of MOD_CATALOG) if (typeof src.mods[m.id] === 'boolean') o.mods[m.id] = src.mods[m.id];
  }
  for (const m of MOD_CATALOG) if (m.required) o.mods[m.id] = true;
  o.extraMods = cleanExtraMods(src.extraMods);
  o.jestronClient = src.jestronClient !== undefined ? !!src.jestronClient : d.jestronClient;
  o.efektMenu = src.efektMenu !== undefined ? !!src.efektMenu : d.efektMenu;
  o.ramMb = clampInt(src.ramMb, 1024, maxRam(), Math.min(maxRam(), d.ramMb));
  o.jvmArgs = typeof src.jvmArgs === 'string' ? cleanText(src.jvmArgs, 2000) : d.jvmArgs;
  o.preset = src.preset === undefined ? d.preset : PRESETS.includes(src.preset) ? src.preset : 'custom';
  o.width = clampInt(src.width, 640, 7680, 1280);
  o.height = clampInt(src.height, 480, 4320, 720);
  o.fullscreen = !!src.fullscreen;
  o.javaPath = typeof src.javaPath === 'string' ? cleanText(src.javaPath, 500) : '';
  o.server = cleanServer(src.server);
  const dir = typeof src.dir === 'string' ? src.dir.trim() : '';
  o.dir = DIR_RE.test(dir) && dir !== '.' && dir !== '..' && !dir.startsWith('.') ? dir : 'profil-' + o.id.slice(2);
  o.createdAt = nonNeg(src.createdAt) || Date.now();
  o.lastPlayedAt = nonNeg(src.lastPlayedAt);
  o.playtimeMs = nonNeg(src.playtimeMs);
  return o;
}

function cleanServers(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const sv = cleanServer(x);
    if (!sv) continue;
    const key = sv.host + ':' + sv.port;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: typeof x.id === 'string' && x.id ? x.id.slice(0, 300) : key, name: cleanText(x.name || sv.host, 48) || sv.host, ...sv, fav: !!x.fav });
  }
  return out;
}

/** Profil listesini doğrular: en az bir profil, benzersiz id ve klasör. */
function cleanProfiles(list) {
  const out = [];
  const ids = new Set(), dirs = new Set();
  for (const raw of Array.isArray(list) ? list.slice(0, 50) : []) {
    const p = cleanProfile(raw);
    while (ids.has(p.id)) p.id = newId();
    let dir = p.dir, k = 2;
    while (dirs.has(dir.toLowerCase())) dir = `${p.dir}-${k++}`;
    p.dir = dir;
    ids.add(p.id); dirs.add(dir.toLowerCase());
    out.push(p);
  }
  return out;
}

let settingsCache;

function migrate(s) {
  // 1.x'te gömülü gelen "öne çıkan" sunucu ve eski tema alanları
  if (Array.isArray(s.servers)) s.servers = s.servers.filter(x => x && !x.featured);
  delete s.theme;
  delete s.layout;
  const hadData = Object.keys(s).length > 0;
  if (hadData && (!s.schema || s.schema < 2)) {
    // 2.0: Jestron Client ve Efekt Menüsü 1.21.4'te; zoom Efekt Menüsü'nde (C) olduğu için Zoomify kapanır
    if (s.version === '1.20.1') s.version = DEFAULT_VERSION;
    if (s.mods && typeof s.mods === 'object') s.mods.zoomify = false;
  }
  // 3.0 (2.1.0): oyun ayarları profillere taşınır; eski ayarlar "Varsayılan" profili olur, oyun klasörü aynı kalır
  if (!Array.isArray(s.profiles) || !s.profiles.length) {
    const legacy = {};
    for (const k of PROFILE_KEYS) if (s[k] !== undefined) legacy[k] = s[k];
    const p = cleanProfile({ ...legacy, name: 'Varsayılan', color: 0 });
    // Eski sürüm, her sürüm+loader için ayrı klasör kullanıyordu: dünyalar ve ayarlar korunur
    p.dir = `${p.version}-${p.loader}`.replace(/[^A-Za-z0-9._\- ]/g, '_');
    if (hadData) { p.playtimeMs = nonNeg(s.playtimeMs); p.lastPlayedAt = nonNeg(s.lastPlayedAt); }
    s.profiles = [p];
    s.profileId = p.id;
  }
  for (const k of PROFILE_KEYS) delete s[k];
  s.schema = SCHEMA;
  return s;
}

function normalize(s) {
  const d = defaults();
  const o = { ...d };
  o.javaPath = typeof s.javaPath === 'string' ? cleanText(s.javaPath, 500) : '';
  o.gameDir = typeof s.gameDir === 'string' && s.gameDir.trim() && path.isAbsolute(s.gameDir.trim()) ? s.gameDir.trim() : d.gameDir;
  o.onLaunch = ['hide', 'close', 'keep'].includes(s.onLaunch) ? s.onLaunch : 'hide';
  o.showSnapshots = !!s.showSnapshots;
  o.servers = cleanServers(s.servers);
  o.syncServers = s.syncServers !== undefined ? !!s.syncServers : true;
  o.dark = !!s.dark;
  o.accent = clampInt(s.accent, 0, 5, 0);
  o.checkUpdates = s.checkUpdates !== undefined ? !!s.checkUpdates : true;
  o.playtimeMs = nonNeg(s.playtimeMs);
  o.lastPlayedAt = nonNeg(s.lastPlayedAt);
  o.profiles = cleanProfiles(s.profiles);
  if (!o.profiles.length) o.profiles = [cleanProfile({ name: 'Varsayılan' })];
  o.profileId = o.profiles.some(p => p.id === s.profileId) ? s.profileId : o.profiles[0].id;
  o.schema = SCHEMA;
  return o;
}

function save(s) {
  settingsCache = s;
  writeJson('settings.json', s);
  return s;
}

function getSettings() {
  if (!settingsCache) {
    const raw = readJson('settings.json', {});
    const s = normalize(migrate(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}));
    settingsCache = s;
    try { writeJson('settings.json', s); } catch {}
  }
  return settingsCache;
}

/** Genel ayarları değiştirir. Profil alanları burada değişmez (profil fonksiyonlarını kullan). */
function setSettings(patch) {
  const p = { ...(patch || {}) };
  if (p.gameDir !== undefined && (typeof p.gameDir !== 'string' || !path.isAbsolute(p.gameDir.trim()))) {
    throw new Error('Oyun klasörü tam bir yol olmalı (ör. C:\\Oyunlar\\Jestron).');
  }
  delete p.profiles; delete p.profileId; delete p.schema;
  for (const k of PROFILE_KEYS) delete p[k];
  const cur = getSettings();
  return save(normalize({ ...cur, ...p }));
}

// ---- Profiller ----
function getProfile(id) {
  const s = getSettings();
  const p = s.profiles.find(x => x.id === id);
  if (!p) throw new Error('Profil bulunamadı.');
  return p;
}
function activeProfile() {
  const s = getSettings();
  return s.profiles.find(x => x.id === s.profileId) || s.profiles[0];
}
function instanceDir(p = activeProfile()) {
  return path.join(getSettings().gameDir, 'instances', p.dir);
}
function uniqueName(name, list, selfId) {
  const base = cleanText(name, 32) || 'Profil';
  const taken = new Set(list.filter(p => p.id !== selfId).map(p => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) {
    const n = `${base.slice(0, 28)} ${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
  return base;
}

/**
 * Yeni profil. opts: { name, data (içe aktarılan / kopyalanan ayarlar), select }
 * @returns {{settings, profile}}
 */
function createProfile(opts = {}) {
  const s = getSettings();
  if (s.profiles.length >= 50) throw new Error('En fazla 50 profil olabilir.');
  const data = { ...(opts.data || {}) };
  delete data.id; delete data.dir; delete data.createdAt; delete data.lastPlayedAt; delete data.playtimeMs;
  const p = cleanProfile({ ...data, name: uniqueName(opts.name || data.name || 'Yeni profil', s.profiles), color: data.color !== undefined ? data.color : s.profiles.length % PROFILE_COLORS });
  p.createdAt = Date.now();
  const next = { ...s, profiles: [...s.profiles, p] };
  if (opts.select) next.profileId = p.id;
  const saved = save(normalize(next));
  return { settings: saved, profile: saved.profiles.find(x => x.id === p.id) };
}

function updateProfile(id, patch) {
  const s = getSettings();
  const cur = getProfile(id);
  const ptc = { ...(patch || {}) };
  delete ptc.id; delete ptc.dir; delete ptc.createdAt;
  if (ptc.name !== undefined) ptc.name = uniqueName(ptc.name, s.profiles, id);
  if (ptc.mods) ptc.mods = { ...cur.mods, ...ptc.mods };
  const p = cleanProfile({ ...cur, ...ptc });
  return save(normalize({ ...s, profiles: s.profiles.map(x => (x.id === id ? p : x)) }));
}

function deleteProfile(id) {
  const s = getSettings();
  getProfile(id);
  if (s.profiles.length <= 1) throw new Error('Son profil silinemez.');
  const profiles = s.profiles.filter(x => x.id !== id);
  return save(normalize({ ...s, profiles, profileId: s.profileId === id ? profiles[0].id : s.profileId }));
}

function selectProfile(id) {
  getProfile(id);
  return save(normalize({ ...getSettings(), profileId: id }));
}

function moveProfile(id, dir) {
  const s = getSettings();
  const i = s.profiles.findIndex(x => x.id === id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= s.profiles.length) return s;
  const profiles = [...s.profiles];
  [profiles[i], profiles[j]] = [profiles[j], profiles[i]];
  return save(normalize({ ...s, profiles }));
}

/** Performans ön ayarı: RAM, JVM argümanları ve modları birlikte ayarlar. */
function presetPatch(p, name) {
  const mods = { ...p.mods };
  const set = (pred, v) => { for (const m of MOD_CATALOG) if (pred(m)) mods[m.id] = v; };
  if (name === 'low') {
    set(m => m.perf, true);
    set(m => m.heavy, false);
    return { preset: 'low', ramMb: Math.min(maxRam(), 2048), jvmArgs: JVM_LOW, mods };
  }
  if (name === 'high') {
    set(m => m.perf, true);
    set(m => m.heavy, true);
    return { preset: 'high', ramMb: Math.min(maxRam(), Math.max(defaultRam(), 6144)), jvmArgs: JVM_BALANCED, mods };
  }
  set(m => m.perf, true);
  return { preset: 'balanced', ramMb: defaultRam(), jvmArgs: JVM_BALANCED, mods };
}
function applyPreset(id, name) {
  if (!['low', 'balanced', 'high'].includes(name)) throw new Error('Geçersiz ön ayar');
  return updateProfile(id, presetPatch(getProfile(id), name));
}

/** Oyun kapanınca süreyi hem genel hem profile ekler. */
function addPlaytime(profileId, ms) {
  const s = getSettings();
  const now = Date.now();
  const add = Math.max(0, ms || 0);
  const profiles = s.profiles.map(p => (p.id === profileId ? { ...p, playtimeMs: p.playtimeMs + add, lastPlayedAt: now } : p));
  return save({ ...s, profiles, playtimeMs: s.playtimeMs + add, lastPlayedAt: now });
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
  getSettings, setSettings, defaultRam, maxRam, totalMb,
  getProfile, activeProfile, instanceDir, createProfile, updateProfile, deleteProfile, selectProfile, moveProfile,
  applyPreset, addPlaytime, cleanProfile, PROFILE_COLORS,
  getAccountsRaw, saveAccountsRaw, publicAccounts, enc, dec,
  readCache, writeCache, clearCaches
};
