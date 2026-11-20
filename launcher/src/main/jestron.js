// Jestron modları: Jestron Client (launcher ile gelir) ve Efekt Menüsü (JestronPriv GitHub release'inden).
// İkisi de sadece Minecraft 1.21.4 + Fabric içindir. Kendi listeleriyle (.jestron-extra.json) yönetilir;
// mods.js'in listesine ve kullanıcının kendi modlarına dokunulmaz.
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const store = require('./store');
const { fetchJson, download } = require('./net');
const { EFEKT_REPO, EFEKT_TAG_PREFIX, EFEKT_ASSET, JESTRON_MC } = require('./config');

const CACHE_MS = 6 * 60 * 60 * 1000;

/** Launcher içindeki Jestron Client jar'ı (paketlenmiş uygulamada resources/mods). */
function bundledClientJar() {
  const dirs = [
    path.join(process.resourcesPath || '', 'mods'),
    path.join(app.getAppPath(), 'resources', 'mods'),
    path.join(__dirname, '..', '..', 'resources', 'mods')
  ];
  for (const d of dirs) {
    try {
      const f = fs.readdirSync(d).filter(n => /^JestronClient-.+\.jar$/.test(n) && !n.includes('-sources')).sort().pop();
      if (f) return path.join(d, f);
    } catch {}
  }
  return null;
}

function clientInfo() {
  const jar = bundledClientJar();
  return { available: !!jar, file: jar ? path.basename(jar) : null };
}

/** JestronPriv'in en son 1.21.4 mod release'i: {tag, version, name, url, size}. */
async function latestEfekt(force) {
  if (!force) {
    const c = store.readCache('efekt', CACHE_MS);
    if (c) return c;
  }
  const rel = await fetchJson(`https://api.github.com/repos/${EFEKT_REPO}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json' }
  });
  const r = (Array.isArray(rel) ? rel : []).filter(x => !x.draft && typeof x.tag_name === 'string' && x.tag_name.startsWith(EFEKT_TAG_PREFIX))
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))[0];
  if (!r) throw new Error('Efekt Menüsü release\'i bulunamadı');
  const asset = (r.assets || []).find(a => EFEKT_ASSET.test(a.name));
  if (!asset) throw new Error('Efekt Menüsü jar dosyası release\'te yok');
  const info = { tag: r.tag_name, version: r.tag_name.slice(EFEKT_TAG_PREFIX.length), name: asset.name, url: asset.browser_download_url, size: asset.size };
  store.writeCache('efekt', info);
  return info;
}

function readManifest(f) {
  try { const m = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(m.files) ? m : { files: [] }; } catch { return { files: [] }; }
}

/**
 * Seçili sürüm 1.21.4 Fabric ise Jestron modlarını kurar / günceller, kapatılanları kaldırır.
 * İnternet yoksa önceden indirilmiş Efekt Menüsü kullanılır.
 */
async function ensure(instanceDir, settings, log) {
  const modsDir = path.join(instanceDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const manFile = path.join(modsDir, '.jestron-extra.json');
  const man = readManifest(manFile);
  const supported = settings.loader === 'fabric' && settings.version === JESTRON_MC;
  const want = [];

  if (supported && settings.jestronClient) {
    const jar = bundledClientJar();
    if (jar) {
      const dest = path.join(modsDir, path.basename(jar));
      const st = fs.existsSync(dest) ? fs.statSync(dest) : null;
      if (!st || st.size !== fs.statSync(jar).size) {
        fs.copyFileSync(jar, dest);
        log(`[Jestron] Jestron Client kuruldu: ${path.basename(jar)}`);
      }
      want.push(path.basename(jar));
    } else {
      log('[Jestron] Jestron Client dosyası launcher içinde bulunamadı (geliştirme sürümü?)');
    }
  }

  if (supported && settings.efektMenu) {
    let info = null;
    try {
      info = await latestEfekt(false);
    } catch (e) {
      log(`[Jestron] Efekt Menüsü sürüm bilgisi alınamadı: ${e.message}`);
    }
    const fileName = info ? `EfektMenusu-${info.version}.jar` : (man.files.find(f => f.startsWith('EfektMenusu-')) || null);
    if (fileName) {
      const dest = path.join(modsDir, fileName);
      const ok = fs.existsSync(dest) && (!info || !info.size || fs.statSync(dest).size === info.size);
      if (!ok && info) {
        try {
          try { fs.unlinkSync(dest); } catch {}
          await download(info.url, dest);
          if (info.size && fs.statSync(dest).size !== info.size) throw new Error('boyut uyuşmadı');
          log(`[Jestron] Efekt Menüsü ${info.version} indirildi`);
        } catch (e) {
          try { fs.unlinkSync(dest); } catch {}
          log(`[Jestron] Efekt Menüsü indirilemedi: ${e.message}`);
        }
      }
      if (fs.existsSync(dest)) want.push(fileName);
    }
  }

  // eskiler / kapatılanlar
  for (const f of man.files) {
    if (!want.includes(f)) {
      try { fs.unlinkSync(path.join(modsDir, f)); log(`[Jestron] Kaldırıldı: ${f}`); } catch {}
    }
  }
  fs.writeFileSync(manFile, JSON.stringify({ files: want }, null, 2));
  if (!supported && (settings.jestronClient || settings.efektMenu)) {
    log(`[Jestron] Jestron Client ve Efekt Menüsü sadece ${JESTRON_MC} Fabric'te çalışır, bu sürümde atlandı.`);
  }
  return want;
}

module.exports = { ensure, latestEfekt, clientInfo };
