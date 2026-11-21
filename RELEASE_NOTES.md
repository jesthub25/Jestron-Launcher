## Jestron Launcher 2.2.3 · Jestron Client 2.1.3

**Kurulum:** `Jestron-Launcher-Setup-2.2.3.exe` dosyasını indirip eskisinin üzerine kur. Jestron Client oyuna girerken kendiliğinden 2.1.3'e güncellenir.

### Efekt Menüsü artık EfektMod
- Efekt Menüsü'nün GitHub'daki jar adı `EfektMod-<sürüm>-mc1.21.4.jar` oldu (EfektMod 1.22.0 ve sonrası). Launcher yeni adı tanır ve otomatik indirip günceller; eski 2.2.2 yeni sürümü bulamıyor, eskisinde kalıyordu.
- EfektMod'un içinde Jestron Client'ın modül menüsü de var. Launcher Jestron Client'ı da kurduğunda EfektMod'daki kopya kendiliğinden kapanır: menü, HUD ve tuşlar iki kez olmaz.

### Tarama programı uyarısı
- Bazı SS / mod tarama programları "trigger bot" uyarısı veriyordu. Böyle bir özellik yok; uyarıyı Otomatik GG'deki "ek oyun sonu kelimeleri" ayarının iç adı tetikliyordu. Ayarın iç adı değişti, hiçbir özellik değişmedi.
- Bu ayara özel kelime yazdıysan bir kez yeniden yaz (varsayılanı boş).
