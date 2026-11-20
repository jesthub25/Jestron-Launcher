// Minimal, kayıpsız NBT okuyucu/yazıcı (sıkıştırılmamış; servers.dat bu biçimdedir).
// Bilinmeyen alanlar olduğu gibi korunur. Etiket: { t: tip, v: değer }.
'use strict';

const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };
const MAX_DEPTH = 64;

// Java "modified UTF-8"
function encodeMUtf8(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0x01 && c <= 0x7f) out.push(c);
    else if (c <= 0x7ff) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return Buffer.from(out);
}
function decodeMUtf8(buf) {
  let s = '';
  for (let i = 0; i < buf.length;) {
    const a = buf[i++];
    if (a < 0x80) s += String.fromCharCode(a);
    else if ((a & 0xe0) === 0xc0) { const b = buf[i++]; s += String.fromCharCode(((a & 0x1f) << 6) | (b & 0x3f)); }
    else { const b = buf[i++], c = buf[i++]; s += String.fromCharCode(((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f)); }
  }
  return s;
}

class Reader {
  constructor(buf) { this.b = buf; this.o = 0; }
  need(n) { if (this.o + n > this.b.length) throw new Error('NBT beklenmedik son'); }
  u8() { this.need(1); return this.b.readUInt8(this.o++); }
  i8() { this.need(1); return this.b.readInt8(this.o++); }
  i16() { this.need(2); const v = this.b.readInt16BE(this.o); this.o += 2; return v; }
  u16() { this.need(2); const v = this.b.readUInt16BE(this.o); this.o += 2; return v; }
  i32() { this.need(4); const v = this.b.readInt32BE(this.o); this.o += 4; return v; }
  i64() { this.need(8); const v = this.b.readBigInt64BE(this.o); this.o += 8; return v; }
  f32() { this.need(4); const v = this.b.readFloatBE(this.o); this.o += 4; return v; }
  f64() { this.need(8); const v = this.b.readDoubleBE(this.o); this.o += 8; return v; }
  str() { const n = this.u16(); this.need(n); const s = decodeMUtf8(this.b.subarray(this.o, this.o + n)); this.o += n; return s; }
  len() { const n = this.i32(); if (n < 0 || n > 16 * 1024 * 1024) throw new Error('NBT geçersiz uzunluk'); return n; }

  payload(t, depth) {
    if (depth > MAX_DEPTH) throw new Error('NBT çok derin');
    switch (t) {
      case T.BYTE: return this.i8();
      case T.SHORT: return this.i16();
      case T.INT: return this.i32();
      case T.LONG: return this.i64();
      case T.FLOAT: return this.f32();
      case T.DOUBLE: return this.f64();
      case T.BYTE_ARRAY: { const n = this.len(); this.need(n); const v = Buffer.from(this.b.subarray(this.o, this.o + n)); this.o += n; return v; }
      case T.STRING: return this.str();
      case T.LIST: {
        const et = this.u8(), n = this.len(), items = [];
        for (let i = 0; i < n; i++) items.push(this.payload(et, depth + 1));
        return { et, items };
      }
      case T.COMPOUND: {
        const entries = [];
        for (;;) {
          const ct = this.u8();
          if (ct === T.END) break;
          const name = this.str();
          entries.push([name, { t: ct, v: this.payload(ct, depth + 1) }]);
        }
        return entries;
      }
      case T.INT_ARRAY: { const n = this.len(), a = []; for (let i = 0; i < n; i++) a.push(this.i32()); return a; }
      case T.LONG_ARRAY: { const n = this.len(), a = []; for (let i = 0; i < n; i++) a.push(this.i64()); return a; }
      default: throw new Error('NBT bilinmeyen tip ' + t);
    }
  }
}

function parse(buf) {
  const r = new Reader(buf);
  const t = r.u8();
  if (t !== T.COMPOUND) throw new Error('NBT kök compound değil');
  const name = r.str();
  return { name, root: { t, v: r.payload(t, 0) } };
}

class Writer {
  constructor() { this.parts = []; }
  raw(b) { this.parts.push(b); }
  u8(v) { const b = Buffer.alloc(1); b.writeUInt8(v & 255); this.raw(b); }
  i8(v) { const b = Buffer.alloc(1); b.writeInt8(v); this.raw(b); }
  i16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v); this.raw(b); }
  i32(v) { const b = Buffer.alloc(4); b.writeInt32BE(v); this.raw(b); }
  i64(v) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v)); this.raw(b); }
  f32(v) { const b = Buffer.alloc(4); b.writeFloatBE(v); this.raw(b); }
  f64(v) { const b = Buffer.alloc(8); b.writeDoubleBE(v); this.raw(b); }
  str(s) {
    const e = encodeMUtf8(String(s));
    if (e.length > 65535) throw new Error('NBT yazı çok uzun');
    const h = Buffer.alloc(2); h.writeUInt16BE(e.length); this.raw(h); this.raw(e);
  }
  payload(t, v) {
    switch (t) {
      case T.BYTE: return this.i8(v);
      case T.SHORT: return this.i16(v);
      case T.INT: return this.i32(v);
      case T.LONG: return this.i64(v);
      case T.FLOAT: return this.f32(v);
      case T.DOUBLE: return this.f64(v);
      case T.BYTE_ARRAY: this.i32(v.length); return this.raw(Buffer.from(v));
      case T.STRING: return this.str(v);
      case T.LIST: this.u8(v.items.length ? v.et : T.END); this.i32(v.items.length); for (const it of v.items) this.payload(v.et, it); return undefined;
      case T.COMPOUND: for (const [name, tag] of v) { this.u8(tag.t); this.str(name); this.payload(tag.t, tag.v); } return this.u8(T.END);
      case T.INT_ARRAY: this.i32(v.length); for (const x of v) this.i32(x); return undefined;
      case T.LONG_ARRAY: this.i32(v.length); for (const x of v) this.i64(x); return undefined;
      default: throw new Error('NBT bilinmeyen tip ' + t);
    }
  }
  done() { return Buffer.concat(this.parts); }
}

function serialize(name, root) {
  const w = new Writer();
  w.u8(T.COMPOUND);
  w.str(name || '');
  w.payload(T.COMPOUND, root.v);
  return w.done();
}

// compound yardımcıları
const get = (entries, key) => { const e = entries.find(([n]) => n === key); return e ? e[1] : undefined; };
const set = (entries, key, tag) => { const i = entries.findIndex(([n]) => n === key); if (i >= 0) entries[i] = [key, tag]; else entries.push([key, tag]); };

module.exports = { T, parse, serialize, get, set, encodeMUtf8, decodeMUtf8 };
