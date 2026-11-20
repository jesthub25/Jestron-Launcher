// Launcher'daki sunucuları oyunun "Çok Oyunculu" listesine (servers.dat) yazar.
// Oyuncunun oyun içinden eklediği sunuculara dokunulmaz; launcher'ın daha önce eklediği ama
// artık listede olmayan sunucular kaldırılır. Sunucu ikonları (favicon) korunur.
'use strict';
const fs = require('fs');
const path = require('path');
const nbt = require('./nbt');

const { T } = nbt;

function key(host, port) {
  return String(host).trim().toLowerCase() + ':' + (parseInt(port, 10) || 25565);
}
function ipString(s) {
  return s.port && s.port !== 25565 ? `${s.host}:${s.port}` : s.host;
}
function keyFromIp(ip) {
  const m = String(ip || '').trim().toLowerCase().match(/^(.+?)(?::(\d+))?$/);
  if (!m) return '';
  return key(m[1], m[2] || 25565);
}

function readTrack(f) {
  try { const a = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(a) ? a : []; } catch { return []; }
}

/**
 * @param {string} gameDir instance klasörü (servers.dat burada)
 * @param {{name:string, host:string, port:number}[]} servers
 * @returns {{added:number, kept:number}}
 */
function sync(gameDir, servers) {
  fs.mkdirSync(gameDir, { recursive: true });
  const datFile = path.join(gameDir, 'servers.dat');
  const trackFile = path.join(gameDir, '.jestron-servers.json');
  const prevOurs = new Set(readTrack(trackFile));

  let name = '';
  let entries = [];
  let original = null;
  if (fs.existsSync(datFile)) {
    try {
      original = fs.readFileSync(datFile);
      const parsed = nbt.parse(original);
      name = parsed.name;
      const list = nbt.get(parsed.root.v, 'servers');
      if (list && list.t === T.LIST && list.v.et === T.COMPOUND) entries = list.v.items;
    } catch (e) {
      // bozuk dosyayı silme, kenara al
      try { fs.copyFileSync(datFile, datFile + '.bozuk'); } catch {}
      entries = [];
    }
  }

  const ipOf = c => { const t = nbt.get(c, 'ip'); return t && t.t === T.STRING ? t.v : ''; };
  const ourKeys = servers.map(s => key(s.host, s.port));
  const ourSet = new Set(ourKeys);

  const kept = entries.filter(c => {
    const k = keyFromIp(ipOf(c));
    return !prevOurs.has(k) && !ourSet.has(k);
  });
  const ours = servers.map(s => {
    const k = key(s.host, s.port);
    const old = entries.find(c => keyFromIp(ipOf(c)) === k);
    const c = old ? old.map(([n, t]) => [n, t]) : [];
    nbt.set(c, 'name', { t: T.STRING, v: String(s.name || s.host).slice(0, 64) });
    nbt.set(c, 'ip', { t: T.STRING, v: ipString(s) });
    return c;
  });

  const all = [...ours, ...kept];
  const root = { t: T.COMPOUND, v: [['servers', { t: T.LIST, v: { et: T.COMPOUND, items: all } }]] };
  const buf = nbt.serialize(name, root);
  if (!original || !original.equals(buf)) {
    const tmp = datFile + '.jestron-tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, datFile);
  }
  fs.writeFileSync(trackFile, JSON.stringify(ourKeys));
  return { added: ours.length, kept: kept.length };
}

module.exports = { sync, key, keyFromIp };
