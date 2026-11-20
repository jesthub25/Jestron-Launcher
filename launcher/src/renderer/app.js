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

const S = {
  info: null, settings: null, accounts: { list: [], selected: null, canOffline: false },
  versions: [], modCat: 'Tümü', searchType: 'mod', lastHits: [], running: false, launching: false,
  pingCache: new Map(), efekt: null, update: null
};
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
  $$('#sidebar .nav').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  if (page === 'servers') renderServers(true);
  if (page === 'gallery') loadShots();
  if (page === 'mods') renderPacks();
  if (page === 'console') { const l = $('#log'); l.scrollTop = l.scrollHeight; }
}
document.addEventListener('click', e => {
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
  if (!acc) { img.removeAttribute('src'); return; }
  img.onerror = () => img.removeAttribute('src');
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
  const s = S.settings;
  $$('#set-loader button').forEach(b => b.classList.toggle('active', b.dataset.v === s.loader));
  $$('#set-preset button').forEach(b => b.classList.toggle('active', b.dataset.v === s.preset));
  $$('#set-accent button').forEach((b, i) => b.classList.toggle('active', i === s.accent));
  $('#mods-vanilla-warn').classList.toggle('hidden', s.loader === 'fabric');
  $('#mods-sub').textContent = `Fabric modları · ${s.version} — oyun başlarken otomatik kurulur.`;
  renderHome();
}
function ramFill() {
  const r = $('#set-ram');
  r.style.setProperty('--fill', ((r.value - r.min) / Math.max(1, r.max - r.min) * 100) + '%');
  $('#ram-val').textContent = (r.value / 1024).toFixed(1).replace('.0', '') + ' GB';
}
function bindSettings() {
  const s = S.settings;
  $('#set-dark').checked = !!s.dark;
  $('#set-accent').innerHTML = ACCENTS.map((a, i) => `<button type="button" data-i="${i}" title="${esc(a.name)}" aria-label="${esc(a.name)}" style="background:${a.light}"></button>`).join('');
  $('#set-snap').checked = !!s.showSnapshots;
  const r = $('#set-ram');
  r.max = Math.max(2048, Math.floor(S.info.maxRamMb / 512) * 512);
  r.value = Math.min(r.max, s.ramMb);
  ramFill();
  $('#ram-hint').textContent = `Bilgisayar: ${(S.info.totalRamMb / 1024).toFixed(1)} GB · Önerilen: 4–6 GB`;
  $('#set-jvm').value = s.jvmArgs;
  $('#set-w').value = s.width; $('#set-h').value = s.height;
  $('#set-fs').checked = !!s.fullscreen;
  $('#set-onlaunch').value = s.onLaunch;
  $('#set-upd').checked = !!s.checkUpdates;
  $('#set-java').value = s.javaPath;
  $('#set-dir').value = s.gameDir;
  $('#srv-sync').checked = !!s.syncServers;
  $('#about').textContent = `${S.info.name} v${S.info.version} · github.com/${S.info.repo}`;
  afterSettings();
}
async function loadVersions() {
  try { S.versions = (await call(window.api.versions(S.settings.showSnapshots), true)).versions; }
  catch { S.versions = [{ id: S.settings.version, fabric: true }]; toast('Sürüm listesi alınamadı (internet?)', 'err'); }
  const sel = $('#set-version');
  sel.innerHTML = S.versions.map(v => `<option value="${esc(v.id)}">${esc(v.id)}${v.id === S.info.jestronMc ? '  ★ Jestron' : ''}${v.type === 'snapshot' ? ' (snapshot)' : ''}${v.fabric ? '' : ' — Fabric yok'}</option>`).join('');
  if (!S.versions.some(v => v.id === S.settings.version)) sel.insertAdjacentHTML('afterbegin', `<option value="${esc(S.settings.version)}">${esc(S.settings.version)}</option>`);
  sel.value = S.settings.version;
}
$('#set-dark').addEventListener('change', e => save({ dark: e.target.checked }));
$('#set-accent').addEventListener('click', e => { const b = e.target.closest('button'); if (b) save({ accent: Number(b.dataset.i) }); });
$('#set-version').addEventListener('change', e => {
  const v = S.versions.find(x => x.id === e.target.value);
  const patch = { version: e.target.value };
  if (v && !v.fabric && S.settings.loader === 'fabric') { patch.loader = 'vanilla'; toast(`Fabric ${v.id} desteklemiyor, Vanilla'ya geçildi.`); }
  if (e.target.value !== S.info.jestronMc && (S.settings.jestronClient || S.settings.efektMenu)) toast(`Jestron Client ve Efekt Menüsü sadece ${S.info.jestronMc}'te çalışır.`);
  save(patch);
});
$('#set-snap').addEventListener('change', async e => { await save({ showSnapshots: e.target.checked }); loadVersions(); });
$('#set-loader').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const v = S.versions.find(x => x.id === S.settings.version);
  if (b.dataset.v === 'fabric' && v && !v.fabric) return toast(`Fabric ${v.id} sürümünü desteklemiyor.`, 'err');
  save({ loader: b.dataset.v });
});
$('#set-preset').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  try { S.settings = await call(window.api.settings.preset(b.dataset.v)); bindSettings(); renderMods(); toast('Ön ayar uygulandı: ' + b.textContent, 'ok'); } catch {}
});
$('#set-ram').addEventListener('input', () => { ramFill(); saveDeb({ ramMb: Number($('#set-ram').value), preset: 'custom' }); });
$('#set-jvm').addEventListener('input', e => saveDeb({ jvmArgs: e.target.value, preset: 'custom' }));
$('#set-w').addEventListener('change', e => save({ width: Number(e.target.value) || 1280 }));
$('#set-h').addEventListener('change', e => save({ height: Number(e.target.value) || 720 }));
$('#set-fs').addEventListener('change', e => save({ fullscreen: e.target.checked }));
$('#set-onlaunch').addEventListener('change', e => save({ onLaunch: e.target.value }));
$('#set-upd').addEventListener('change', e => save({ checkUpdates: e.target.checked }));
$('#set-java').addEventListener('input', e => saveDeb({ javaPath: e.target.value.trim() }));
$('#set-dir').addEventListener('change', e => { if (e.target.value.trim()) save({ gameDir: e.target.value.trim() }); });
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
function activeModCount() {
  const s = S.settings;
  if (s.loader !== 'fabric') return { n: 0, names: [] };
  const names = S.info.catalog.filter(m => s.mods[m.id]).map(m => m.name);
  for (const m of s.extraMods || []) names.push(m.name);
  if (s.version === S.info.jestronMc) {
    if (s.jestronClient) names.unshift('Jestron Client');
    if (s.efektMenu) names.unshift('Efekt Menüsü');
  }
  return { n: names.length, names };
}
function favServer() {
  const list = S.settings.servers || [];
  return list.find(x => x.fav) || list[0] || null;
}
function renderHome() {
  if (!S.settings || !S.info) return;
  const s = S.settings;
  const mc = activeModCount();
  $('#home-sub').textContent = `${s.version} · ${s.loader === 'fabric' ? 'Fabric' : 'Vanilla'}${s.loader === 'fabric' ? ' · ' + mc.n + ' mod' : ''}`;
  $('#stat-time').textContent = fmtDuration(s.playtimeMs);
  $('#stat-time-sub').textContent = s.lastPlayedAt ? 'Son: ' + new Date(s.lastPlayedAt).toLocaleDateString('tr-TR') : "Launcher'dan oynanan";
  $('#stat-mods').textContent = s.loader === 'fabric' ? `${mc.n} aktif` : 'Vanilla';
  $('#stat-mods-sub').textContent = mc.names.slice(0, 3).join(', ') + (mc.names.length > 3 ? '…' : '') || '—';
  $('#stat-ram').textContent = (s.ramMb / 1024).toFixed(1).replace('.0', '') + ' GB';
  const box = $('#home-server');
  const f = favServer();
  if (!f) {
    box.innerHTML = `<span class="dot-status"></span><div class="info"><b>Henüz sunucu yok</b><span>Kendi sunucunu ekle</span></div><button class="btn small" data-page="servers" type="button">Ekle</button>`;
    return;
  }
  box.innerHTML = `<span class="dot-status" id="home-dot"></span><div class="info"><b>${esc(f.name)}</b><span id="home-srv-state">Kontrol ediliyor…</span></div><button class="btn small" id="home-join" type="button">Bağlan</button>`;
  $('#home-join').addEventListener('click', () => play({ host: f.host, port: f.port }));
  $('#home-join').disabled = S.launching || S.running;
  pingServer(f).then(r => {
    const st = $('#home-srv-state'); if (!st) return;
    $('#home-dot').className = 'dot-status ' + (r.online ? 'on' : 'off');
    st.textContent = r.online ? `Açık · ${fmtNum(r.players.online)}/${fmtNum(r.players.max)} oyuncu` : 'Çevrimdışı';
  });
}
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
    <div class="srv-row" data-i="${i}">
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
  list.forEach(async (s, i) => {
    const r = await pingServer(s, force);
    const row = el.querySelector(`[data-i="${i}"]`); if (!row) return;
    row.querySelector('.dot-status').className = 'dot-status ' + (r.online ? 'on' : 'off');
    row.querySelector('.pl').textContent = r.online ? `${fmtNum(r.players.online)}/${fmtNum(r.players.max)}` : 'Çevrimdışı';
    row.querySelector('.lt').textContent = r.online ? `${r.latency} ms · ${esc((r.version || '').split(' ').pop())}` : (r.error || '');
    if (r.online && r.motd) row.querySelector('.addr').textContent = r.motd.replace(/\n/g, ' · ');
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
  $('#mod-grid').innerHTML = S.info.catalog.filter(m => S.modCat === 'Tümü' || m.cat === S.modCat).map(m => modCard(m, S.settings.mods[m.id])).join('');
  const extra = S.settings.extraMods || [];
  $('#mod-extra').innerHTML = extra.length
    ? extra.map(m => modCard(m, true, { meta: 'Modrinth', button: `<button class="btn danger small" data-unextra="${esc(m.id)}" type="button">Kaldır</button>` })).join('')
    : '<div class="empty">Modrinth aramasından eklediğin modlar burada görünür.</div>';
  renderJestron();
}
function renderJestron() {
  const s = S.settings;
  const ok = s.version === S.info.jestronMc && s.loader === 'fabric';
  const warn = ok ? '' : `<div class="notice">Bu modlar sadece <b>${esc(S.info.jestronMc)} Fabric</b> ile çalışır. <a href="#" data-page="settings">Sürümü değiştir</a></div>`;
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
  if (e.target.id === 'j-client') save({ jestronClient: e.target.checked });
  if (e.target.id === 'j-efekt') save({ efektMenu: e.target.checked });
});
$('#jestron-cards').addEventListener('click', e => {
  if (e.target.id === 'j-efekt-gh') call(window.api.openUrl(`https://github.com/${S.info.efektRepo}/releases`)).catch(() => {});
});
$('#mod-cats').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { S.modCat = c.dataset.cat; renderMods(); } });
$('#mod-grid').addEventListener('change', e => {
  const id = e.target.dataset.mod; if (!id) return;
  save({ mods: { ...S.settings.mods, [id]: e.target.checked }, preset: 'custom' }).then(renderMods);
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
  $('#mod-results').innerHTML = '<div class="empty">Aranıyor…</div>';
  let hits = [];
  try { hits = await call(window.api.search(q, S.settings.version, type)); }
  catch { $('#mod-results').innerHTML = '<div class="empty">Arama başarısız.</div>'; return; }
  S.lastHits = hits;
  const have = new Set([...(S.settings.extraMods || []).map(m => m.id), ...S.info.catalog.map(m => m.id)]);
  const label = type === 'mod' ? 'Ekle' : 'İndir';
  $('#mod-results').innerHTML = hits.length ? hits.map(h => modCard(h, type === 'mod' && have.has(h.id), {
    meta: `${h.author} · ${fmtNum(h.downloads)} indirme`,
    button: type === 'mod' && have.has(h.id) ? '<button class="btn small" disabled type="button">Ekli</button>' : `<button class="btn primary small" data-add="${esc(h.id)}" type="button">${label}</button>`
  })).join('') : `<div class="empty">${esc(S.settings.version)} için sonuç yok.</div>`;
}
$('#mod-search').addEventListener('click', searchMods);
$('#mod-q').addEventListener('keydown', e => { if (e.key === 'Enter') searchMods(); });
$('#mod-results').addEventListener('click', async e => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  const h = S.lastHits.find(x => x.id === b.dataset.add); if (!h) return;
  b.disabled = true;
  if (h.type === 'mod') {
    await save({ extraMods: [...(S.settings.extraMods || []), { id: h.id, name: h.name, desc: h.desc, icon: h.icon }] });
    b.textContent = 'Ekli';
    renderMods(); toast(h.name + ' eklendi', 'ok');
    return;
  }
  b.textContent = 'İndiriliyor…';
  try { const f = await call(window.api.packs.install(h.id, h.type)); b.textContent = 'İndirildi'; toast(`${f} indirildi`, 'ok'); renderPacks(); }
  catch { b.disabled = false; b.textContent = 'İndir'; }
});
$('#mod-extra').addEventListener('click', async e => {
  const b = e.target.closest('[data-unextra]'); if (!b) return;
  await save({ extraMods: S.settings.extraMods.filter(m => m.id !== b.dataset.unextra) });
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
  $$('[data-act="join"], #home-join').forEach(x => (x.disabled = busy));
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
  'Ayarlar › Performans bölümünden RAM miktarını ve ön ayarları seçebilirsin.',
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
  const s = S.settings || {};
  const acc = selectedAcc();
  clearTimeout(L.hideTimer);
  L.pct = 0; L.state = 'busy';
  const el = $('#launch');
  el.classList.remove('done', 'failed');
  $('#ln-kicker').textContent = 'Oyun hazırlanıyor';
  $('#ln-title').textContent = `${s.loader === 'fabric' ? 'Fabric' : 'Minecraft'} ${s.version || ''}`.trim();
  $('#ln-acc').textContent = acc ? acc.name : '—';
  setAvatar($('#ln-avatar'), acc);
  $('#ln-target').textContent = server ? `${server.name || server.host}${server.port && server.port !== 25565 ? ':' + server.port : ''}` : 'Ana menü';
  $('#ln-bg').textContent = 'Arka planda devam et';
  const mc = activeModCount();
  const presetName = { low: 'Düşük PC', balanced: 'Dengeli', high: 'Yüksek' }[s.preset] || 'Özel';
  const chips = [
    [s.loader === 'fabric' ? mc.n : '', s.loader === 'fabric' ? 'mod' : 'Vanilla'],
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
    splashStep('Başlatılıyor', 0.15);
    S.info = await call(window.api.info());
    $('#sp-ver').textContent = `${S.info.name} ${S.info.version}`;
    splashStep('Ayarlar yükleniyor', 0.4);
    S.settings = await call(window.api.settings.get());
    splashStep('Hesaplar yükleniyor', 0.65);
    S.accounts = await call(window.api.acc.list());
    splashStep('Arayüz hazırlanıyor', 0.85);
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
