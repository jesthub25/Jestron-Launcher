const fs = require('fs');
const path = require('path');
const { fetchJson, download } = require('./net');

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const FABRIC = 'https://meta.fabricmc.net/v2';

let manifestCache, fabricGamesCache;

async function manifest() {
  if (!manifestCache) manifestCache = await fetchJson(MANIFEST);
  return manifestCache;
}

// Başarısız istek önbelleğe alınmaz; null = bilinmiyor
async function fabricGames() {
  if (!fabricGamesCache) {
    try { fabricGamesCache = new Set((await fetchJson(`${FABRIC}/versions/game`)).map(v => v.version)); }
    catch { return null; }
  }
  return fabricGamesCache;
}

// Arayüz için sürüm listesi
async function listVersions(showSnapshots) {
  const m = await manifest();
  const fab = await fabricGames();
  return {
    latest: m.latest.release,
    versions: m.versions
      .filter(v => v.type === 'release' || (showSnapshots && v.type === 'snapshot'))
      .map(v => ({ id: v.id, type: v.type, fabric: fab ? fab.has(v.id) : true }))
  };
}

// Vanilla sürüm JSON'unu indirip doğrular ve döndürür
async function vanillaJson(root, id) {
  const dest = path.join(root, 'versions', id, `${id}.json`);
  let entry = null;
  try {
    const m = await manifest();
    entry = m.versions.find(v => v.id === id);
    if (!entry) throw new Error(`Sürüm bulunamadı: ${id}`);
    await download(entry.url, dest, entry.sha1);
  } catch (e) {
    // İnternet yoksa daha önce indirilmiş JSON ile devam et
    if (!fs.existsSync(dest)) throw new Error(`${id} indirilemedi ve daha önce indirilmemiş: ${e.message}`);
  }
  const json = JSON.parse(fs.readFileSync(dest, 'utf8'));
  return { json, type: entry ? entry.type : (json.type || 'release') };
}

// Fabric profilini yazar, MCLC'nin custom alanına verilecek id'yi döndürür
function localFabric(root, game) {
  const dir = path.join(root, 'versions');
  if (!fs.existsSync(dir)) return null;
  const hits = fs.readdirSync(dir)
    .filter(d => d.startsWith('fabric-loader-') && d.endsWith('-' + game) && fs.existsSync(path.join(dir, d, d + '.json')))
    .map(d => ({ d, t: fs.statSync(path.join(dir, d)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return hits.length ? hits[0].d : null;
}

async function ensureFabric(root, game) {
  let loaders;
  try {
    loaders = await fetchJson(`${FABRIC}/versions/loader/${encodeURIComponent(game)}`);
  } catch (e) {
    const local = localFabric(root, game);
    if (local) return { id: local, loader: local.split('-')[2] + ' (çevrimdışı)' };
    throw new Error('Fabric bilgisi alınamadı: ' + e.message);
  }
  if (!loaders.length) throw new Error(`Fabric ${game} sürümünü desteklemiyor. Ayarlardan Vanilla seç.`);
  const stable = loaders.find(l => l.loader.stable) || loaders[0];
  if (!stable) throw new Error('Fabric Loader bulunamadı.');
  const loader = stable.loader.version;
  const id = `fabric-loader-${loader}-${game}`;
  const dest = path.join(root, 'versions', id, `${id}.json`);
  if (!fs.existsSync(dest)) {
    const profile = await fetchJson(`${FABRIC}/versions/loader/${encodeURIComponent(game)}/${encodeURIComponent(loader)}/profile/json`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(profile, null, 2));
  }
  return { id, loader };
}

// "1.20.1" >= "1.20" gibi karşılaştırma (snapshot'lar için false döner)
function atLeast(v, min) {
  const a = v.split('.').map(Number), b = min.split('.').map(Number);
  if (a.some(isNaN)) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}

module.exports = { listVersions, vanillaJson, ensureFabric, atLeast };
