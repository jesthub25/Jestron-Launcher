'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ACCENTS = [
  { name: 'Mürekkep', light: '#18181b', dark: '#f4f4f5' },
  { name: 'Turuncu', light: '#ea580c', dark: '#f97316' },
  { name: 'Mavi', light: '#2563eb', dark: '#3b82f6' },
  { name: 'Yeşil', light: '#16a34a', dark: '#22c55e' },
  { name: 'Mor', light: '#7c3aed', dark: '#8b5cf6' },
  { name: 'Pembe', light: '#db2777', dark: '#ec4899' }
];

const PROFILE_COLORS = ['#27272a', '#ea580c', '#2563eb', '#16a34a', '#7c3aed', '#db2777', '#0891b2', '#ca8a04'];

const S = {
  info: null, settings: null, accounts: { list: [], selected: null, canOffline: false },
  versions: [], modCat: 'Tümü', searchType: 'mod', lastHits: [], running: false, launching: false,
  pingCache: new Map(), efekt: null, update: null, editId: null, searchSeq: 0
};

// ---------- profiller: yardımcılar ----------
const profById = id => (S.settings.profiles || []).find(p => p.id === id) || null;
const P = () => profById(S.settings.profileId) || S.settings.profiles[0];   // seçili (oynanacak) profil
const EP = () => profById(S.editId) || P();                                  // düzenlenen profil
const pColor = p => PROFILE_COLORS[(p && p.color) || 0] || PROFILE_COLORS[0];
const ramText = mb => (mb / 1024).toFixed(1).replace('.0', '') + ' GB';
async function saveProfile(patch, id = P().id) {
  try { S.settings = await call(window.api.prof.update(id, patch)); afterSettings(); return true; } catch { return false; }
}
const saveProfileDeb = (() => {
  const timers = new Map(), patches = new Map();
  return (patch, id) => {
    patches.set(id, { ...(patches.get(id) || {}), ...patch });
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => { const p = patches.get(id); patches.delete(id); timers.delete(id); saveProfile(p, id); }, 400));
  };
})();
const PING_TTL = 30000;

// ---------- yardımcılar ----------
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, 4200);
  setTimeout(() => t.remove(), 4600);
}
async function call(p, quiet) {
  const r = await p;
  if (!r || !r.ok) { const e = r ? r.error : 'Bilinmeyen hata'; if (!quiet) toast(e, 'err'); throw new Error(e); }
  return r.data;
}
const debounce = (fn, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmtNum = n => new Intl.NumberFormat('tr-TR').format(n);
function parseHost(str) {
  const m = String(str || '').trim().match(/^([a-z0-9.\-_]+)(?::(\d{1,5}))?$/i);
  if (!m) return null;
  const port = m[2] ? parseInt(m[2], 10) : 25565;
  if (port < 1 || port > 65535) return null;
  return { host: m[1].toLowerCase(), port };
}
function fmtDuration(ms) {
  const m = Math.floor((ms || 0) / 60000);
  if (m < 1) return 'Henüz oynanmadı';
  const h = Math.floor(m / 60);
  return h ? `${h} sa ${m % 60} dk` : `${m} dk`;
}
const icon = {
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  starFill: '<svg viewBox="0 0 24 24" class="fill"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  play: '<svg viewBox="0 0 24 24" class="fill"><path d="M7 4.5v15l13-7.5z"/></svg>'
};

// ---------- tema ----------
function applyTheme() {
  const s = S.settings;
  const root = document.documentElement;
  root.classList.toggle('dark', !!s.dark);
  const a = ACCENTS[s.accent] || ACCENTS[0];
  root.style.setProperty('--accent', s.dark ? a.dark : a.light);
  root.style.setProperty('--on-accent', s.dark && s.accent === 0 ? '#18181b' : '#ffffff');
  try { localStorage.setItem('jl-theme', JSON.stringify({ dark: !!s.dark, accent: s.accent })); } catch {}
}
(function earlyTheme() {
  try {
    const t = JSON.parse(localStorage.getItem('jl-theme') || 'null');
    if (t) { S.settings = { dark: t.dark, accent: t.accent }; applyTheme(); S.settings = null; }
  } catch {}
})();

// ---------- gezinme ----------
function go(page) {
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  const nav = page === 'profile' ? 'profiles' : page;
  $$('#sidebar .nav').forEach(n => n.classList.toggle('active', n.dataset.page === nav));
  closeProfMenu();
  if (page === 'profiles') renderProfiles();
  if (page === 'servers') renderServers(true);
  if (page === 'gallery') loadShots();
  if (page === 'mods') renderPacks();
  if (page === 'console') { const l = $('#log'); l.scrollTop = l.scrollHeight; }
}
document.addEventListener('click', e => {
  const ep = e.target.closest('[data-editprof]');
  if (ep) { e.preventDefault(); openEditor(P().id); return; }
  const el = e.target.closest('[data-page]');
  if (el) { e.preventDefault(); go(el.dataset.page); return; }
  const op = e.target.closest('[data-open]');
  if (op) call(window.api.openSub(op.dataset.open)).catch(() => {});
});
$$('[data-win]').forEach(b => b.addEventListener('click', () => window.api.win[b.dataset.win]()));

// ---------- avatar / hesaplar ----------
const selectedAcc = () => S.accounts.list.find(a => a.id === S.accounts.selected) || null;
function setAvatar(box, acc) {
  const img = box.querySelector('img');
  box.querySelector('.initial').textContent = acc ? acc.name[0].toUpperCase() : '?';
  if (!acc) { img.classList.remove('ok'); img.removeAttribute('src'); return; }
  // Resim yüklenene kadar baş harf görünür; internet yoksa bozuk resim simgesi çıkmaz
  img.classList.remove('ok');
  img.onload = () => img.classList.add('ok');
  img.onerror = () => { img.classList.remove('ok'); img.removeAttribute('src'); };
  img.src = acc.type === 'microsoft' ? `https://mc-heads.net/avatar/${encodeURIComponent(acc.uuid)}/64` : 'https://mc-heads.net/avatar/MHF_Steve/64';
}
function renderAccounts() {
  const acc = selectedAcc();
  setAvatar($('#side-acc .avatar'), acc);
  $('#side-name').textContent = acc ? acc.name : 'Hesap yok';
  $('#side-type').textContent = acc ? (acc.type === 'microsoft' ? 'Premium' : 'Offline') : 'Giriş yap';
  $('#greet').innerHTML = acc ? `İyi oyunlar,<br>${esc(acc.name)}.` : 'İyi oyunlar.';

  const can = S.accounts.canOffline;
  $('#offline-card').classList.toggle('locked', !can);
  $('#offline-pill').textContent = can ? 'Açık' : 'Kilitli';
  $('#offline-pill').classList.toggle('ok', can);
  $('#offline-desc').textContent = can ? 'Offline-mode sunucular ve test için kullanıcı adıyla hesap ekle.' : 'Offline hesap için önce Minecraft sahibi bir Microsoft hesabı ekle.';
  $('#acc-off-name').disabled = !can;
  $('#acc-off').disabled = !can;

  const list = $('#acc-list');
  if (!S.accounts.list.length) { list.innerHTML = '<div class="empty">Henüz hesap yok. Microsoft ile giriş yaparak başla.</div>'; return; }
  list.innerHTML = S.accounts.list.map(a => `
    <div class="acc ${a.id === S.accounts.selected ? 'sel' : ''}" data-id="${esc(a.id)}">
      <span class="avatar"><img alt=""><span class="initial"></span></span>
      <span class="acc-text"><b>${esc(a.name)}</b><span class="acc-type ${a.type === 'microsoft' ? 'premium' : 'offline'}">${a.type === 'microsoft' ? 'PREMIUM' : 'OFFLINE'}</span></span>
      <button class="icon-btn danger" data-del="${esc(a.id)}" aria-label="Sil" type="button">${icon.trash}</button>
    </div>`).join('');
  $$('#acc-list .acc').forEach(el => setAvatar(el.querySelector('.avatar'), S.accounts.list.find(a => a.id === el.dataset.id)));
}
$('#acc-list').addEventListener('click', async e => {
  const del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); try { S.accounts = await call(window.api.acc.remove(del.dataset.del)); renderAccounts(); } catch {} return; }
  const row = e.target.closest('.acc');
  if (row) { try { S.accounts = await call(window.api.acc.select(row.dataset.id)); renderAccounts(); } catch {} }
});
$('#acc-ms').addEventListener('click', async () => {
  const b = $('#acc-ms'); b.disabled = true;
  try { S.accounts = await call(window.api.acc.addMicrosoft()); renderAccounts(); toast('Premium hesap eklendi: ' + selectedAcc().name, 'ok'); }
  catch {} finally { b.disabled = false; }
});
async function addOffline() {
  try { S.accounts = await call(window.api.acc.addOffline($('#acc-off-name').value)); $('#acc-off-name').value = ''; renderAccounts(); toast('Offline hesap eklendi', 'ok'); } catch {}
}
$('#acc-off').addEventListener('click', addOffline);
$('#acc-off-name').addEventListener('keydown', e => { if (e.key === 'Enter') addOffline(); });

