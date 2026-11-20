// Oyun çökünce son log satırlarından olası nedeni ve çözümü bulur.
'use strict';

const RULES = [
  { re: /java\.lang\.OutOfMemoryError|GC overhead limit exceeded/i, title: 'Bellek yetmedi', hint: 'Ayarlar › Performans › Bellek (RAM) değerini artır (en az 4 GB önerilir) ya da ağır modları kapat.' },
  { re: /Could not reserve enough space|Invalid maximum heap size|Could not create the Java Virtual Machine/i, title: 'Java belleği ayıramadı', hint: 'RAM değeri bilgisayarın boşta olan belleğinden fazla. Ayarlar › Performans › Bellek değerini düşür.' },
  { re: /UnsupportedClassVersionError|has been compiled by a more recent version of the Java Runtime/i, title: 'Java sürümü uyumsuz', hint: 'Ayarlar › Launcher › Java yolu kutusunu boşalt; launcher doğru Java\'yı kendisi indirir.' },
  { re: /Incompatible mods? (found|set)|requires (any version|version) .* of|Mod resolution failed|is incompatible with/i, title: 'Mod uyumsuzluğu', hint: 'Bir mod başka bir modla ya da bu Minecraft sürümüyle uyumsuz. Modlar sekmesinde son eklediğin modu kapat. Logun ilgili satırı aşağıda.' },
  { re: /Mixin apply failed|MixinTransformerError|InvalidInjectionException|Critical injection failure/i, title: 'Mod yükleme hatası (mixin)', hint: 'Bir mod bu sürümde düzgün yüklenemedi. Son eklediğin modu kapatıp tekrar dene.' },
  { re: /GLFW error 65542|WGL: The driver does not appear to support OpenGL|Pixel format not accelerated|OpenGL.*not supported/i, title: 'Ekran kartı sürücüsü', hint: 'Ekran kartı sürücünü güncelle. Dizüstünde oyunu yüksek performanslı GPU ile çalıştırmayı dene.' },
  { re: /EXCEPTION_ACCESS_VIOLATION|SIGSEGV|A fatal error has been detected by the Java Runtime/i, title: 'Yerel çökme', hint: 'Genelde sürücü ya da shader kaynaklıdır. Iris\'i kapatmayı ve sürücüleri güncellemeyi dene.' },
  { re: /Failed to download file|java\.net\.(UnknownHost|SocketTimeout|Connect)Exception/i, title: 'İndirme / bağlantı hatası', hint: 'İnternet bağlantını kontrol et. Ayarlar › Bakım › Onar ile dosyaları yeniden indirtebilirsin.' },
  { re: /ZipException|invalid (LOC|CEN) header|zip END header not found|Corrupted|error in opening zip file/i, title: 'Bozuk dosya', hint: 'İndirilen bir dosya bozuk. Ayarlar › Bakım › Onar\'a bas, sonra tekrar oyna.' }
];

/** @param {string[]} lines son log satırları  @returns {{title, hint, line}|null} */
function analyze(lines, code) {
  const text = lines.slice(-600);
  for (const r of RULES) {
    for (let i = text.length - 1; i >= 0; i--) {
      if (r.re.test(text[i])) return { title: r.title, hint: r.hint, line: text[i].slice(0, 300) };
    }
  }
  if (code !== 0) return { title: 'Oyun beklenmedik şekilde kapandı', hint: 'Bilinen bir neden bulunamadı. Konsol çıktısını kopyalayıp paylaşabilirsin.', line: '' };
  return null;
}

module.exports = { analyze };
