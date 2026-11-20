// Profilin mods klasöründeki dosyalar: listeleme (fabric.mod.json'dan ad/sürüm/ikon), aç/kapa, ekleme, silme.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MOD_CATALOG } = require('./config');

const MAX_JAR = 256 * 1024 * 1024;
const metaCache = new Map(); // yol|boyut|tarih -> meta

const safeFile = n => typeof n === 'string' && n.length < 256 && !/[\\/]/.test(n) && !n.includes('..') && /\.jar(\.disabled)?$/i.test(n);

// ---- küçük zip okuyucu: sadece istenen tek dosyayı okur (tüm jar belleğe alınmaz)
function readZipEntries(file, names) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return null;
    const cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
    if (cdOff === 0xffffffff || cdSize > 32 * 1024 * 1024 || cdOff + cdSize > size) return null;
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    const out = {};
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nlen = cd.readUInt16LE(p + 28), elen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32);
      const loff = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nlen);
      p += 46 + nlen + elen + clen;
      if (!names.includes(name) || usize > 1024 * 1024 || csize > 1024 * 1024) continue;
      const lh = Buffer.alloc(30);
      fs.readSync(fd, lh, 0, 30, loff);
      if (lh.readUInt32LE(0) !== 0x04034b50) continue;
      const data = Buffer.alloc(csize);
      fs.readSync(fd, data, 0, csize, loff + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28));
      try {
        out[name] = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: 1024 * 1024 }) : null;
      } catch {}
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