// ---------- ayarlar ----------
async function save(patch) {
  try { S.settings = await call(window.api.settings.set(patch)); afterSettings(); } catch {}
}
const saveDeb = debounce(save);
function afterSettings() {
  applyTheme();
  const s = S.settings, p = P(), e = EP();
  $$('#set-loader button').forEach(b => b.classList.toggle('active', b.dataset.v === e.loader));
  $$('#set-preset button').forEach(b => b.classList.toggle('active', b.dataset.v === e.preset));
  $$('#pf-color button').forEach((b, i) => b.classList.toggle('active', i === e.color));
  $$('#set-accent button').forEach((b, i) => b.classList.toggle('active', i === s.accent));
  $('#mods-vanilla-warn').classList.toggle('hidden', p.loader === 'fabric');
  $('#mods-sub').textContent = `Profil: ${p.name} · ${p.version} — modlar oyun başlarken otomatik kurulur.`;
  renderEditorInfo();
  renderHome();
  if ($('#page-profiles').classList.contains('active')) renderProfiles();
}
function ramFill() {
  const r = $('#set-ram');
  r.style.setProperty('--fill', ((r.value - r.min) / Math.max(1, r.max - r.min) * 100) + '%');
  $('#ram-val').textContent = (r.value / 1024).toFixed(1).replace('.0', '') + ' GB';
}
/** Genel (profilden bağımsız) ayarları forma yazar. */
function bindSettings() {
  const s = S.settings;
  $('#set-dark').checked = !!s.dark;
  $('#set-accent').innerHTML = ACCENTS.map((a, i) => `<button type="button" data-i="${i}" title="${esc(a.name)}" aria-label="${esc(a.name)}" style="background:${a.light}"></button>`).join('');
  $('#pf-color').innerHTML = PROFILE_COLORS.map((c, i) => `<button type="button" data-i="${i}" aria-label="Renk ${i + 1}" style="background:${c}"></button>`).join('');
  $('#set-snap').checked = !!s.showSnapshots;
  const r = $('#set-ram');
  r.max = Math.max(2048, Math.floor(S.info.maxRamMb / 512) * 512);
  $('#ram-hint').textContent = `Bilgisayar: ${(S.info.totalRamMb / 1024).toFixed(1)} GB · Önerilen: 4–6 GB`;
  $('#set-onlaunch').value = s.onLaunch;
  $('#set-upd').checked = !!s.checkUpdates;
  $('#set-java').value = s.javaPath;
  $('#set-dir').value = s.gameDir;
  $('#srv-sync').checked = !!s.syncServers;
  $('#about').textContent = `${S.info.name} v${S.info.version} · github.com/${S.info.repo}`;
  bindProfileEditor();
}

