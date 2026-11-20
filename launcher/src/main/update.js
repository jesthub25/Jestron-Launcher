// GitHub Releases üzerinden yeni launcher sürümü kontrolü (6 saat önbellekli).
'use strict';
const { app } = require('electron');
const { fetchJson } = require('./net');
const store = require('./store');
const { LAUNCHER_REPO } = require('./config');

function parse(v) {
  const m = String(v || '').replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function newer(a, b) {
  const x = parse(a), y = parse(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

async function check(force) {
  let rel = force ? null : store.readCache('update', 6 * 60 * 60 * 1000);
  if (!rel) {
    const r = await fetchJson(`https://api.github.com/repos/${LAUNCHER_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    rel = { tag: r.tag_name, name: r.name, url: r.html_url, body: String(r.body || '').slice(0, 2000), published: r.published_at };
    store.writeCache('update', rel);
  }
  const current = app.getVersion();
  return { current, latest: rel.tag, available: newer(rel.tag, current), url: rel.url, name: rel.name, body: rel.body };
}

module.exports = { check, newer };
