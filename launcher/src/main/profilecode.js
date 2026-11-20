// Profil kodu: bir profili kısa bir metne çevirir (paylaşmak için) ve geri okur.
// Kod sadece ayar taşır; dosya yolu, Java yolu ve tehlikeli JVM argümanları asla koda girmez / koddan alınmaz.
'use strict';
const zlib = require('zlib');
const { MOD_CATALOG } = require('./config');

const PREFIX = 'JST1-';
const MAX_CODE = 12000;

// Paylaşılan kodlarda izin verilen JVM bayrakları (performans / GC). Diğer her şey atılır:
// ör. -XX:OnOutOfMemoryError=komut, -javaagent:, -Dx=y, -XX:Flags=dosya gibi argümanlar komut çalıştırabilir ya da dosya okuyabilir.
const SAFE_XX = new Set([
  'UseG1GC', 'UseZGC', 'ZGenerational', 'UseShenandoahGC', 'UseParallelGC', 'ParallelRefProcEnabled', 'MaxGCPauseMillis',
  'UnlockExperimentalVMOptions', 'DisableExplicitGC', 'AlwaysPreTouch', 'G1NewSizePercent', 'G1MaxNewSizePercent',
  'G1HeapRegionSize', 'G1ReservePercent', 'G1HeapWastePercent', 'G1MixedGCCountTarget', 'InitiatingHeapOccupancyPercent',
  'G1MixedGCLiveThresholdPercent', 'G1RSetUpdatingPauseTimePercent', 'SurvivorRatio', 'MaxTenuringThreshold',
  'PerfDisableSharedMem', 'UseStringDeduplication', 'UseCompressedOops', 'ParallelGCThreads', 'ConcGCThreads', 'UseNUMA',
  'UseFastUnorderedTimeStamps', 'UseCriticalJavaThreadPriority', 'OmitStackTraceInFastThrow'
]);

/** Güvenli JVM argümanlarını süzer. @returns {{args: string, dropped: string[]}} */
function safeJvmArgs(str) {
  const keep = [], dropped = [];
  for (const t of String(str || '').split(/\s+/).filter(Boolean).slice(0, 60)) {
    const m = /^-XX:([+-]?)([A-Za-z0-9]+)(?:=([A-Za-z0-9.%]{1,16}))?$/.exec(t);
    const ok = m && SAFE_XX.has(m[2]) && (m[1] ? m[3] === undefined : m[3] !== undefined);
    const xss = /^-Xss[0-9]{1,5}[kKmM]$/.test(t);
    if (ok || xss) keep.push(t);
    else dropped.push(t.slice(0, 60));
  }
  return { args: keep.join(' '), dropped };
}

const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.\-_ ]{0,31}$/; // başta harf/rakam: '..' gibi yol parçaları olamaz
const ID_RE = /^[a-z0-9_\-]{1,64}$/i;
const HOST_RE = /^[a-z0-9.\-_]{1,253}$/i;
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

function encode(p) {
  const o = {
    n: p.name, c: p.color, v: p.version, l: p.loader === 'vanilla' ? 'v' : 'f',
    m: MOD_CATALOG.filter(m => !m.required && p.mods && p.mods[m.id]).map(m => m.id),
    x: (p.extraMods || []).map(m => [m.id, m.name]),
    j: (p.jestronClient ? 1 : 0) | (p.efektMenu ? 2 : 0),
    r: p.ramMb, p: p.preset, w: p.width, h: p.height, f: p.fullscreen ? 1 : 0
  };
  const jvm = safeJvmArgs(p.jvmArgs).args;
  if (jvm) o.a = jvm;
  if (p.server && p.server.host) o.s = p.server.port && p.server.port !== 25565 ? `${p.server.host}:${p.server.port}` : p.server.host;
  return PREFIX + zlib.deflateRawSync(Buffer.from(JSON.stringify(o), 'utf8'), { level: 9 }).toString('base64url');
}

/**
 * Kodu okur ve doğrulanmış bir profil yaması döndürür (store.cleanProfile ayrıca sınırlar).
 * @returns {{profile: object, dropped: string[]}}
 */
function decode(code) {
  const s = String(code || '').replace(/\s+/g, '');
  if (!s) throw new Error('Profil kodu boş.');
  if (!s.startsWith(PREFIX)) throw new Error('Bu bir Jestron profil kodu değil (JST1- ile başlamalı).');
  if (s.length > MAX_CODE) throw new Error('Profil kodu çok uzun.');
  let o;
  try {
    const raw = zlib.inflateRawSync(Buffer.from(s.slice(PREFIX.length), 'base64url'), { maxOutputLength: 65536 });
    o = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error('Profil kodu bozuk ya da eksik kopyalanmış.');
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Profil kodu bozuk.');

  const dropped = [];
  const p = {};
  p.name = clean(o.n, 32) || 'Paylaşılan profil';
  p.color = Number.isInteger(o.c) ? o.c : 0;
  if (typeof o.v === 'string' && VERSION_RE.test(o.v)) p.version = o.v;
  else if (o.v !== undefined) dropped.push('sürüm');
  p.loader = o.l === 'v' ? 'vanilla' : 'fabric';

  const known = new Set(MOD_CATALOG.map(m => m.id));
  p.mods = {};
  for (const m of MOD_CATALOG) p.mods[m.id] = !!m.required;
  for (const id of Array.isArray(o.m) ? o.m.slice(0, 100) : []) {
    if (typeof id === 'string' && known.has(id)) p.mods[id] = true;
    else dropped.push(`mod: ${clean(id, 40)}`);
  }
  p.extraMods = [];
  const seen = new Set();
  for (const e of Array.isArray(o.x) ? o.x.slice(0, 100) : []) {
    const id = Array.isArray(e) ? e[0] : null;
    if (typeof id !== 'string' || !ID_RE.test(id) || known.has(id) || seen.has(id)) { dropped.push(`mod: ${clean(id, 40)}`); continue; }
    seen.add(id);
    p.extraMods.push({ id, name: clean(e[1], 64) || id, desc: 'Profil kodundan eklendi', icon: '' });
  }
  const j = Number.isInteger(o.j) ? o.j : 3;
  p.jestronClient = !!(j & 1);
  p.efektMenu = !!(j & 2);
  if (Number.isFinite(o.r)) p.ramMb = o.r;
  p.preset = ['low', 'balanced', 'high', 'custom'].includes(o.p) ? o.p : 'custom';
  if (Number.isFinite(o.w)) p.width = o.w;
  if (Number.isFinite(o.h)) p.height = o.h;
  p.fullscreen = o.f === 1;
  if (typeof o.a === 'string') {
    const r = safeJvmArgs(o.a);
    p.jvmArgs = r.args;
    for (const d of r.dropped) dropped.push(`JVM: ${d}`);
  }
  if (typeof o.s === 'string') {
    const m = /^([a-z0-9.\-_]+)(?::(\d{1,5}))?$/i.exec(o.s);
    const port = m && m[2] ? parseInt(m[2], 10) : 25565;
    if (m && HOST_RE.test(m[1]) && port >= 1 && port <= 65535) p.server = { host: m[1].toLowerCase(), port };
    else dropped.push('sunucu');
  }
  return { profile: p, dropped };
}

module.exports = { encode, decode, safeJvmArgs, PREFIX };
