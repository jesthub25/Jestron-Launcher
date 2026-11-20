const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { USER_AGENT } = require('./config');

async function fetchRetry(url, opts = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': USER_AGENT, ...(opts.headers || {}) },
        signal: AbortSignal.timeout(opts.timeout || 30000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

async function fetchJson(url, opts) {
  const res = await fetchRetry(url, opts);
  return res.json();
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function fileOk(file, sha1) {
  if (!fs.existsSync(file)) return false;
  if (!sha1) return true;
  try { return (await sha1File(file)) === sha1.toLowerCase(); } catch { return false; }
}

// Dosyayı indirir, sha1 verilmişse doğrular. Zaten doğru dosya varsa atlar.
async function download(url, dest, sha1) {
  if (await fileOk(dest, sha1)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchRetry(url, { timeout: 120000 });
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha1) {
      const got = crypto.createHash('sha1').update(buf).digest('hex');
      if (got !== sha1.toLowerCase()) {
        if (attempt === 2) throw new Error(`SHA1 uyuşmadı: ${path.basename(dest)}`);
        continue;
      }
    }
    const tmp = dest + '.part';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dest);
    return true;
  }
  return false;
}

// Sınırlı eşzamanlılıkla iş havuzu
async function pool(items, limit, worker, onEach) {
  let i = 0, done = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
      done++;
      if (onEach) onEach(done, items.length);
    }
  });
  await Promise.all(runners);
}

module.exports = { fetchRetry, fetchJson, download, pool, sha1File };