/** Düzenlenen profilin değerlerini forma yazar (sayfa açılınca ve ön ayardan sonra). */
function bindProfileEditor() {
  const p = EP();
  $('#pf-name').value = p.name;
  const r = $('#set-ram');
  r.value = Math.min(Number(r.max), p.ramMb);
  ramFill();
  $('#set-jvm').value = p.jvmArgs;
  $('#set-w').value = p.width; $('#set-h').value = p.height;
  $('#set-fs').checked = !!p.fullscreen;
  $('#pf-java').value = p.javaPath || '';
  const srv = S.settings.servers || [];
  const cur = p.server ? `${p.server.host}:${p.server.port}` : '';
  const opts = [`<option value="">Kapalı (ana menü)</option>`, ...srv.map(x => `<option value="${esc(x.host + ':' + x.port)}">${esc(x.name)} — ${esc(x.host)}${x.port !== 25565 ? ':' + x.port : ''}</option>`)];
  if (cur && !srv.some(x => `${x.host}:${x.port}` === cur)) opts.push(`<option value="${esc(cur)}">${esc(cur)}</option>`);
  $('#pf-server').innerHTML = opts.join('');
  $('#pf-server').value = cur;
  setVersionSelect();
  afterSettings();
}
function renderEditorInfo() {
  const p = EP();
  if (!p) return;
  const mc = activeModCount(p);
  $('#pf-title').textContent = p.name;
  $('#pf-sub').textContent = `${p.version} · ${p.loader === 'fabric' ? 'Fabric' : 'Vanilla'}${p.id === S.settings.profileId ? ' · Seçili profil' : ''}`;
  $('#pf-mods').textContent = p.loader === 'fabric' ? `${mc.n} mod aktif${mc.names.length ? ': ' + mc.names.slice(0, 4).join(', ') + (mc.names.length > 4 ? '…' : '') : ''}` : 'Vanilla: mod yok';
  $('#pf-dir').textContent = 'instances/' + p.dir;
  $('#pf-stats').textContent = `Oyun süresi ${fmtDuration(p.playtimeMs)} · ${p.lastPlayedAt ? 'Son oynama ' + new Date(p.lastPlayedAt).toLocaleDateString('tr-TR') : 'Hiç oynanmadı'}`;
  $('#pf-del').disabled = S.settings.profiles.length <= 1;
}
function openEditor(id) {
  S.editId = id;
  bindProfileEditor();
  go('profile');
}
async function loadVersions() {
  try { S.versions = (await call(window.api.versions(S.settings.showSnapshots), true)).versions; }
  catch { S.versions = []; toast('Sürüm listesi alınamadı (internet?)', 'err'); }
  setVersionSelect();
}
function setVersionSelect() {
  const sel = $('#set-version');
  const cur = EP().version;
  const list = S.versions.length ? S.versions : [{ id: cur, fabric: true }];
  sel.innerHTML = list.map(v => `<option value="${esc(v.id)}">${esc(v.id)}${v.id === S.info.jestronMc ? '  ★ Jestron' : ''}${v.type === 'snapshot' ? ' (snapshot)' : ''}${v.fabric ? '' : ' — Fabric yok'}</option>`).join('');
  if (!list.some(v => v.id === cur)) sel.insertAdjacentHTML('afterbegin', `<option value="${esc(cur)}">${esc(cur)}</option>`);
  sel.value = cur;
}
$('#set-dark').addEventListener('change', e => save({ dark: e.target.checked }));
$('#set-accent').addEventListener('click', e => { const b = e.target.closest('button'); if (b) save({ accent: Number(b.dataset.i) }); });
// ---- profil düzenleyici
$('#set-version').addEventListener('change', e => {
  const p = EP();
  const v = S.versions.find(x => x.id === e.target.value);
  const patch = { version: e.target.value };
  if (v && !v.fabric && p.loader === 'fabric') { patch.loader = 'vanilla'; toast(`Fabric ${v.id} desteklemiyor, Vanilla'ya geçildi.`); }
  if (e.target.value !== S.info.jestronMc && (p.jestronClient || p.efektMenu)) toast(`Jestron Client ve Efekt Menüsü sadece ${S.info.jestronMc}'te çalışır.`);
  saveProfile(patch, p.id);
});
$('#set-snap').addEventListener('change', async e => { await save({ showSnapshots: e.target.checked }); loadVersions(); });
$('#set-loader').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const p = EP();
  const v = S.versions.find(x => x.id === p.version);
  if (b.dataset.v === 'fabric' && v && !v.fabric) return toast(`Fabric ${v.id} sürümünü desteklemiyor.`, 'err');
  saveProfile({ loader: b.dataset.v }, p.id);
});
$('#set-preset').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  try { S.settings = await call(window.api.prof.preset(EP().id, b.dataset.v)); bindProfileEditor(); renderMods(); toast('Ön ayar uygulandı: ' + b.textContent, 'ok'); } catch {}
});
$('#set-ram').addEventListener('input', () => { ramFill(); saveProfileDeb({ ramMb: Number($('#set-ram').value), preset: 'custom' }, EP().id); });
$('#set-jvm').addEventListener('input', e => saveProfileDeb({ jvmArgs: e.target.value, preset: 'custom' }, EP().id));
$('#set-w').addEventListener('change', e => saveProfile({ width: Number(e.target.value) || 1280 }, EP().id));
$('#set-h').addEventListener('change', e => saveProfile({ height: Number(e.target.value) || 720 }, EP().id));
$('#set-fs').addEventListener('change', e => saveProfile({ fullscreen: e.target.checked }, EP().id));
$('#pf-name').addEventListener('change', async e => {
  const v = e.target.value.trim();
  if (!v) { e.target.value = EP().name; return; }
  if (await saveProfile({ name: v }, EP().id)) e.target.value = EP().name;
});
$('#pf-color').addEventListener('click', e => { const b = e.target.closest('button'); if (b) saveProfile({ color: Number(b.dataset.i) }, EP().id); });
$('#pf-java').addEventListener('input', e => saveProfileDeb({ javaPath: e.target.value.trim() }, EP().id));
$('#pf-java-pick').addEventListener('click', async () => { try { const p = await call(window.api.pickJava()); if (p) { $('#pf-java').value = p; saveProfile({ javaPath: p }, EP().id); } } catch {} });
$('#pf-server').addEventListener('change', e => {
  const m = /^(.+):(\d+)$/.exec(e.target.value);
  saveProfile({ server: m ? { host: m[1], port: Number(m[2]) } : null }, EP().id);
});
$('#pf-dir-open').addEventListener('click', () => call(window.api.prof.openDir(EP().id)).catch(() => {}));
$('#pf-mods-edit').addEventListener('click', async () => {
  const id = EP().id;
  if (id !== S.settings.profileId) { try { S.settings = await call(window.api.prof.select(id)); afterSettings(); renderMods(); } catch { return; } }
  go('mods');
});
$('#pf-play').addEventListener('click', () => playProfile(EP().id));
$('#pf-share').addEventListener('click', () => shareProfile(EP().id));
$('#pf-dup').addEventListener('click', () => duplicateProfile(EP().id));
$('#pf-del').addEventListener('click', () => deleteProfile(EP().id));
$('#set-open-profile').addEventListener('click', () => openEditor(P().id));
// ---- genel
$('#set-onlaunch').addEventListener('change', e => save({ onLaunch: e.target.value }));
$('#set-upd').addEventListener('change', e => save({ checkUpdates: e.target.checked }));
$('#set-java').addEventListener('input', e => saveDeb({ javaPath: e.target.value.trim() }));
$('#set-dir').addEventListener('change', async e => {
  const v = e.target.value.trim();
  if (v) await save({ gameDir: v });
  e.target.value = S.settings.gameDir; // geçersizse eski değer geri gelir
});
$('#set-java-pick').addEventListener('click', async () => { try { const p = await call(window.api.pickJava()); if (p) { $('#set-java').value = p; save({ javaPath: p }); } } catch {} });
$('#set-dir-pick').addEventListener('click', async () => { try { const p = await call(window.api.pickDir()); if (p) { $('#set-dir').value = p; save({ gameDir: p }); } } catch {} });
$('#set-dir-open').addEventListener('click', () => call(window.api.openDir()).catch(() => {}));
$('#set-repair').addEventListener('click', async () => {
  try { const r = await call(window.api.repair()); toast(r.length ? `Onarıldı: ${r.length} öğe sıfırlandı, sonraki oyunda yeniden indirilecek` : 'Sıfırlanacak bir şey yoktu', 'ok'); } catch {}
});
$('#set-upd-check').addEventListener('click', () => checkUpdate(true));

// ---------- güncelleme ----------
async function checkUpdate(force) {
  try {
    const u = await call(window.api.checkUpdate(force), !force);
    S.update = u;
    $('#upd-status').textContent = u.available ? `Yeni sürüm: ${u.latest} (şu an v${u.current})` : `Güncel (v${u.current})`;
    if (u.available) {
      let hidden = null;
      try { hidden = localStorage.getItem('jl-upd-hide'); } catch {}
      if (force || hidden !== u.latest) {
        $('#update-text').textContent = `Jestron Launcher ${u.latest} çıktı.`;
        $('#update-banner').classList.remove('hidden');
      }
    } else if (force) toast('Launcher güncel', 'ok');
  } catch {
    $('#upd-status').textContent = 'Kontrol edilemedi';
  }
}
$('#update-open').addEventListener('click', () => S.update && call(window.api.openUrl(S.update.url)).catch(() => {}));
$('#update-hide').addEventListener('click', () => {
  $('#update-banner').classList.add('hidden');
  try { if (S.update) localStorage.setItem('jl-upd-hide', S.update.latest); } catch {}
});

// ---------- ana sayfa ----------
function activeModCount(p = P()) {
  if (!p || p.loader !== 'fabric') return { n: 0, names: [] };
  const names = S.info.catalog.filter(m => p.mods[m.id]).map(m => m.name);
  for (const m of p.extraMods || []) names.push(m.name);
  if (p.version === S.info.jestronMc) {
    if (p.jestronClient) names.unshift('Jestron Client');
    if (p.efektMenu) names.unshift('Efekt Menüsü');
  }
  return { n: names.length, names };
}
function favServer() {
  const list = S.settings.servers || [];
  return list.find(x => x.fav) || list[0] || null;
}
let homeServerKey = null;
function renderHome() {
  if (!S.settings || !S.info) return;
  const s = S.settings, p = P();
  const mc = activeModCount(p);
  $('#home-sub').textContent = `${p.version} · ${p.loader === 'fabric' ? 'Fabric' : 'Vanilla'}${p.loader === 'fabric' ? ' · ' + mc.n + ' mod' : ''}${p.server ? ' · ' + p.server.host : ''}`;
  $('#home-prof-name').textContent = p.name;
  $('#home-prof-dot').style.setProperty('--pc', pColor(p));
  $('#stat-time').textContent = fmtDuration(s.playtimeMs);
  $('#stat-time-sub').textContent = s.lastPlayedAt ? 'Son: ' + new Date(s.lastPlayedAt).toLocaleDateString('tr-TR') : "Launcher'dan oynanan";
  $('#stat-mods').textContent = p.loader === 'fabric' ? `${mc.n} aktif` : 'Vanilla';
  $('#stat-mods-sub').textContent = mc.names.slice(0, 3).join(', ') + (mc.names.length > 3 ? '…' : '') || '—';
  $('#stat-ram').textContent = ramText(p.ramMb);
  // Optimizasyon: sunucu kutusu sadece favori sunucu değişince yeniden çizilir
  const box = $('#home-server');
  const f = favServer();
  const key = f ? `${f.host}:${f.port}:${f.name}` : '';
  if (key === homeServerKey && box.childElementCount) { const j = $('#home-join'); if (j) j.disabled = S.launching || S.running; return; }
  homeServerKey = key;
  if (!f) {
    box.innerHTML = `<span class="dot-status"></span><div class="info"><b>Henüz sunucu yok</b><span>Kendi sunucunu ekle</span></div><button class="btn small" data-page="servers" type="button">Ekle</button>`;
    return;
  }
  box.innerHTML = `<span class="dot-status" id="home-dot"></span><div class="info"><b>${esc(f.name)}</b><span id="home-srv-state">Kontrol ediliyor…</span></div><button class="btn small" id="home-join" type="button">Bağlan</button>`;
  $('#home-join').addEventListener('click', () => play({ host: f.host, port: f.port }));
  $('#home-join').disabled = S.launching || S.running;
  pingServer(f).then(r => {
    const st = $('#home-srv-state'); if (!st || homeServerKey !== key) return;
    $('#home-dot').className = 'dot-status ' + (r.online ? 'on' : 'off');
    st.textContent = r.online ? `Açık · ${fmtNum(r.players.online)}/${fmtNum(r.players.max)} oyuncu` : 'Çevrimdışı';
  });
}
// Ana sayfadaki profil seçici
function closeProfMenu() { const m = $('#home-prof-menu'); if (m) m.classList.add('hidden'); }
$('#home-prof-btn').addEventListener('click', e => {
  e.stopPropagation();
  const m = $('#home-prof-menu');
  if (!m.classList.contains('hidden')) return closeProfMenu();
  m.innerHTML = S.settings.profiles.map(p => `<button type="button" data-pick="${esc(p.id)}" class="${p.id === S.settings.profileId ? 'sel' : ''}"><span class="pdot" style="--pc:${pColor(p)}"></span>${esc(p.name)}<small>${esc(p.version)} · ${p.loader === 'fabric' ? 'Fabric' : 'Vanilla'}</small></button>`).join('')
    + '<hr><button type="button" data-pick="__manage">Profilleri yönet…</button>';
  m.classList.remove('hidden');
});
$('#home-prof-menu').addEventListener('click', async e => {
  const b = e.target.closest('[data-pick]'); if (!b) return;
  closeProfMenu();
  if (b.dataset.pick === '__manage') return go('profiles');
  await selectProfile(b.dataset.pick);
});
document.addEventListener('click', e => { if (!e.target.closest('#home-prof')) closeProfMenu(); });