function parseLoose(text) {
  try { return JSON.parse(text); } catch {}
  // bazı modların fabric.mod.json'unda yorum / kontrol karakteri olur
  try { return JSON.parse(text.replace(/\/\/[^\n]*/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')); } catch {}
  const g = k => { const m = new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`).exec(text); return m ? m[1] : ''; };
  return { name: g('name'), version: g('version'), description: g('description'), id: g('id'), icon: g('icon') };
}

/** Jar'ın fabric.mod.json bilgisi. fabric = false ise Fabric modu değildir (Forge/NeoForge vb.). */
function jarMeta(file) {
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const key = `${file}|${st.size}|${st.mtimeMs}`;
  if (metaCache.has(key)) return metaCache.get(key);
  let meta = { fabric: false, name: '', version: '', desc: '', icon: '', modId: '' };
  try {
    const e = readZipEntries(file, ['fabric.mod.json', 'quilt.mod.json', 'META-INF/mods.toml', 'META-INF/neoforge.mods.toml']);
    if (e && e['fabric.mod.json']) {
      const j = parseLoose(e['fabric.mod.json'].toString('utf8')) || {};
      meta = {
        fabric: true, modId: String(j.id || ''), name: String(j.name || j.id || ''), version: String(j.version || ''),
        desc: String(j.description || '').slice(0, 200), icon: ''
      };
      let icon = typeof j.icon === 'string' ? j.icon : j.icon && typeof j.icon === 'object' ? Object.values(j.icon).pop() : '';
      if (icon && typeof icon === 'string' && /\.png$/i.test(icon)) {
        const ie = readZipEntries(file, [icon.replace(/^\//, '')]);
        const buf = ie && ie[icon.replace(/^\//, '')];
        if (buf && buf.length < 300 * 1024 && buf.readUInt32BE(0) === 0x89504e47) meta.icon = 'data:image/png;base64,' + buf.toString('base64');
      }
    } else if (e && e['quilt.mod.json']) {
      meta.loader = 'quilt';
    } else if (e && (e['META-INF/mods.toml'] || e['META-INF/neoforge.mods.toml'])) {
      meta.loader = 'forge';
    }
  } catch {}
  if (metaCache.size > 500) metaCache.clear();
  metaCache.set(key, meta);
  return meta;
}

function readJson(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

/**
 * Mods klasöründeki tüm jar'lar. control: dosyanın launcher'da neyle açılıp kapandığı
 *  catalog/extra/jestron: profil ayarı · dep: başka modun zorunlu bağımlılığı · file: kullanıcının kendi dosyası
 */
function list(instanceDir, profile) {
  const modsDir = path.join(instanceDir, 'mods');
  let names = [];
  try { names = fs.readdirSync(modsDir).filter(safeFile); } catch { return []; }
  const man = readJson(path.join(modsDir, '.jestron.json')) || {};
  const jman = readJson(path.join(modsDir, '.jestron-extra.json')) || {};
  const roots = new Map();
  for (const r of Array.isArray(man.resolved) ? man.resolved : []) if (r && r.filename) roots.set(r.filename, r);
  const managed = new Set(Array.isArray(man.files) ? man.files : []);
  const jfiles = new Set(Array.isArray(jman.files) ? jman.files : []);
  const catalog = new Map(MOD_CATALOG.map(m => [m.id, m]));
  const extras = new Map((profile.extraMods || []).map(m => [m.id, m]));
  const out = [];
  for (const file of names) {
    const disabled = /\.disabled$/i.test(file);
    const base = disabled ? file.slice(0, -9) : file;
    const meta = jarMeta(path.join(modsDir, file)) || {};
    let st = {};
    try { st = fs.statSync(path.join(modsDir, file)); } catch {}
    const item = {
      file, size: st.size || 0, name: meta.name || base.replace(/\.jar$/i, ''), version: meta.version || '', desc: meta.desc || '',
      icon: meta.icon || '', fabric: !!meta.fabric, loader: meta.loader || (meta.fabric ? 'fabric' : ''),
      source: 'manual', control: { type: 'file' }, enabled: !disabled
    };
    if (jfiles.has(base)) {
      const key = /jestronclient/i.test(base) ? 'jestronClient' : 'efektMenu';
      item.source = 'jestron';
      item.control = { type: 'jestron', id: key };
      item.enabled = !!profile[key];
    } else if (managed.has(base)) {
      item.source = 'launcher';
      const r = roots.get(base);
      if (r && r.dep) {
        const owner = catalog.get(r.root) || extras.get(r.root);
        item.control = { type: 'dep', id: r.root, owner: owner ? owner.name : r.root };
        item.enabled = true;
      } else if (r && catalog.has(r.root)) {
        item.control = { type: 'catalog', id: r.root };
        item.enabled = !!(profile.mods && profile.mods[r.root]);
        if (catalog.get(r.root).required) item.control.required = true;
      } else if (r && extras.has(r.root)) {
        item.control = { type: 'extra', id: r.root };
        item.enabled = extras.get(r.root).enabled !== false;
      } else {
        item.control = { type: 'launcher' };
        item.enabled = true;
      }
    }
    out.push(item);
  }
  const rank = { manual: 0, launcher: 1, jestron: 2 };
  out.sort((a, b) => rank[a.source] - rank[b.source] || a.name.localeCompare(b.name, 'tr'));
  return out;
}

/** Kullanıcının kendi modunu açar/kapatır (.jar <-> .jar.disabled). */
function setEnabled(instanceDir, file, enabled) {
  if (!safeFile(file)) throw new Error('Geçersiz dosya');
  const modsDir = path.join(instanceDir, 'mods');
  const disabled = /\.disabled$/i.test(file);
  if (disabled === !enabled) return file;
  const from = path.join(modsDir, file);
  const to = path.join(modsDir, enabled ? file.slice(0, -9) : file + '.disabled');
  if (!fs.existsSync(from)) throw new Error('Dosya bulunamadı');
  if (fs.existsSync(to)) throw new Error('Aynı adda başka bir dosya var: ' + path.basename(to));
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') throw new Error('Dosya kullanımda. Oyunu kapatıp tekrar dene.');
    throw e;
  }
  return path.basename(to);
}

/** Dışarıdan jar ekler. Fabric modu olmayanlar eklenmez. */
function addFiles(instanceDir, paths) {
  const modsDir = path.join(instanceDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const added = [], rejected = [];
  for (const p of (Array.isArray(paths) ? paths : []).slice(0, 100)) {
    const name = path.basename(String(p || ''));
    try {
      if (!/\.jar$/i.test(name) || !safeFile(name)) { rejected.push(`${name}: .jar değil`); continue; }
      const st = fs.statSync(p);
      if (!st.isFile() || st.size > MAX_JAR) { rejected.push(`${name}: dosya okunamadı`); continue; }
      const meta = jarMeta(p);
      if (!meta || !meta.fabric) {
        rejected.push(`${name}: ${meta && meta.loader === 'forge' ? 'Forge/NeoForge modu, Fabric değil' : meta && meta.loader === 'quilt' ? 'Quilt modu' : 'Fabric modu değil'}`);
        continue;
      }
      const dest = path.join(modsDir, name);
      if (path.resolve(p) !== path.resolve(dest)) fs.copyFileSync(p, dest);
      // aynı modun kapalı kopyası varsa kaldır (iki kez yüklenmesin)
      try { if (fs.existsSync(dest + '.disabled')) fs.unlinkSync(dest + '.disabled'); } catch {}
      added.push(meta.name || name);
    } catch (e) {
      rejected.push(`${name}: ${e.code === 'EBUSY' || e.code === 'EPERM' ? 'dosya kullanımda' : e.message}`);
    }
  }
  return { added, rejected };
}

function filePath(instanceDir, file) {
  if (!safeFile(file)) throw new Error('Geçersiz dosya');
  const f = path.join(instanceDir, 'mods', file);
  if (!fs.existsSync(f)) throw new Error('Dosya bulunamadı');
  return f;
}

module.exports = { list, setEnabled, addFiles, filePath, jarMeta, safeFile };
