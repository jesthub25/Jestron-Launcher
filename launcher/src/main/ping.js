// Minecraft Server List Ping (1.7+): oyuncu sayısı, MOTD, favicon, gecikme
const net = require('net');
const dns = require('dns').promises;

function varint(n) {
  const out = [];
  n >>>= 0;
  do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n);
  return Buffer.from(out);
}
function readVarint(buf, off) {
  let num = 0, shift = 0, b;
  do {
    if (off >= buf.length) return null;
    b = buf[off++];
    num |= (b & 0x7f) << shift;
    shift += 7;
    if (shift > 35) throw new Error('VarInt çok uzun');
  } while (b & 0x80);
  return { value: num, off };
}
function packet(id, payload) {
  const body = Buffer.concat([varint(id), payload]);
  return Buffer.concat([varint(body.length), body]);
}
function str(s) { const b = Buffer.from(s, 'utf8'); return Buffer.concat([varint(b.length), b]); }

function motdText(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.replace(/§./g, '');
  let t = d.text || '';
  if (Array.isArray(d.extra)) t += d.extra.map(motdText).join('');
  return t.replace(/§./g, '');
}

async function resolve(host, port) {
  if (port !== 25565 || net.isIP(host)) return { host, port };
  try {
    const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (srv.length) return { host: srv[0].name, port: srv[0].port };
  } catch {}
  return { host, port };
}

async function ping(hostIn, portIn = 25565, timeout = 5000) {
  const { host, port } = await resolve(hostIn, Number(portIn) || 25565);
  return new Promise((res) => {
    const sock = net.createConnection({ host, port });
    let buf = Buffer.alloc(0), start = 0, status = null, finished = false;
    const done = r => { if (finished) return; finished = true; clearTimeout(hard); sock.destroy(); res(r); };
    // setTimeout boşta kalma süresidir; yavaş veri gönderen sunucu için ayrıca kesin bir süre sınırı
    const hard = setTimeout(() => done({ online: false, error: 'Zaman aşımı' }), timeout + 1000);
    sock.setTimeout(timeout, () => done({ online: false, error: 'Zaman aşımı' }));
    sock.on('error', e => done({ online: false, error: e.code || e.message }));
    sock.on('connect', () => {
      const portBuf = Buffer.alloc(2); portBuf.writeUInt16BE(port);
      sock.write(packet(0x00, Buffer.concat([varint(-1 >>> 0), str(hostIn), portBuf, varint(1)])));
      sock.write(packet(0x00, Buffer.alloc(0)));
    });
    sock.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 1024 * 1024) return done({ online: false, error: 'Geçersiz yanıt' });
      try {
        while (true) {
          const len = readVarint(buf, 0);
          if (!len || buf.length < len.off + len.value) return;
          const body = buf.subarray(len.off, len.off + len.value);
          buf = buf.subarray(len.off + len.value);
          const id = readVarint(body, 0);
          if (id.value === 0x00 && !status) {
            const sl = readVarint(body, id.off);
            status = JSON.parse(body.subarray(sl.off, sl.off + sl.value).toString('utf8'));
            const t = Buffer.alloc(8); t.writeBigInt64BE(BigInt(Date.now()));
            start = Date.now();
            sock.write(packet(0x01, t));
          } else if (id.value === 0x01) {
            finish(Date.now() - start);
          }
        }
      } catch (e) { done({ online: false, error: 'Geçersiz yanıt' }); }
    });
    function finish(latency) {
      done({
        online: true,
        latency,
        players: status.players ? { online: status.players.online, max: status.players.max } : { online: 0, max: 0 },
        version: status.version ? status.version.name : '',
        motd: motdText(status.description),
        favicon: status.favicon || null
      });
    }
    // Bazı sunucular pong göndermez: durum alındıysa yine de sonuç dön
    sock.on('close', () => { if (status) finish(start ? Date.now() - start : -1); });
  });
}

module.exports = { ping };