// ---------- profiller ----------
async function selectProfile(id) {
  if (id === S.settings.profileId) return true;
  try {
    S.settings = await call(window.api.prof.select(id));
    afterSettings(); renderMods();
    toast(`Profil seçildi: ${P().name}`, 'ok');
    return true;
  } catch { return false; }
}
function renderProfiles() {
  const el = $('#prof-grid');
  el.innerHTML = S.settings.profiles.map((p, i) => {
    const mc = activeModCount(p);
    const sel = p.id === S.settings.profileId;
    return `<div class="pcard ${sel ? 'sel' : ''}" data-id="${esc(p.id)}" style="--pc:${pColor(p)}">
      ${sel ? '<span class="pill-tag ok sel-tag">Seçili</span>' : ''}
      <div class="pcard-top"><div class="pcard-ico">${esc((p.name[0] || '?').toUpperCase())}</div>
        <div class="pcard-name"><b>${esc(p.name)}</b><span>${esc(p.version)} · ${p.loader === 'fabric' ? 'Fabric' : 'Vanilla'} · ${p.lastPlayedAt ? 'Son: ' + new Date(p.lastPlayedAt).toLocaleDateString('tr-TR') : 'Hiç oynanmadı'}</span></div></div>
      <div class="pcard-tags">
        <span><b>${p.loader === 'fabric' ? mc.n : 0}</b> mod</span><span><b>${ramText(p.ramMb)}</b> RAM</span>
        <span>${p.fullscreen ? 'Tam ekran' : `${p.width}×${p.height}`}</span>
        ${p.server ? `<span>→ ${esc(p.server.host)}</span>` : ''}
        ${p.playtimeMs >= 60000 ? `<span>${esc(fmtDuration(p.playtimeMs))}</span>` : ''}
      </div>
      <div class="pcard-actions">
        <button class="btn primary small" data-pact="play" type="button" ${S.launching || S.running ? 'disabled' : ''}>Oyna</button>
        <button class="btn small" data-pact="edit" type="button">Düzenle</button>
        ${sel ? '' : '<button class="icon-btn" data-pact="select" title="Seç" aria-label="Seç" type="button"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></button>'}
        <button class="icon-btn" data-pact="share" title="Kodu paylaş" aria-label="Kodu paylaş" type="button"><svg viewBox="0 0 24 24"><path d="M8 12h8M12 8l4 4-4 4"/><rect x="3" y="4" width="18" height="16" rx="4"/></svg></button>
        <button class="icon-btn" data-pact="dup" title="Kopyala" aria-label="Kopyala" type="button"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button>
        ${i > 0 ? `<button class="icon-btn" data-pact="up" title="Başa doğru taşı" aria-label="Başa doğru taşı" type="button">${icon.up}</button>` : ''}
      </div>
    </div>`;
  }).join('');
}
$('#prof-grid').addEventListener('click', async e => {
  const b = e.target.closest('[data-pact]'); if (!b) return;
  const id = b.closest('.pcard').dataset.id;
  switch (b.dataset.pact) {
    case 'play': return playProfile(id);
    case 'edit': return openEditor(id);
    case 'select': await selectProfile(id); return renderProfiles();
    case 'share': return shareProfile(id);
    case 'dup': return duplicateProfile(id);
    case 'up': try { S.settings = await call(window.api.prof.move(id, -1)); renderProfiles(); } catch {} return;
  }
});
async function playProfile(id) {
  if (S.launching || S.running) return;
  if (!(await selectProfile(id))) return;
  play();
}
async function newProfile() {
  try {
    const r = await call(window.api.prof.create({ name: 'Yeni profil' }));
    S.settings = r.settings;
    openEditor(r.id);
    toast('Profil oluşturuldu. Adını ve ayarlarını düzenle.', 'ok');
  } catch {}
}
async function duplicateProfile(id) {
  try {
    const r = await call(window.api.prof.create({ copyFrom: id }));
    S.settings = r.settings;
    openEditor(r.id);
    toast('Profil kopyalandı', 'ok');
  } catch {}
}
function deleteProfile(id) {
  const p = profById(id); if (!p) return;
  if (S.settings.profiles.length <= 1) return toast('Son profil silinemez.', 'err');
  modal({
    title: `"${p.name}" silinsin mi?`,
    body: `<p>Profil listeden kaldırılır. Oyun klasörü (<span class="mono">instances/${esc(p.dir)}</span>), dünyalar ve ekran görüntüleri silinmez.</p>`,
    actions: [
      { label: 'Vazgeç' },
      { label: 'Sil', cls: 'danger', onClick: async () => {
        try {
          S.settings = await call(window.api.prof.remove(id));
          if (S.editId === id) S.editId = null;
          afterSettings(); renderMods(); go('profiles');
          toast('Profil silindi', 'ok');
        } catch {}
      } }
    ]
  });
}
async function shareProfile(id) {
  let code;
  try { code = await call(window.api.prof.exportCode(id)); } catch { return; }
  const p = profById(id);
  modal({
    title: `${p ? p.name : 'Profil'} · profil kodu`,
    body: `<p>Bu kodu arkadaşına gönder: Profiller › <b>Kodla içe aktar</b> ile aynı sürüm, mod ve ayarlarla profil kurulur. Kodda dosya yolu, Java yolu ve hesap bilgisi yoktur.</p>
      <textarea id="code-out" readonly spellcheck="false">${esc(code)}</textarea>`,
    actions: [
      { label: 'Kapat' },
      { label: 'Kopyala', cls: 'primary', close: false, onClick: async () => {
        try { await navigator.clipboard.writeText(code); toast('Profil kodu kopyalandı', 'ok'); }
        catch { const t = $('#code-out'); t.focus(); t.select(); toast('Kod seçildi, Ctrl+C ile kopyala'); }
      } }
    ]
  });
  const t = $('#code-out'); t.focus(); t.select();
}
function importProfile() {
  let last = null;
  modal({
    title: 'Profil kodunu içe aktar',
    body: `<p>Arkadaşının paylaştığı <b>JST1-</b> ile başlayan kodu yapıştır. Yeni bir profil olarak eklenir; mevcut profillerin değişmez.</p>
      <textarea id="code-in" spellcheck="false" placeholder="JST1-…"></textarea><div id="code-prev"></div>`,
    actions: [
      { label: 'Vazgeç' },
      { label: 'İçe aktar', cls: 'primary', id: 'code-go', close: false, onClick: async () => {
        const code = $('#code-in').value.trim(); if (!code) return;
        try {
          const r = await call(window.api.prof.importCode(code));
          S.settings = r.settings;
          closeModal();
          afterSettings(); renderMods(); go('profiles');
          toast(`Profil eklendi ve seçildi: ${P().name}`, 'ok');
          if (r.dropped.length) toast(`Güvenlik/uyumluluk için atlananlar: ${r.dropped.slice(0, 4).join(', ')}${r.dropped.length > 4 ? '…' : ''}`);
        } catch {}
      } }
    ]
  });
  const go2 = $('#code-go'); go2.disabled = true;
  const prev = debounce(async () => {
    const code = $('#code-in').value.trim();
    const box = $('#code-prev');
    if (!code) { box.innerHTML = ''; go2.disabled = true; return; }
    const seq = last = Symbol();
    const r = await window.api.prof.preview(code);
    if (seq !== last || !$('#code-prev')) return;
    if (!r || !r.ok) { box.innerHTML = `<div class="preview"><span style="color:var(--bad)">${esc(r ? r.error : 'Okunamadı')}</span></div>`; go2.disabled = true; return; }
    const p = r.data.profile;
    const modN = Object.keys(p.mods).filter(k => p.mods[k]).length + p.extraMods.length;
    box.innerHTML = `<div class="preview"><b>${esc(p.name)}</b><div class="pcard-tags">
      <span><b>${esc(p.version || S.info.jestronMc)}</b> ${p.loader === 'fabric' ? 'Fabric' : 'Vanilla'}</span>
      ${p.loader === 'fabric' ? `<span><b>${modN}</b> mod</span>` : ''}${p.ramMb ? `<span><b>${ramText(Math.min(p.ramMb, S.info.maxRamMb))}</b> RAM</span>` : ''}
      ${p.server ? `<span>→ ${esc(p.server.host)}</span>` : ''}</div>
      ${r.data.dropped.length ? `<div class="warn-list">Atlanacak: ${esc(r.data.dropped.join(', '))}</div>` : ''}</div>`;
    go2.disabled = false;
  }, 250);
  $('#code-in').addEventListener('input', prev);
  $('#code-in').focus();
}
$('#prof-new').addEventListener('click', newProfile);
$('#prof-import').addEventListener('click', importProfile);

