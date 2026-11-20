// Jestron Launcher - genel ayarlar. Hiçbir sunucu gömülü değil: sunucuları kullanıcı launcher'dan ekler.
module.exports = {
  APP_NAME: 'Jestron Launcher',
  USER_AGENT: 'Jestron/jestron-launcher/2.0.0 (github.com/jesthub25/Jestron-Launcher)',

  // Güncelleme kontrolü ve Efekt Menüsü indirmesi için GitHub depoları
  LAUNCHER_REPO: 'jesthub25/Jestron-Launcher',
  EFEKT_REPO: 'jesthub25/JestronPriv',
  EFEKT_TAG_PREFIX: 'mod-1.21.4-v',
  EFEKT_ASSET: /^JestronPriv-Mod-.+-mc1\.21\.4\.jar$/,

  // Jestron Client ve Efekt Menüsü bu sürüm için yazıldı
  JESTRON_MC: '1.21.4',
  DEFAULT_VERSION: '1.21.4',

  // Mod kataloğu (Modrinth slug'ları). required=true olanlar kapatılamaz.
  // Zoom, Efekt Menüsü'nde (C tuşu) olduğu için Zoomify varsayılan kapalı.
  MOD_CATALOG: [
    { id: 'fabric-api', name: 'Fabric API', cat: 'Çekirdek', desc: 'Çoğu modun ihtiyaç duyduğu temel kütüphane.', required: true, def: true },
    { id: 'sodium', name: 'Sodium', cat: 'Performans', desc: 'Render motorunu yeniden yazar, FPS\'i katlar.', def: true, perf: true },
    { id: 'lithium', name: 'Lithium', cat: 'Performans', desc: 'Oyun mantığı ve tick optimizasyonu.', def: true, perf: true },
    { id: 'ferrite-core', name: 'FerriteCore', cat: 'Performans', desc: 'RAM kullanımını ciddi oranda azaltır.', def: true, perf: true },
    { id: 'entityculling', name: 'Entity Culling', cat: 'Performans', desc: 'Görünmeyen varlıkları çizmez.', def: true, perf: true },
    { id: 'immediatelyfast', name: 'ImmediatelyFast', cat: 'Performans', desc: 'HUD, metin ve varlık render hızlandırması.', def: true, perf: true },
    { id: 'dynamic-fps', name: 'Dynamic FPS', cat: 'Performans', desc: 'Oyun arka plandayken FPS\'i düşürür.', def: true, perf: true },
    { id: 'iris', name: 'Iris Shaders', cat: 'Görsel', desc: 'Sodium uyumlu shader desteği.', def: false, heavy: true },
    { id: 'continuity', name: 'Continuity', cat: 'Görsel', desc: 'Bağlantılı dokular (cam vb.).', def: false, heavy: true },
    { id: 'lambdynamiclights', name: 'LambDynamicLights', cat: 'Görsel', desc: 'Elde tutulan meşale etrafı aydınlatır.', def: false, heavy: true },
    { id: '3dskinlayers', name: '3D Skin Layers', cat: 'Görsel', desc: 'Skin katmanlarını 3 boyutlu gösterir.', def: false, heavy: true },
    { id: 'zoomify', name: 'Zoomify', cat: 'Arayüz', desc: 'Ayarlanabilir zoom. Efekt Menüsü açıksa gerek yok.', def: false },
    { id: 'appleskin', name: 'AppleSkin', cat: 'Arayüz', desc: 'Açlık ve doygunluk göstergesi.', def: true },
    { id: 'betterf3', name: 'BetterF3', cat: 'Arayüz', desc: 'Renkli ve düzenli F3 ekranı.', def: false },
    { id: 'modmenu', name: 'Mod Menu', cat: 'Arayüz', desc: 'Oyun içi mod listesi ve ayarları.', def: true },
    { id: 'xaeros-minimap', name: "Xaero's Minimap", cat: 'Arayüz', desc: 'Mini harita.', def: false },
    { id: 'no-chat-reports', name: 'No Chat Reports', cat: 'Gizlilik', desc: 'Sohbet mesajı imzalamayı kapatır.', def: false }
  ]
};
