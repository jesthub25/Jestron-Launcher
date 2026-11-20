const crypto = require('crypto');
const { Auth } = require('msmc');
const store = require('./store');

function errText(e) {
  const s = typeof e === 'string' ? e : (e && (e.ts || e.message || e.name)) || String(e);
  if (s.includes('gui.closed')) return 'Giriş penceresi kapatıldı.';
  if (s.includes('entitlements') || s.includes('minecraft.profile')) return 'Bu Microsoft hesabında Minecraft: Java Edition yok.';
  if (s.includes('xsts.userNotFound') || s.includes('2148916233')) return 'Bu Microsoft hesabına bağlı Xbox profili yok. minecraft.net üzerinden bir kez giriş yap.';
  if (s.includes('2148916238')) return 'Çocuk hesabı: bir aile grubuna eklenmesi gerekiyor.';
  return 'Giriş başarısız: ' + s;
}

function isNetError(e) {
  const s = String((e && (e.code || (e.cause && e.cause.code) || e.message || e.ts)) || e);
  return /ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|fetch failed|network|socket hang up|timeout/i.test(s);
}

// Sunucuların offline-mode'da kullandığı UUID ile aynı: v3 MD5("OfflinePlayer:" + isim)
function offlineUuid(name) {
  const h = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  return h.toString('hex');
}

async function addMicrosoft() {
  try {
    const auth = new Auth('select_account');
    const xbox = await auth.launch('electron', {
      width: 500, height: 650, resizable: false, title: 'Microsoft ile Giriş', autoHideMenuBar: true
    });
    const mc = await xbox.getMinecraft();
    if (mc.isDemo()) throw 'entitlements';
    const a = store.getAccountsRaw();
    const id = 'ms-' + mc.profile.id;
    a.list = a.list.filter(x => x.id !== id);
    a.list.push({ id, type: 'microsoft', name: mc.profile.name, uuid: mc.profile.id, owned: true, refresh: store.enc(xbox.save()) });
    a.selected = id;
    store.saveAccountsRaw(a);
    return store.publicAccounts();
  } catch (e) {
    throw new Error(errText(e));
  }
}

function addOffline(name) {
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('Kullanıcı adı 3-16 karakter olmalı (harf, rakam, _).');
  const a = store.getAccountsRaw();
  if (!a.list.some(x => x.type === 'microsoft' && x.owned)) {
    throw new Error('Offline hesap eklemek için önce Minecraft sahibi bir Microsoft hesabı ekle.');
  }
  const id = 'off-' + name.toLowerCase();
  a.list = a.list.filter(x => x.id !== id);
  a.list.push({ id, type: 'offline', name, uuid: offlineUuid(name), owned: false });
  a.selected = id;
  store.saveAccountsRaw(a);
  return store.publicAccounts();
}

function remove(id) {
  const a = store.getAccountsRaw();
  a.list = a.list.filter(x => x.id !== id);
  // Son premium hesap silinince offline hesaplar da kaldırılır
  if (!a.list.some(x => x.type === 'microsoft' && x.owned)) a.list = a.list.filter(x => x.type !== 'offline');
  if (!a.list.some(x => x.id === a.selected)) a.selected = a.list[0] ? a.list[0].id : null;
  store.saveAccountsRaw(a);
  return store.publicAccounts();
}

function select(id) {
  const a = store.getAccountsRaw();
  if (a.list.some(x => x.id === id)) { a.selected = id; store.saveAccountsRaw(a); }
  return store.publicAccounts();
}

// Oyunu başlatmak için MCLC auth nesnesi döndürür
async function getLaunchAuth() {
  const a = store.getAccountsRaw();
  const acc = a.list.find(x => x.id === a.selected);
  if (!acc) throw new Error('Önce bir hesap ekle.');

  if (acc.type === 'microsoft') {
    try {
      const auth = new Auth('select_account');
      const xbox = await auth.refresh(store.dec(acc.refresh));
      const mc = await xbox.getMinecraft();
      if (mc.isDemo()) throw 'entitlements';
      acc.refresh = store.enc(xbox.save());
      acc.name = mc.profile.name;
      store.saveAccountsRaw(a);
      const mclcAuth = mc.mclc();
      mclcAuth.user_properties = '{}'; // eski sürümlerde (<=1.12) argüman kaymasını önler
      return { auth: mclcAuth, name: acc.name, uuid: acc.uuid, type: 'microsoft' };
    } catch (e) {
      // İnternet / Microsoft sunucusu sorunu: hesabı silmek gerekmez, tekrar denemek yeter
      if (isNetError(e)) throw new Error('Microsoft sunucularına ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.');
      throw new Error(errText(e) + ' Hesabı silip tekrar ekle.');
    }
  }

  if (!a.list.some(x => x.type === 'microsoft' && x.owned)) {
    throw new Error('Offline oynamak için listede premium bir Microsoft hesabı olmalı.');
  }
  return {
    auth: {
      access_token: crypto.randomBytes(16).toString('hex'),
      client_token: crypto.randomUUID(),
      uuid: acc.uuid,
      name: acc.name,
      user_properties: '{}',
      meta: { type: 'legacy', xuid: '0' }
    },
    name: acc.name, uuid: acc.uuid, type: 'offline'
  };
}

module.exports = { addMicrosoft, addOffline, remove, select, getLaunchAuth, offlineUuid };