// ---------- pencere (modal) ----------
function modal({ title, body, actions }) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = body;
  const box = $('#modal-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (a.cls || 'ghost');
    if (a.id) b.id = a.id;
    b.textContent = a.label;
    b.addEventListener('click', async () => {
      if (a.onClick) { b.disabled = true; try { await a.onClick(); } finally { b.disabled = false; } }
      if (a.close !== false) closeModal();
    });
    box.appendChild(b);
  }
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-body').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) { e.stopImmediatePropagation(); closeModal(); } }, true);

$('#play-btn').addEventListener('click', () => play());

// ---------- sunucular ----------
async function pingServer(s, force) {
  const k = s.host + ':' + s.port;
  const c = S.pingCache.get(k);
  if (!force && c && Date.now() - c.at < PING_TTL) return c.r;
  let r;
  try { r = await call(window.api.ping(s.host, s.port), true); } catch { r = { online: false }; }
  S.pingCache.set(k, { at: Date.now(), r });
  return r;
}
function saveServers(list) { return save({ servers: list }); }
function renderServers(doPing, force) {
  const list = S.settings.servers || [];
  const el = $('#srv-list');
  if (!list.length) { el.innerHTML = '<div class="empty">Sunucu ekle: ad ve adres yazıp Ekle\'ye bas. İstediğin kadar ekleyebilirsin.</div>'; return; }
  el.innerHTML = list.map((s, i) => `
    <div class="srv-row" data-i="${i}" data-k="${esc(s.host + ':' + s.port)}">
      <span class="srv-icon">${esc(s.name[0] || '?').toUpperCase()}</span>
      <div class="srv-main">
        <div class="name"><span class="nm">${esc(s.name)}</span><span class="dot-status"></span></div>
        <div class="addr">${esc(s.host)}${s.port !== 25565 ? ':' + s.port : ''}</div>
      </div>
      <div class="srv-meta"><b class="pl">—</b><span class="lt">${doPing ? 'kontrol ediliyor' : ''}</span></div>
      <button class="icon-btn ${s.fav ? 'on' : ''}" data-act="fav" aria-label="Ana sayfada göster" title="Ana sayfada göster" type="button">${s.fav ? icon.starFill : icon.star}</button>
      <button class="icon-btn" data-act="up" aria-label="Yukarı" ${i === 0 ? 'disabled' : ''} type="button">${icon.up}</button>
      <button class="icon-btn" data-act="down" aria-label="Aşağı" ${i === list.length - 1 ? 'disabled' : ''} type="button">${icon.down}</button>
      <button class="icon-btn" data-act="edit" aria-label="Adı düzenle" type="button">${icon.edit}</button>
      <button class="icon-btn danger" data-act="del" aria-label="Sil" type="button">${icon.trash}</button>
      <button class="btn primary small" data-act="join" type="button">Bağlan</button>
    </div>`).join('');
  $$('#srv-list [data-act="join"]').forEach(b => (b.disabled = S.launching || S.running));
  if (!doPing) return;
  list.forEach(async s => {
    const k = s.host + ':' + s.port;
    const r = await pingServer(s, force);
    // Satır anahtarla bulunur: liste bu arada yeniden çizildiyse sonuç yanlış sunucuya yazılmaz
    const row = [...el.querySelectorAll('.srv-row')].find(x => x.dataset.k === k); if (!row) return;
    row.querySelector('.dot-status').className = 'dot-status ' + (r.online ? 'on' : 'off');
    row.querySelector('.pl').textContent = r.online ? `${fmtNum(r.players.online)}/${fmtNum(r.players.max)}` : 'Çevrimdışı';
    row.querySelector('.lt').textContent = r.online ? `${r.latency} ms · ${(r.version || '').split(' ').pop()}` : (r.error || '');
    if (r.online && r.motd) {
      const one = r.motd.replace(/\s*\n\s*/g, ' · ').trim();
      row.querySelector('.addr').textContent = `${s.host}${s.port !== 25565 ? ':' + s.port : ''} · ${one}`;
      row.querySelector('.srv-main').title = r.motd;
    }
    if (r.favicon && /^data:image\/png;base64,/.test(r.favicon)) {
      const ic = row.querySelector('.srv-icon');
      ic.innerHTML = '';
      const img = document.createElement('img');
      img.src = r.favicon; img.alt = '';
      ic.appendChild(img);
    }
  });
}
$('#srv-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const i = Number(b.closest('.srv-row').dataset.i);
  const list = [...S.settings.servers];
  const s = list[i]; if (!s) return;
  switch (b.dataset.act) {
    case 'join': return play({ host: s.host, port: s.port });
    case 'fav': list.forEach((x, j) => (x.fav = j === i ? !x.fav : false)); break;
    case 'up': if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; break;
    case 'down': if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; break;
    case 'del': list.splice(i, 1); break;
    case 'edit': {
      const nm = b.closest('.srv-row').querySelector('.nm');
      const inp = document.createElement('input');
      inp.value = s.name; inp.maxLength = 48;
      nm.replaceWith(inp); inp.focus(); inp.select();
      let finished = false;
      const done = async ok => {
        if (finished) return;
        finished = true;
        const v = inp.value.trim();
        if (ok && v && v !== s.name) { list[i] = { ...s, name: v }; await saveServers(list); }
        renderServers(true);
      };
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true), { once: true });
      return;
    }
  }
  await saveServers(list);
  renderServers(true);
});
$('#srv-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#srv-name').value.trim();
  const hp = parseHost($('#srv-host').value);
  if (!hp) return toast('Geçerli bir adres yaz (ör. play.ornek.net ya da 1.2.3.4:25565).', 'err');
  const list = [...(S.settings.servers || [])];
  if (list.some(x => x.host === hp.host && x.port === hp.port)) return toast('Bu sunucu zaten listede.', 'err');
  list.push({ id: hp.host + ':' + hp.port, name: name || hp.host, ...hp, fav: list.length === 0 });
  await saveServers(list);
  $('#srv-name').value = ''; $('#srv-host').value = '';
  renderServers(true);
  toast('Sunucu eklendi', 'ok');
});
$('#srv-refresh').addEventListener('click', () => renderServers(true, true));
$('#srv-sync').addEventListener('change', e => save({ syncServers: e.target.checked }));

