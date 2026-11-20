## Jestron Launcher 2.1.0

**Kurulum:** `Jestron-Launcher-Setup-2.1.0.exe` dosyasını indirip çalıştır. Eski sürümün üzerine kurabilirsin. Ayarların "Varsayılan" profiline taşınır; hesapların, sunucuların, dünyaların ve oyun klasörün olduğu gibi kalır.

### Yeni: Profiller (Feather tarzı)
- Sol menüde **Profiller** sayfası.
- Her profilin kendi ayarları var:
  - Sürüm ve mod yükleyici.
  - Modlar.
  - RAM, ön ayar ve JVM argümanları.
  - Çözünürlük.
  - Java yolu.
  - Direkt bağlanılacak sunucu.
  - Ayrı oyun klasörü.
- Profil oluşturma, düzenleme, kopyalama (tuş atamaları ve mod ayarları da gelir), sıralama, silme. Silinen profilin dünyaları silinmez.
- Ana sayfada profil seçici: Oyna'nın yanından tek tıkla profil değiştir.
- Profil kartlarında mod sayısı, RAM, çözünürlük, oyun süresi ve son oynama tarihi.

### Yeni: Profil kodu
- **Kodu paylaş**: profil `JST1-…` ile başlayan tek satırlık bir koda dönüşür.
- **Kodla içe aktar**: kodu yapıştırınca önce önizleme gösterir, sonra aynı ayarlarla yeni profil kurar.
- Güvenlik:
  - Kodda dosya yolu, Java yolu ve hesap bilgisi yok.
  - Komut çalıştırabilecek ya da dosya okuyabilecek JVM argümanları (`-javaagent`, `-XX:OnOutOfMemoryError` vb.) içe aktarırken atılır.
  - Bozuk ya da aşırı büyük kodlar reddedilir.

### Düzeltmeler
- Java başlatılamazsa launcher artık "Oyun zaten açık" durumunda takılmıyor.
- İnternet yokken "hesabı silip tekrar ekle" yerine doğru uyarı çıkıyor.
- Mod dosya adları doğrulanıyor; mods klasörü dışına yazma ya da silme yapılamaz.
- Sürüm adı '..' gibi bir değer olamaz, böylece Onar düğmesi yanlış klasörü silemez.
- Sunucu listesinde ping sonuçları artık yanlış satıra yazılmıyor. MOTD adresin yerine geçmiyor, yanında gösteriliyor.
- Hızlı art arda yapılan mod aramalarında eski sonuç yenisinin üstüne yazılmıyor.
- Mod eklenemezse düğme yanlışlıkla "Ekli" olmuyor.
- Yavaş veri gönderen sunucularda ping takılmıyor; kesin süre sınırı ve boyut sınırı var.
- İnternet yokken hesap resmi yerine bozuk resim simgesi çıkmıyor.
- Oyun klasörüne göreli yol yazılırsa sessizce sıfırlanmıyor, uyarı veriliyor.

### Optimizasyon
- Mod sürüm bilgileri Modrinth'ten paralel alınıyor; ilk kurulum daha hızlı.
- Java listesi 6 saat önbellekte; her açılışta Mojang'a sorulmuyor.
- Açılışta ayarlar, hesaplar ve uygulama bilgisi aynı anda yükleniyor.
- Log tamponu her satırda değil toplu kırpılıyor; çok log yazan oyunlarda launcher akıcı.
- Ana sayfa sunucu kutusu sadece favori sunucu değişince yeniden çiziliyor.

### Jestron Client 2.0.1
- Değişiklik yok: Sağ Shift menüsü, 10 tasarım, varsayılan Alt Dock.
