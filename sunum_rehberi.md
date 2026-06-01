# Mini Dosya Sistemi - Sunum ve Walkthrough Rehberi

Bu rehber, geliştirdiğiniz Mini Dosya Sistemi simülatörünü jüriye, öğretmene veya arkadaşlarınıza nasıl sunacağınızı, hangi özellikleri hangi sırayla göstereceğinizi adım adım anlatmaktadır.

## 1. Giriş ve Konsept Anlatımı (1-2 Dakika)
**Söyleyecekleriniz:**
- "Merhaba, bu projede POSIX sistem çağrılarını ve C programlamayı kullanarak, baştan sona kendi dosya sistemi simülatörümü geliştirdim."
- "Gerçek bir disk oluşturmak yerine, `virtual_disk.bin` adlı tek bir binary dosyayı bir hard disk gibi simüle ettim."
- "Projede Superblock, Inode, Bitmap ve Data block gibi standart bir Unix dosya sisteminde bulunan tüm alt yapı mevcuttur."
- "Performans ve asenkron işlemler için `pthread` kullanarak arka planda log yazan bir thread ve yarış durumlarını (race condition) engelleyen `mutex`/`cond_var` mekanizmaları kurdum."

## 2. Canlı Demo (Adım Adım Walkthrough)

### Adım 2.1: Diski Formatlama
**Terminal Komutu:**
```bash
./mini_fs format 102400 512
```
**Anlatım:** "İlk olarak diskimizi formatlıyoruz. Bu işlem toplam boyutu 100KB, blok boyutu 512 byte olan sanal diskimizi sıfırlar, Superblock'u yazar ve boş blokları takip etmek için Bitmap tablosunu başlatır."

### Adım 2.2: Dosya Sistemi Durumunu Görüntüleme (Statfs)
**Terminal Komutu:**
```bash
./mini_fs statfs
```
**Anlatım:** "Burada diskin iç durumunu görüyoruz. Magic numaramız (0x4D494E49 - 'MINI'), toplam kaç bloğumuz olduğu, Inode ve veri bloklarımızın diskin hangi ofsetlerinden başladığını açıkça görebilirsiniz."

### Adım 2.3: Dosya Oluşturma ve Listeleme
**Terminal Komutu:**
```bash
./mini_fs create merhaba.txt
./mini_fs ls
```
**Anlatım:** "Sistemde 'merhaba.txt' adında bir dosya oluşturduk. `ls` komutu Inode tablomuzu tarayarak dolu olan inode'ları (dosyalarımızı) bulur. Henüz içine bir şey yazmadığımız için boyutu 0 byte olarak görünüyor."

### Adım 2.4: Veri Yazma ve Okuma
**Terminal Komutu:**
```bash
./mini_fs write merhaba.txt "Sistem Programlama projesi harika ilerliyor!"
./mini_fs read merhaba.txt
./mini_fs ls
```
**Anlatım:** "Dosyamıza bir metin yazdık. Bu sırada sistem `bitmap` üzerinden boş blok aradı, bulduğu boş blokları `inode` yapısındaki `direct_blocks` dizisine kaydetti ve veriyi bu bloklara yazdı. `read` ile verinin tutarlı okunduğunu, `ls` ile de dosya boyutunun dinamik olarak arttığını görebiliyoruz."

### Adım 2.5: Dosya Silme (Free Block Yönetimi)
**Terminal Komutu:**
```bash
./mini_fs rm merhaba.txt
./mini_fs ls
```
**Anlatım:** "Dosyayı sildiğimizde Inode boşa çıkarılır ve dosyaya ait veri blokları, Bitmap üzerinde tekrar '0' (boş) olarak işaretlenir."

### Adım 2.6: Arka Plan Loglama Mekanizması (Thread ve Senkronizasyon)
**Terminal Komutu:**
```bash
cat fs.log
```
**Anlatım:** "Tüm bu işlemleri yaparken komut satırında gecikme hissetmedik. Çünkü loglama işlemi ana akışta değil, arka planda çalışan bir 'Logger Thread' tarafından yapılıyor. Ana akış log mesajını bir kuyruğa atıp Thread'i `pthread_cond_signal` ile uyandırır. Böylece eşzamanlılık sağlanır."

## 3. Ekstra (Edge Cases - Sınır Durumları) Gösterme
Projeyi daha profesyonel göstermek için hata yakalama mekanizmalarını deneyin:
- **Aynı isimle dosya oluşturma:** `./mini_fs create test.txt` yapıp tekrar aynısını deneyin ve `File 'test.txt' already exists.` hatasını gösterin.
- **Disk kapasitesi testi:** (İsteğe bağlı) Küçük bir format atın (`./mini_fs format 1024 256`) ve ardı ardına büyük veriler yazarak "Disk full" hatasını gösterin.

## 4. Kapanış ve Performans Değerlendirmesi Özeti
- "Gördüğünüz üzere, Inode arama işlemleri doğrudan bellek üzerinden offset ile yapıldığı için okuma/yazma süreleri çok kısadır."
- "Logger'ı asenkron çalıştırdığım için disk G/Ç dar boğazlarına takılmadan akıcı bir CLI deneyimi sağladım."
- "Geliştirme sırasında beni en çok zorlayan kısım offset hizalamaları ve thread senkronizasyonunda yaşanan deadlock'lardı, fakat bunları `mutex` kullanımı ve doğru thread-join stratejileriyle aştım."