// ---------- modlar ----------
function modCard(m, on, opts = {}) {
  const ico = m.icon ? `<img src="${esc(m.icon)}" alt="">` : esc((m.name || '?')[0]);
  return `<div class="mod ${on ? 'on' : ''}">
    <div class="mod-ico">${ico}</div>
    <div class="mod-body"><div class="mod-name">${esc(m.name)}${m.required ? '<span class="pill-tag">Zorunlu</span>' : ''}</div>
      <div class="mod-desc">${esc(m.desc)}</div>
      ${opts.meta || m.cat ? `<div class="mod-meta">${esc(opts.meta || m.cat)}</div>` : ''}</div>
    ${opts.button || `<span class="switch"><input type="checkbox" data-mod="${esc(m.id)}" ${on ? 'checked' : ''} ${m.required ? 'disabled' : ''} aria-label="${esc(m.name)}"><i></i></span>`}
  </div>`;
}
function renderMods() {
  const cats = ['Tümü', ...new Set(S.info.catalog.map(m => m.cat))];
  $('#mod-cats').innerHTML = cats.map(c => `<button class="chip ${c === S.modCat ? 'active' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}</button>`).join('');
  $('#mod-grid').innerHTML = S.info.catalog.filter(m => S.modCat === 'Tümü' || m.cat === S.modCat).map(m => modCard(m, P().mods[m.id])).join('');
  const extra = P().extraMods || [];
  $('#mod-extra').innerHTML = extra.length
    ? extra.map(m => modCard(m, true, { meta: 'Modrinth', button: `<button class="btn danger small" data-unextra="${esc(m.id)}" type="button">Kaldır</button>` })).join('')
    : '<div class="empty">Modrinth aramasından eklediğin modlar burada görünür.</div>';
  renderJestron();
}
function renderJestron() {
  const s = P();
  const ok = s.version === S.info.jestronMc && s.loader === 'fabric';
  const warn = ok ? '' : `<div class="notice">Bu modlar sadece <b>${esc(S.info.jestronMc)} Fabric</b> ile çalışır. <a href="#" data-editprof>Profilin sürümünü değiştir</a></div>`;
  const ef = S.efekt ? `Son sürüm: ${esc(S.efekt.version)}` : 'GitHub release\'inden indirilir';
  $('#jestron-cards').innerHTML = `
    <div class="card jcard">
      <div class="head"><h3>Jestron Client <span class="pill-tag ok">Launcher ile gelir</span></h3><span class="switch"><input type="checkbox" id="j-client" ${s.jestronClient ? 'checked' : ''} ${S.info.client.available ? '' : 'disabled'} aria-label="Jestron Client"><i></i></span></div>
      <p class="muted">Oyunda <b>Sağ Shift</b> ile açılan menü. Feather / Lunar tarzı modül kartları, sürükle-bırak HUD ve otomatik sohbet.</p>
      <div class="feat"><span>FPS · CPS · Ping</span><span>Tuşlar</span><span>Koordinat</span><span>Zırh</span><span>Hedef can</span><span>İsim üstü can</span><span>Aç/kapa koşma</span><span>Tam parlaklık</span><span>Otomatik GG</span><span>Giriş mesajı</span><span>Makrolar</span><span>Sohbet saati</span><span>Dayanıklılık uyarısı</span></div>
      ${S.info.client.available ? '' : '<p class="muted small">Bu geliştirme kopyasında mod dosyası yok; release sürümünde gelir.</p>'}
    </div>
    <div class="card jcard">
      <div class="head"><h3>Efekt Menüsü <span class="pill-tag">JestronPriv</span></h3><span class="switch"><input type="checkbox" id="j-efekt" ${s.efektMenu ? 'checked' : ''} aria-label="Efekt Menüsü"><i></i></span></div>
      <p class="muted">Kozmetikler, kanatlar, pelerinler, öldürme efektleri, reach, ping ve daha fazlası. Oyunda <b>K</b> ile ya da Jestron menüsünden açılır.</p>
      <div class="row"><span class="muted small">${ef}</span><button class="link small" id="j-efekt-gh" type="button">GitHub</button></div>
    </div>
    ${warn}`;
}
$('#jestron-cards').addEventListener('change', e => {
  if (e.target.id === 'j-client') saveProfile({ jestronClient: e.target.checked });
  if (e.target.id === 'j-efekt') saveProfile({ efektMenu: e.target.checked });
});
$('#jestron-cards').addEventListener('click', e => {
  if (e.target.id === 'j-efekt-gh') call(window.api.openUrl(`https://github.com/${S.info.efektRepo}/releases`)).catch(() => {});
});
$('#mod-cats').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { S.modCat = c.dataset.cat; renderMods(); } });
$('#mod-grid').addEventListener('change', e => {
  const id = e.target.dataset.mod; if (!id) return;
  saveProfile({ mods: { [id]: e.target.checked }, preset: 'custom' }).then(renderMods);
});
$$('[data-tab]').forEach(t => t.addEventListener('click', () => {
  $$('[data-tab]').forEach(x => x.classList.toggle('active', x === t));
  $$('.tabpane').forEach(x => x.classList.toggle('active', x.id === 'tab-' + t.dataset.tab));
  if (t.dataset.tab === 'packs') renderPacks();
}));
$('#search-type').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.searchType = b.dataset.v;
  $$('#search-type button').forEach(x => x.classList.toggle('active', x === b));
  if ($('#mod-q').value.trim()) searchMods();
});
async function searchMods() {
  const q = $('#mod-q').value.trim(); if (!q) return;
  const type = S.searchType;
  const version = P().version;
  const seq = ++S.searchSeq; // eski aramanın geç gelen sonucu yenisinin üstüne yazılmasın
  $('#mod-results').innerHTML = '<div class="empty">Aranıyor…</div>';
  let hits = [];
  try { hits = await call(window.api.search(q, version, type)); }
  catch { if (seq === S.searchSeq) $('#mod-results').innerHTML = '<div class="empty">Arama başarısız.</div>'; return; }
  if (seq !== S.searchSeq) return;
  S.lastHits = hits;
  const have = new Set([...(P().extraMods || []).map(m => m.id), ...S.info.catalog.map(m => m.id)]);
  const label = type === 'mod' ? 'Ekle' : 'İndir';
  $('#mod-results').innerHTML = hits.length ? hits.map(h => modCard(h, type === 'mod' && have.has(h.id), {
    meta: `${h.author} · ${fmtNum(h.downloads)} indirme`,
    button: type === 'mod' && have.has(h.id) ? '<button class="btn small" disabled type="button">Ekli</button>' : `<button class="btn primary small" data-add="${esc(h.id)}" type="button">${label}</button>`
  })).join('') : `<div class="empty">${esc(version)} için sonuç yok.</div>`;
}
$('#mod-search').addEventListener('click', searchMods);
$('#mod-q').addEventListener('keydown', e => { if (e.key === 'Enter') searchMods(); });
$('#mod-results').addEventListener('click', async e => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  const h = S.lastHits.find(x => x.id === b.dataset.add); if (!h) return;
  b.disabled = true;
  if (h.type === 'mod') {
    const ok = await saveProfile({ extraMods: [...(P().extraMods || []), { id: h.id, name: h.name, desc: h.desc, icon: h.icon }] });
    if (!ok) { b.disabled = false; return; }
    b.textContent = 'Ekli';
    renderMods(); toast(`${h.name} eklendi (${P().name})`, 'ok');
    return;
  }
  b.textContent = 'İndiriliyor…';
  try { const f = await call(window.api.packs.install(h.id, h.type)); b.textContent = 'İndirildi'; toast(`${f} indirildi`, 'ok'); renderPacks(); }
  catch { b.disabled = false; b.textContent = 'İndir'; }
});
$('#mod-extra').addEventListener('click', async e => {
  const b = e.target.closest('[data-unextra]'); if (!b) return;
  await saveProfile({ extraMods: (P().extraMods || []).filter(m => m.id !== b.dataset.unextra) });
  renderMods();
});
$('#mods-folder').addEventListener('click', () => call(window.api.openSub('mods')).catch(() => {}));
async function renderPacks() {
  let p;
  try { p = await call(window.api.packs.list(), true); } catch { return; }
  const row = (type, n) => `<div class="item"><span>${esc(n)}</span><button class="icon-btn danger" data-rmpack="${type}" data-name="${esc(n)}" aria-label="Sil" type="button">${icon.trash}</button></div>`;
  $('#packs-rp').innerHTML = p.resourcepack.length ? p.resourcepack.map(n => row('resourcepack', n)).join('') : '<div class="item"><span class="muted">Yok — Modrinth\'te ara › Kaynak paketi</span></div>';
  $('#packs-sh').innerHTML = p.shader.length ? p.shader.map(n => row('shader', n)).join('') : '<div class="item"><span class="muted">Yok — Modrinth\'te ara › Shader</span></div>';
}
$('#tab-packs').addEventListener('click', async e => {
  const b = e.target.closest('[data-rmpack]'); if (!b) return;
  try { await call(window.api.packs.remove(b.dataset.rmpack, b.dataset.name)); toast('Çöp kutusuna taşındı', 'ok'); renderPacks(); } catch {}
});

