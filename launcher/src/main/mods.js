// Modrinth üzerinden Fabric mod kurulumu (zorunlu bağımlılıklar otomatik çözülür)
const fs = require('fs');
const path = require('path');
const { fetchJson, download, pool } = require('./net');

const API = 'https://api.modrinth.com/v2';
const RESOLVE_TTL = 6 * 60 * 60 * 1000;
const q = o => encodeURIComponent(JSON.stringify(o));

function pickVersion(list) {
  return list.find(v => v.version_type === 'release') || list[0] || null;
}

async function versionFor(project, game) {
  const list = await fetchJson(`${API}/project/${encodeURIComponent(project)}/version?loaders=${q(['fabric'])}&game_versions=${q([game])}`);
  return pickVersion(list);
}

async function syncMods(instanceDir, game, projects, onProgress, log) {
  const modsDir = path.join(instanceDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const manPath = path.join(modsDir, '.jestron.json');
  let man = { files: [] };
  try { man = JSON.parse(fs.readFileSync(manPath, 'utf8')); } catch {}

  // Optimizasyon: aynı mod listesi 6 saat içinde tekrar çözülmez (Modrinth'e onlarca istek atılmaz)
  const key = game + '|' + [...new Set(projects)].sort().join(',');
  const fresh = man.key === key && Array.isArray(man.resolved) && typeof man.at === 'number' && Date.now() - man.at < RESOLVE_TTL;
  if (fresh && man.resolved.every(w => w && safeName(w.filename) && typeof w.url === 'string')) {
    onProgress && onProgress('Modlar kontrol ediliyor', 0.5);
    await pool(man.resolved, 6, async w => {
      try {
        const changed = await download(w.url, path.join(modsDir, w.filename), w.sha1);
        if (changed) log && log(`[Mod] Yeniden indirildi: ${w.filename}`);
      } catch (e) {
        throw new Error(`Mod indirilemedi (${w.filename}): ${e.message}`);
      }
    }, (d, t) => onProgress && onProgress(`Modlar kontrol ediliyor (${d}/${t})`, d / t));
    return { installed: man.resolved.length, skipped: man.skipped || [], cached: true };
  }

  const resolved = new Map(); // project_id -> { versionId, url, filename, sha1 }
  const skipped = [];
  const seen = new Set();
  let netError = false;

  // Optimizasyon: üst düzey modların sürüm bilgisi paralel (6'şar) önceden istenir; çözümleme sırası aynı kalır
  const pending = new Map();
  const fetchVer = (project, versionId) => {
    const k = versionId ? 'v:' + versionId : 'p:' + project;
    if (!pending.has(k)) {
      const pr = versionId ? fetchJson(`${API}/version/${encodeURIComponent(versionId)}`) : versionFor(project, game);
      pr.catch(() => {}); // yakalanmamış hata uyarısı olmasın; hata resolve() içinde ele alınır
      pending.set(k, pr);
    }
    return pending.get(k);
  };
  await pool([...new Set(projects)], 6, async pr => { try { await fetchVer(pr, null); } catch {} });

  async function resolve(project, versionId, parentName, root) {
    const rootOf = root || project; // launcher'da hangi ayarın bu dosyayı getirdiği (katalog / eklenen mod)
    if (!versionId && seen.has(project)) return;
    seen.add(project);
    let v;
    try {
      v = await fetchVer(project, versionId);
    } catch (e) {
      if (String(e.message).startsWith('HTTP 404')) v = null;
      else { netError = true; log && log(`[Mod] ${project} alınamadı: ${e.message}`); return; }
    }
    if (!v) {
      skipped.push(parentName ? `${project} (${parentName} için)` : project);
      return;
    }
    const cur = resolved.get(v.project_id);
    // Zaten seçiliyse dur; sadece sabit sürüm isteyen bağımlılık (ör. Iris -> Sodium) üzerine yazabilir
    if (cur && (cur.versionId === v.id || !versionId)) return;
    seen.add(v.project_id);
    const f = (v.files || []).find(x => x.primary) || (v.files || [])[0];
    if (!f || !safeName(f.filename)) { skipped.push(project); return; }
    resolved.set(v.project_id, { versionId: v.id, url: f.url, filename: f.filename, sha1: f.hashes && f.hashes.sha1, root: rootOf, dep: !!parentName });
    for (const d of v.dependencies || []) {
      if (d.dependency_type !== 'required' || !d.project_id) continue;
      await resolve(d.project_id, d.version_id || null, project, rootOf);
    }
  }

  for (let i = 0; i < projects.length; i++) {
    onProgress && onProgress(`Modlar çözülüyor (${i + 1}/${projects.length})`, i / projects.length);
    await resolve(projects[i]);
    if (netError) break;
  }

  // İnternet/Modrinth sorunu: hiçbir şeyi silme, mevcut modlarla devam et
  if (netError) {
    log && log('[Mod] Modrinth\'e ulaşılamadı, mevcut modlar korunuyor.');
    return { installed: (man.files || []).length, skipped: [], offline: true };
  }

  // Önce bağımlılık olarak gelen ama kullanıcının kendisinin de istediği mod: sahibi kendisi olsun
  for (const pr of new Set(projects)) {
    try {
      const v = await pending.get('p:' + pr);
      const r = v && resolved.get(v.project_id);
      if (r) { r.root = pr; r.dep = false; }
    } catch {}
  }
  const wanted = [...resolved.values()];
  const wantedNames = new Set(wanted.map(w => w.filename));

  // Daha önce launcher'ın kurduğu ama artık istenmeyen dosyaları sil (kullanıcının kendi modlarına dokunma)
  for (const old of Array.isArray(man.files) ? man.files : []) {
    if (!wantedNames.has(old) && safeName(old)) {
      try { fs.unlinkSync(path.join(modsDir, old)); log && log(`[Mod] Kaldırıldı: ${old}`); } catch {}
    }
  }

  await pool(wanted, 6, async w => {
    try {
      const changed = await download(w.url, path.join(modsDir, w.filename), w.sha1);
      if (changed) log && log(`[Mod] İndirildi: ${w.filename}`);
    } catch (e) {
      throw new Error(`Mod indirilemedi (${w.filename}): ${e.message}`);
    }
  }, (d, t) => onProgress && onProgress(`Modlar indiriliyor (${d}/${t})`, d / t));

  fs.writeFileSync(manPath, JSON.stringify({
    game, key, at: Date.now(), files: [...wantedNames], skipped,
    resolved: wanted.map(w => ({ url: w.url, filename: w.filename, sha1: w.sha1, root: w.root, dep: w.dep }))
  }, null, 2));
  return { installed: wanted.length, skipped };
}

const TYPES = {
  mod: { facet: 'mod', dir: 'mods' },
  resourcepack: { facet: 'resourcepack', dir: 'resourcepacks' },
  shader: { facet: 'shader', dir: 'shaderpacks' }
};

async function searchProjects(query, game, type = 'mod') {
  const t = TYPES[type] ? type : 'mod';
  const facets = [[`versions:${game}`], [`project_type:${TYPES[t].facet}`]];
  if (t === 'mod') facets.unshift(['categories:fabric']);
  const r = await fetchJson(`${API}/search?query=${encodeURIComponent(String(query || '').slice(0, 80))}&facets=${q(facets)}&limit=24`);
  return (r.hits || []).map(h => ({
    id: h.slug, name: h.title, desc: h.description, icon: h.icon_url, downloads: h.downloads, author: h.author, type: t
  }));
}

function safeName(n) {
  return typeof n === 'string' && n.length > 0 && n.length < 200 && !/[\\/]|\.\./.test(n) && !n.startsWith('.');
}

/** Kaynak paketi ya da shader paketini instance klasörüne indirir. */
async function installPack(instanceDir, slug, game, type) {
  if (type !== 'resourcepack' && type !== 'shader') throw new Error('Geçersiz paket türü');
  if (!/^[a-z0-9_\-]+$/i.test(slug)) throw new Error('Geçersiz paket');
  const list = await fetchJson(`${API}/project/${encodeURIComponent(slug)}/version?game_versions=${q([game])}`);
  const v = pickVersion(list);
  if (!v) throw new Error(`${game} için uygun sürüm yok`);
  const f = v.files.find(x => x.primary) || v.files[0];
  if (!f || !safeName(f.filename)) throw new Error('Paket dosyası bulunamadı');
  const dir = path.join(instanceDir, TYPES[type].dir);
  fs.mkdirSync(dir, { recursive: true });
  await download(f.url, path.join(dir, f.filename), f.hashes && f.hashes.sha1);
  return f.filename;
}

function listPacks(instanceDir) {
  const read = d => {
    try {
      return fs.readdirSync(path.join(instanceDir, d), { withFileTypes: true })
        .filter(e => !e.name.startsWith('.') && (e.isDirectory() || /\.zip$/i.test(e.name)))
        .map(e => e.name).sort((a, b) => a.localeCompare(b));
    } catch { return []; }
  };
  return { resourcepack: read('resourcepacks'), shader: read('shaderpacks') };
}

function packPath(instanceDir, type, name) {
  if (!TYPES[type] || type === 'mod' || !safeName(name)) throw new Error('Geçersiz paket');
  return path.join(instanceDir, TYPES[type].dir, name);
}

module.exports = { syncMods, searchProjects, installPack, listPacks, packPath };
