const fs = require('fs');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const store = require('./store');
const auth = require('./auth');
const versions = require('./versions');
const { ensureJava } = require('./java');
const { syncMods } = require('./mods');
const jestron = require('./jestron');
const serversdat = require('./serversdat');
const { MOD_CATALOG } = require('./config');

let running = null; // aktif oyun süreci

function isRunning() { return !!running; }

function kill() {
  if (running && running.proc) { running.killed = true; try { running.proc.kill(); } catch {} }
}

/**
 * @param {object} opts { server?: {host, port} }
 * @param {object} ev   { progress(stage, pct), log(line), started(), closed(code) }
 */
async function launch(opts, evIn) {
  if (running) throw new Error('Oyun zaten açık.');
  running = { proc: null, killed: false };
  // İlerleme çubuğu aşamalar arasında geri gitmesin
  let last = 0;
  const ev = { ...evIn, progress: (stage, pct) => { last = Math.max(last, pct); evIn.progress(stage, last); } };
  try {
    const s = store.getSettings();
    const root = s.gameDir;
    fs.mkdirSync(root, { recursive: true });

    ev.progress('Hesap doğrulanıyor', 0.02);
    const acc = await auth.getLaunchAuth();
    ev.log(`[Jestron] Hesap: ${acc.name} (${acc.type === 'microsoft' ? 'Premium' : 'Offline'})`);

    ev.progress('Sürüm bilgisi alınıyor', 0.05);
    const { json: vjson, type: vtype } = await versions.vanillaJson(root, s.version);

    let custom = null;
    if (s.loader === 'fabric') {
      ev.progress('Fabric hazırlanıyor', 0.08);
      const f = await versions.ensureFabric(root, s.version);
      custom = f.id;
      ev.log(`[Jestron] Fabric Loader ${f.loader}`);
    }

    // Java
    let javaPath = s.javaPath && fs.existsSync(s.javaPath) ? s.javaPath : null;
    if (!javaPath) {
      const comp = vjson.javaVersion ? vjson.javaVersion.component : 'jre-legacy';
      ev.progress(`Java hazırlanıyor (${comp})`, 0.1);
      javaPath = await ensureJava(root, comp, (d, t) => ev.progress(`Java indiriliyor (${d}/${t})`, 0.1 + 0.15 * (d / t)));
    }
    ev.log(`[Jestron] Java: ${javaPath}`);

    // Her sürüm+loader için ayrı oyun klasörü (modlar karışmasın)
    const instanceDir = path.join(root, 'instances', `${s.version}-${s.loader}`);
    fs.mkdirSync(instanceDir, { recursive: true });

    if (s.loader === 'fabric') {
      const ids = [
        ...MOD_CATALOG.filter(m => s.mods[m.id]).map(m => m.id),
        ...(s.extraMods || []).map(m => m.id)
      ];
      const r = await syncMods(instanceDir, s.version, ids,
        (stage, p) => ev.progress(stage, 0.25 + 0.15 * p), ev.log);
      if (r.skipped.length) ev.log(`[Jestron] Bu sürüm için bulunamayan modlar atlandı: ${r.skipped.join(', ')}`);
      if (r.cached) ev.log('[Jestron] Mod listesi değişmedi, önbellekten doğrulandı');
      ev.progress('Jestron modları hazırlanıyor', 0.4);
      try {
        await jestron.ensure(instanceDir, s, ev.log);
      } catch (e) {
        ev.log(`[Jestron] Jestron modları kurulamadı: ${e.message}`);
      }
    }

    // Launcher'daki sunucular oyunun Çok Oyunculu listesine de yazılır
    if (s.syncServers) {
      try {
        const r = serversdat.sync(instanceDir, s.servers || []);
        if (r.added) ev.log(`[Jestron] ${r.added} sunucu oyun içi listeye yazıldı`);
      } catch (e) {
        ev.log(`[Jestron] Sunucu listesi yazılamadı: ${e.message}`);
      }
    }

    // Sunucuya direkt bağlanma
    let quickPlay;
    if (opts && opts.server && opts.server.host) {
      const id = `${opts.server.host}:${opts.server.port || 25565}`;
      quickPlay = versions.atLeast(s.version, '1.20') ? { type: 'multiplayer', identifier: id } : { type: 'legacy', identifier: id };
    }

    const client = new Client();
    const mclcOpts = {
      root,
      authorization: acc.auth,
      version: { number: s.version, type: vtype, ...(custom ? { custom } : {}) },
      memory: { max: `${s.ramMb}M`, min: `${Math.min(1024, s.ramMb)}M` },
      javaPath,
      customArgs: (s.jvmArgs || '').split(/\s+/).filter(Boolean),
      window: s.fullscreen ? { fullscreen: true } : { width: s.width, height: s.height },
      overrides: {
        gameDirectory: instanceDir,
        versionJson: path.join(root, 'versions', s.version, `${s.version}.json`),
        maxSockets: 8,
        detached: false
      },
      ...(quickPlay ? { quickPlay } : {})
    };

    const totals = {};
    client.on('debug', l => ev.log(String(l)));
    client.on('data', l => String(l).split(/\r?\n/).filter(Boolean).forEach(x => ev.log(x)));
    client.on('progress', e => {
      totals[e.type] = e;
      const names = { assets: 'Ses ve dokular', natives: 'Native dosyalar', classes: 'Kütüphaneler', 'assets-copy': 'Dokular kopyalanıyor' };
      const pct = e.total ? e.task / e.total : 0;
      ev.progress(`${names[e.type] || e.type} (${e.task}/${e.total})`, 0.4 + 0.58 * pct);
    });

    ev.progress('Oyun dosyaları kontrol ediliyor', 0.4);
    const proc = await client.launch(mclcOpts);
    if (!proc) throw new Error('Oyun başlatılamadı. Konsol sekmesine bak.');
    running.proc = proc;
    ev.progress('Oyun başlatıldı', 1);
    ev.started();

    const me = running;
    const startedAt = Date.now();
    proc.on('close', code => {
      running = null;
      const played = Date.now() - startedAt;
      try {
        const cur = store.getSettings();
        store.setSettings({ playtimeMs: (cur.playtimeMs || 0) + Math.max(0, played), lastPlayedAt: Date.now() });
      } catch {}
      ev.log(`[Jestron] Oyun kapandı (kod ${code})`);
      ev.closed(code, me.killed);
    });
  } catch (e) {
    running = null;
    throw e;
  }
}

module.exports = { launch, isRunning, kill };