// ---------- galeri ----------
async function loadShots() {
  let list = [];
  try { list = await call(window.api.shots.list(), true); } catch {}
  const el = $('#shots');
  if (!list.length) { el.innerHTML = '<div class="empty">Henüz ekran görüntüsü yok. Oyunda F2\'ye bas.</div>'; return; }
  el.innerHTML = list.map(s => `
    <div class="shot" data-id="${esc(s.id)}" title="${esc(s.name)}">
      <img loading="lazy" src="jshot://s/${encodeURIComponent(s.id)}" alt="">
      <div class="bar"><span>${esc(new Date(s.time).toLocaleString('tr-TR'))}</span>
        <button data-shot="reveal" aria-label="Klasörde göster" type="button">${icon.folder}</button>
        <button data-shot="del" aria-label="Sil" type="button">${icon.trash}</button></div>
    </div>`).join('');
}
$('#shots').addEventListener('click', async e => {
  const card = e.target.closest('.shot'); if (!card) return;
  const id = card.dataset.id;
  const b = e.target.closest('[data-shot]');
  try {
    if (!b) return await call(window.api.shots.open(id));
    if (b.dataset.shot === 'reveal') return await call(window.api.shots.reveal(id));
    if (b.dataset.shot === 'del') { await call(window.api.shots.remove(id)); card.remove(); toast('Çöp kutusuna taşındı', 'ok'); }
  } catch {}
});
$('#shots-refresh').addEventListener('click', loadShots);

// ---------- konsol ----------
const logEl = $('#log');
function addLogs(lines) {
  const nearBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
  const frag = document.createDocumentFragment();
  for (const line of lines) {
    const span = document.createElement('span');
    span.className = /\b(ERROR|FATAL|Exception)\b/.test(line) ? 'e' : /\bWARN\b/.test(line) ? 'w' : line.startsWith('[Jestron]') ? 'j' : '';
    span.textContent = line + '\n';
    frag.appendChild(span);
  }
  logEl.appendChild(frag);
  const extra = logEl.childNodes.length - 3000;
  for (let i = 0; i < extra; i++) logEl.removeChild(logEl.firstChild);
  if (nearBottom) logEl.scrollTop = logEl.scrollHeight;
}
function showCrash(c) {
  if (!c) { $('#crash-card').classList.add('hidden'); return; }
  $('#crash-title').textContent = c.title + (c.code != null ? ` (kod ${c.code})` : '');
  $('#crash-hint').textContent = c.hint || '';
  $('#crash-line').textContent = c.line || '';
  $('#crash-line').classList.toggle('hidden', !c.line);
  $('#crash-card').classList.remove('hidden');
}
$('#log-copy').addEventListener('click', () => { navigator.clipboard.writeText(logEl.textContent); toast('Kopyalandı', 'ok'); });
$('#log-clear').addEventListener('click', () => { logEl.textContent = ''; showCrash(null); });
$('#log-kill').addEventListener('click', () => call(window.api.game.kill()).catch(() => {}));

// ---------- oyna ----------
function setPlayState() {
  const busy = S.launching || S.running;
  const b = $('#play-btn');
  b.disabled = busy;
  b.querySelector('span').textContent = S.running ? 'Oyunda' : S.launching ? 'Başlatılıyor…' : 'Oyna';
  $$('[data-act="join"], #home-join, [data-pact="play"], #pf-play').forEach(x => (x.disabled = busy));
}
// ---------- yükleme ekranı ----------
const LAUNCH_STEPS = [
  { at: 0, name: 'Hesap doğrulanıyor' },
  { at: 0.05, name: 'Sürüm ve Fabric' },
  { at: 0.1, name: 'Java' },
  { at: 0.25, name: 'Modlar' },
  { at: 0.4, name: 'Oyun dosyaları' },
  { at: 0.98, name: 'Oyun açılıyor' }
];
const TIPS = [
  'Oyunda Sağ Shift ile Jestron menüsünü açarsın.',
  'Menü tasarımını Jestron menüsü › Görünüm › Menü tasarımı ile değiştirebilirsin.',
  'HUD öğelerini menüdeki "HUD Düzenle" ile sürükleyip istediğin yere taşı.',
  'Oyunda F2 ile aldığın ekran görüntüleri Galeri sayfasında görünür.',
  'Sunucular sayfasına istediğin kadar sunucu ekleyebilir, birini favori yapabilirsin.',
  'Oyun çökerse Konsol sayfası nedenini ve çözümünü gösterir.',
  'Profiller › Düzenle › Performans bölümünden RAM miktarını ve ön ayarları seçebilirsin.',
  'Her profilin kendi sürümü, modları ve oyun klasörü var; Profiller sayfasından yeni profil aç.',
  'Profilini arkadaşınla paylaş: Profiller › Kodu paylaş ile tek satırlık kod oluşur.',
  'İlk açılışta dosyalar indirilir; sonraki açılışlar çok daha hızlı olur.'
];
const tickSvg = '<svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.6-5"/></svg>';
const crossSvg = '<svg viewBox="0 0 12 12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/></svg>';
const L = { open: false, pct: 0, tipI: 0, tipTimer: null, hideTimer: null, state: 'idle' };

