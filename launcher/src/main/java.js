// Mojang'ın resmi Java runtime'larını indirir (Minecraft launcher'ın kullandığı aynı paketler)
const fs = require('fs');
const path = require('path');
const { fetchJson, download, pool } = require('./net');
const store = require('./store');

const ALL = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

function platformKey() {
  const { platform, arch } = process;
  if (platform === 'win32') return arch === 'arm64' ? 'windows-arm64' : arch === 'ia32' ? 'windows-x86' : 'windows-x64';
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  if (platform === 'linux') return arch === 'ia32' ? 'linux-i386' : 'linux';
  throw new Error('Desteklenmeyen işletim sistemi: ' + platform);
}

function javaBin(dir) {
  if (process.platform === 'win32') return path.join(dir, 'bin', 'javaw.exe');
  if (process.platform === 'darwin') return path.join(dir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(dir, 'bin', 'java');
}

// component: sürüm JSON'undaki javaVersion.component (örn. java-runtime-gamma, jre-legacy)
async function ensureJava(root, component, onProgress) {
  component = component || 'jre-legacy';
  const dir = path.join(root, 'runtime', component);
  const marker = path.join(dir, '.jestron-ok');
  const bin = javaBin(dir);

  // Optimizasyon: Java listesi 6 saat önbellekte; her oyun açılışında Mojang'a istek atılmaz
  let all = store.readCache('java-all', 6 * 60 * 60 * 1000);
  try { if (!all) { all = await fetchJson(ALL); store.writeCache('java-all', all); } }
  catch (e) {
    if (fs.existsSync(marker) && fs.existsSync(bin)) return bin; // daha önce kurulmuş
    throw new Error('Java indirilemedi: ' + e.message);
  }
  const list = (all[platformKey()] || {})[component];
  if (!list || !list.length) throw new Error(`Bu sistem için Java bulunamadı (${component}). Ayarlardan Java yolunu elle gir.`);
  const man = list[0].manifest;

  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === man.sha1 && fs.existsSync(bin)) return bin;

  const data = await fetchJson(man.url);
  const entries = Object.entries(data.files);

  for (const [rel, f] of entries) if (f.type === 'directory') fs.mkdirSync(path.join(dir, rel), { recursive: true });

  const files = entries.filter(([, f]) => f.type === 'file');
  await pool(files, 16, async ([rel, f]) => {
    const dest = path.join(dir, rel);
    await download(f.downloads.raw.url, dest, f.downloads.raw.sha1);
    if (f.executable && process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  }, (d, t) => onProgress && onProgress(d, t));

  if (process.platform !== 'win32') {
    for (const [rel, f] of entries) {
      if (f.type !== 'link') continue;
      const p = path.join(dir, rel);
      try { fs.unlinkSync(p); } catch {}
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.symlinkSync(f.target, p);
    }
  }

  if (!fs.existsSync(bin)) throw new Error('Java kurulumu tamamlanamadı.');
  fs.writeFileSync(marker, man.sha1);
  return bin;
}

module.exports = { ensureJava };
