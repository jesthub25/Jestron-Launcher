# Jestron Launcher

Minecraft: Java Edition için launcher ve oyun içi mod (Jestron). İki parça var:

| Klasör | Ne |
|---|---|
| [`launcher`](launcher) | **Jestron Launcher**: Electron uygulaması (Windows kurulum dosyası) |
| [`jestron-client`](jestron-client) | **Jestron Client**: Fabric 1.21.4 istemci modu, oyunda **Sağ Shift** ile açılan menü |

İndirmek için [Releases](https://github.com/jesthub25/Jestron-Launcher/releases) sayfasındaki `Jestron-Launcher-Setup-<sürüm>.exe` dosyasını kullan.

## Launcher

- **Minimal Açık tasarım**: koyu mod ve 6 vurgu rengi
- **Hesaplar**: Microsoft (premium) girişi; token'lar işletim sisteminin anahtarlığıyla şifrelenir. Offline hesap, listede Minecraft sahibi bir Microsoft hesabı varken açılır.
- **Sunucular**: Gömülü sunucu yok, istediğin kadar sunucu eklersin. Sıralama, favori (ana sayfada görünür), ad düzenleme, canlı ping (oyuncu sayısı, MOTD, ikon) ve tek tıkla bağlanma var. Sunucular istersen oyunun "Çok Oyunculu" listesine de yazılır; oyunda kendi eklediğin sunuculara dokunulmaz.
- **Modlar**: Fabric kataloğu, Modrinth araması (mod, kaynak paketi, shader), paket yönetimi. Zorunlu bağımlılıklar otomatik kurulur ve SHA1 ile doğrulanır.
- **Jestron modları** (1.21.4 Fabric):
  - Jestron Client launcher ile birlikte gelir.
  - [Efekt Menüsü](https://github.com/jesthub25/JestronPriv) GitHub release'inden otomatik indirilir ve güncellenir.
- **Performans ön ayarları**: Düşük PC / Dengeli / Yüksek seçenekleri RAM, Java argümanları ve modları birlikte ayarlar.
- **Galeri**: Oyun içi ekran görüntülerini gösterir; açma, klasörde gösterme ve çöpe atma var.
- **Çökme analizi**: Oyun çökünce nedenini tahmin eder (bellek, Java sürümü, mod uyumsuzluğu, sürücü, bozuk dosya) ve ne yapman gerektiğini söyler.
- **Diğer**:
  - Doğru Java sürümünü otomatik kurar.
  - İnternet yokken önceden indirilmiş dosyalarla oynanır.
  - Oyun süresini sayar.
  - "Onar" düğmesi var.
  - Güncellemeleri kontrol eder.
  - Launcher gizliyken sistem tepsisinde durur.
- **Optimizasyon**:
  - Aynı mod listesi 6 saat boyunca Modrinth'e tekrar sorulmaz.
  - Oyun logları toplu gönderilir.
  - Ping sonuçları önbelleğe alınır.

## Jestron Client (oyun içi)

Oyunda **Sağ Shift**: Feather / Lunar mantığında modül menüsü. Solda kategoriler, arama, aç/kapa kartları ve her modülün ayarları var. Sürükle-bırak HUD düzenleyiciyle konum, boyut, mıknatıslı hizalama ve ok tuşlarıyla ince ayar yapılır.

| Kategori | Modüller |
|---|---|
| HUD | FPS, CPS, Ping, Koordinatlar (+yön, biyom), Tuşlar (WASD + fare + boşluk), Zırh durumu, Saat, Hız, Bellek, Sunucu, Oturum süresi |
| PvP | Hedef can, İsim üstü can, Dayanıklılık uyarısı |
| Oynanış | Aç/Kapa koşma ve eğilme |
| Görsel | Tam parlaklık, Görünüm (açık/koyu menü, vurgu rengi, HUD stili) |
| Sohbet | Sohbet saati, Otomatik GG, Giriş mesajı, Sohbet makroları (5 tuş) |

- Otomatik mesajlar arasında en az 2.5 sn beklenir, makrolarda 1 sn; spam yapılmaz.
- Efekt Menüsü kuruluysa menüde bir kısayol çıkar. İlk açılışta, Efekt Menüsü'nün zaten gösterdiği FPS / Ping / Koordinat HUD'ları kapalı gelir.
- Ayarlar `config/jestron-client.json` dosyasındadır. Yazma atomiktir; dosya bozulursa `.bak` yedeğinden devam edilir.

## Geliştirme

```bash
# mod
cd jestron-client && ./gradlew build          # build/libs/JestronClient-*.jar

# launcher
cd launcher && npm install && npm start       # geliştirme
npm run dist                                  # dist/Jestron-Launcher-Setup-*.exe
```

Geliştirme sırasında Jestron Client'ı launcher'a eklemek için mod jar'ını `launcher/resources/mods/` klasörüne koy.

**CI**: Her push'ta mod derlenir ve gerçek bir Minecraft 1.21.4 içinde (xvfb) otomatik test edilir. Test menüyü, HUD düzenleyiciyi, yeni bir dünyada HUD'u, sohbeti, otomatik GG'yi ve Efekt Menüsü'nü açar; ekran görüntüleri `test-ekranlari` dalına konur. Ardından Windows kurulum dosyası üretilir. `v*` etiketiyle release çıkar.