function renderSteps() {
  const box = $('#ln-steps');
  if (!box.children.length) {
    box.innerHTML = LAUNCH_STEPS.map(st => `<li><span class="ic">${tickSvg}</span><span>${esc(st.name)}</span></li>`).join('');
  }
  let cur = 0;
  LAUNCH_STEPS.forEach((st, i) => { if (L.pct >= st.at) cur = i; });
  [...box.children].forEach((li, i) => {
    const done = L.state === 'done' || i < cur;
    const bad = L.state === 'failed' && i === cur;
    li.className = bad ? 'bad' : done ? 'ok' : (i === cur && L.state === 'busy') ? 'now' : '';
    li.querySelector('.ic').innerHTML = bad ? crossSvg : tickSvg;
  });
}
function setTip(i) {
  const el = $('#ln-tip');
  el.classList.add('fade');
  setTimeout(() => { el.textContent = TIPS[i % TIPS.length]; el.classList.remove('fade'); }, 250);
}
function showLaunch(show) {
  L.open = show;
  const el = $('#launch');
  if (show) {
    el.classList.remove('hidden', 'closing');
    $('#progress').classList.add('hidden');
  } else if (!el.classList.contains('hidden')) {
    el.classList.add('closing');
    setTimeout(() => { if (!L.open) el.classList.add('hidden'); }, 220);
  }
}
function setLaunchProgress(stage, pct) {
  L.pct = Math.max(L.pct, Math.max(0, Math.min(1, pct)));
  const p = Math.round(L.pct * 100);
  $('#ln-stage').textContent = stage;
  $('#ln-pct').textContent = p;
  $('#ln-fill').style.width = p + '%';
  $('#prog-stage').textContent = stage;
  $('#prog-pct').textContent = p + '%';
  $('#prog-fill').style.width = p + '%';
  renderSteps();
}
function endLaunch(delay) {
  clearInterval(L.tipTimer); L.tipTimer = null;
  clearTimeout(L.hideTimer);
  L.hideTimer = setTimeout(() => { showLaunch(false); $('#progress').classList.add('hidden'); L.state = 'idle'; }, delay);
}
function startLaunch(server) {
  const s = P();
  const acc = selectedAcc();
  clearTimeout(L.hideTimer);
  L.pct = 0; L.state = 'busy';
  const el = $('#launch');
  el.classList.remove('done', 'failed');
  $('#ln-kicker').textContent = 'Oyun hazırlanıyor';
  $('#ln-title').textContent = s.name;
  $('#ln-acc').textContent = acc ? acc.name : '—';
  setAvatar($('#ln-avatar'), acc);
  const tgt = server || (s.server ? { ...s.server, name: ((S.settings.servers || []).find(x => x.host === s.server.host && x.port === s.server.port) || {}).name } : null);
  $('#ln-target').textContent = tgt ? `${tgt.name || tgt.host}${!tgt.name && tgt.port && tgt.port !== 25565 ? ':' + tgt.port : ''}` : 'Ana menü';
  $('#ln-bg').textContent = 'Arka planda devam et';
  const mc = activeModCount(s);
  const presetName = { low: 'Düşük PC', balanced: 'Dengeli', high: 'Yüksek' }[s.preset] || 'Özel';
  const chips = [
    [s.version, s.loader === 'fabric' ? 'Fabric' : 'Vanilla'],
    ...(s.loader === 'fabric' ? [[mc.n, 'mod']] : []),
    [((s.ramMb || 0) / 1024).toFixed(1).replace('.0', ''), 'GB RAM'],
    [s.fullscreen ? 'Tam ekran' : `${s.width}×${s.height}`, ''],
    [presetName, 'ön ayar']
  ];
  $('#ln-chips').innerHTML = chips.map(([b, t]) => `<span>${b !== '' ? `<b>${esc(b)}</b>` : ''}${esc(t)}</span>`).join('');
  setLaunchProgress('Hazırlanıyor', 0);
  L.tipI = Math.floor(Math.random() * TIPS.length);
  $('#ln-tip').textContent = TIPS[L.tipI];
  clearInterval(L.tipTimer);
  L.tipTimer = setInterval(() => setTip(++L.tipI), 6000);
  showLaunch(true);
}
function finishLaunch(ok, msg) {
  if (L.state !== 'busy') return;
  L.state = ok ? 'done' : 'failed';
  const el = $('#launch');
  el.classList.toggle('done', ok);
  el.classList.toggle('failed', !ok);
  if (ok) {
    setLaunchProgress('Oyun penceresi açılıyor', 1);
    $('#ln-kicker').textContent = 'Oyun açıldı';
    $('#ln-bg').textContent = 'Kapat';
    endLaunch(1600);
  } else {
    $('#ln-kicker').textContent = 'Başlatılamadı';
    $('#ln-stage').textContent = msg || 'Hata';
    $('#prog-stage').textContent = msg || 'Hata';
    $('#ln-bg').textContent = 'Kapat';
    renderSteps();
    endLaunch(5000);
  }
}
$('#ln-bg').addEventListener('click', () => {
  if (L.state === 'busy') { showLaunch(false); $('#progress').classList.remove('hidden'); }
  else endLaunch(0);
});
$('#progress').addEventListener('click', () => { if (L.state === 'busy') showLaunch(true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && L.open && L.state === 'busy') { showLaunch(false); $('#progress').classList.remove('hidden'); } });

async function play(server) {
  if (S.launching || S.running) return;
  if (!selectedAcc()) { toast('Önce bir hesap ekle.', 'err'); return go('accounts'); }
  S.launching = true; setPlayState(); showCrash(null);
  const named = server && (S.settings.servers || []).find(x => x.host === server.host && x.port === server.port);
  startLaunch(server ? { ...server, name: named ? named.name : '' } : null);
  try { await call(window.api.game.launch(server ? { server } : {})); }
  catch (e) { finishLaunch(false, e.message); }
  finally { S.launching = false; setPlayState(); }
}
window.api.game.onProgress(({ stage, pct }) => { if (L.state === 'busy') setLaunchProgress(stage, pct); });
window.api.game.onLogs(addLogs);
window.api.game.onState(async st => {
  S.running = st === 'running'; setPlayState();
  if (st === 'running') finishLaunch(true);
  if (st === 'closed') {
    if (L.state === 'busy') finishLaunch(false, 'Oyun kapandı');
    try { S.settings = await call(window.api.settings.get(), true); renderHome(); } catch {}
  }
});
window.api.game.onCrash(c => { showCrash(c); toast(`${c.title}. Ayrıntı Konsol'da.`, 'err'); go('console'); });

// ---------- başlangıç ----------
const SPLASH_T0 = performance.now();
function splashStep(text, pct) {
  const st = $('#sp-status'), f = $('#sp-fill');
  if (st) st.textContent = text;
  if (f) f.style.width = Math.round(pct * 100) + '%';
}
let splashGone = false;
function hideSplash() {
  if (splashGone) return;
  splashGone = true;
  const wait = Math.max(0, 900 - (performance.now() - SPLASH_T0));
  setTimeout(() => {
    splashStep('Hazır', 1);
    setTimeout(() => {
      const sp = $('#splash');
      if (!sp) return;
      sp.classList.add('out');
      setTimeout(() => sp.remove(), 400);
    }, 200);
  }, wait);
}
setTimeout(hideSplash, 8000); // ne olursa olsun takılı kalmasın

(async function init() {
  try {
    splashStep('Ayarlar ve hesaplar yükleniyor', 0.3);
    // Optimizasyon: üç istek sırayla değil aynı anda
    [S.info, S.settings, S.accounts] = await Promise.all([call(window.api.info()), call(window.api.settings.get()), call(window.api.acc.list())]);
    $('#sp-ver').textContent = `${S.info.name} ${S.info.version}`;
    splashStep('Arayüz hazırlanıyor', 0.8);
  } catch (e) { hideSplash(); toast('Başlatma hatası: ' + e.message, 'err'); return; }
  bindSettings();
  renderAccounts();
  renderMods();
  renderServers(false);
  renderHome();
  loadVersions();
  try { addLogs(await call(window.api.game.logs(), true)); } catch {}
  try { S.running = await call(window.api.game.running(), true); } catch {}
  try { showCrash(await call(window.api.game.lastCrash(), true)); } catch {}
  setPlayState();
  hideSplash();
  if (S.settings.checkUpdates) checkUpdate(false);
  window.api.efekt(false).then(r => { if (r && r.ok) { S.efekt = r.data; renderJestron(); } });
})();
