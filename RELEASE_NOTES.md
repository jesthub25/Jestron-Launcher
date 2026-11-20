## Jestron Launcher 2.2.0 · Jestron Client 2.1.0

**Kurulum:** `Jestron-Launcher-Setup-2.2.0.exe` dosyasını indirip eski sürümün üzerine kur. Ayarların, profillerin ve dünyaların korunur. Jestron Client oyuna girerken kendiliğinden 2.1.0'a güncellenir.

### Launcher: mod yönetimi
- Modlar sayfasına **Yüklü** sekmesi eklendi. Profilin mods klasöründeki bütün modlar burada görünür; kendi eklediğin .jar dosyaları da dahil.
  - Her modun adı, sürümü ve ikonu gösterilir (jar içinden okunur).
  - Her mod tek tıkla açılıp kapatılır. Kendi eklediğin modda dosya `.jar.disabled` olur, Fabric onu yüklemez.
  - Launcher'ın indirdiği modlar profil ayarıyla açılıp kapanır.
  - Zorunlu modlar ve bağımlılıklar kilitlidir; hangi mod için gerektikleri yazar.
  - Kendi eklediğin mod geri dönüşüm kutusuna taşınarak silinebilir.
- **Dosyadan mod ekle**: .jar seç ya da Modlar sayfasına sürükle-bırak.
  - Forge, NeoForge ve Quilt modları tanınır ve eklenmez; nedeni gösterilir.
- **Modları şimdi indir**: katalogdan ya da Modrinth'ten seçtiğin modlar oyunu açmadan iner.
  - Bu sürüm için dosyası olmayan modlar uyarı olarak gösterilir.
- **Eklediklerim** sekmesinde Modrinth modları artık aç/kapa yapılabiliyor (önceden sadece silinebiliyordu).
- Oyun açıkken mod dosyaları değiştirilemez. "Modları şimdi indir" çalışırken oyun başlatılamaz.

### Jestron Client 2.1.0: ESC menüsü
- ESC'ye basınca açılan menü için **12 tasarım**:
  1. Minimal Kart
  2. Yan Panel
  3. Alt Dock
  4. Izgara
  5. Cam
  6. Piksel
  7. Neon
  8. Kompakt
  9. Oyuncu Kartı
  10. Tam Ekran
  11. Bilgi Paneli
  12. Üst Bar
- Değiştirmek için: Sağ Shift › Görünüm › ESC menüsü. "Vanilla" seçilirse klasik menü döner.
- Menüde neler var:
  - Oyuna dön, Jestron Menüsü, HUD Düzenle, Efekt Menüsü.
  - Ayarlar, İlerlemeler, İstatistikler, LAN'a aç, Kaydet ve çık. Bunlar vanilla'nın kendi düğmeleriyle çalışır; kaydetme ve çıkış birebir aynıdır.
  - Sunucu, ping, FPS, oturum süresi ve konum bilgisi.
- F3+Esc (menüsüz duraklatma) değişmedi.
- Oyun penceresinin görev çubuğu ikonu artık Jestron logosu, başlığı "Jestron Client 1.21.4".
