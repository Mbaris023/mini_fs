# Mini Dosya Sistemi Simülatörü

## Amaç
Bu proje tek bir binary dosya üzerinde çalışan basit bir dosya sistemi simülatörü geliştirir. Gerçek bir disk yapısını simüle ederek blok yönetimi, dosya oluşturma, okuma/yazma ve metadata kontrolü gibi temel dosya sistemi davranışlarının incelenmesini ve POSIX sistem programlama konseptlerinin uygulanmasını hedefler.

## Tasarım
### disk yapısı
- **superblock:** Dosya sisteminin boyutunu, blok ölçüsünü, inode kapasitesini, boş alan ve blokların offset değerlerini içerir.
- **bitmap:** Free block (boş blok) yönetimini bitler ile sağlar. 1 (dolu), 0 (boş) şeklinde tutulur.
- **inode:** Tek seviyeli root directory (single-level root directory) mantığı kullanıldı. Dosya isimleri, boyut, tip ve veri bloklarının pointer'ları (direct blocks) doğrudan bu inode yapısında tutulur. Böylece ayrı bir directory yapısına gerek kalmadan karmaşıklık minimumda tutulmuştur.
- **block layout:** Veri blokları, bitmap ve inode kısımlarından sonra gelir ve asıl veriyi depolar. Sırasıyla Superblock -> Bitmap -> Inode -> Data Blocks düzenindedir.

### CLI komutları
Sistem terminal üzerinden şu komutlar ile kontrol edilebilir: `format`, `create`, `write`, `read`, `ls`, `rm`, `statfs`.

### logger thread mimarisi
Arka planda bağımsız bir logger thread çalışır. Loglama mesajları thread-safe (senkron) bir kuyruğa eklenir ve logger thread uyanarak bunları diske asenkron yazar. Böylece ana işlem yavaşlamaz.

## Kullanılan Sistem Programlama Kavramları
- **POSIX I/O:** `open`, `pread`, `pwrite`, `ftruncate` fonksiyonları kullanıldı.
- **pthread:** Logger sistemini arka planda asenkron yürütmek için kullanıldı.
- **mutex / condition variable:** `pthread_mutex_t fs_mutex` ile tüm dosya sistemi işlemleri yarış durumuna (race condition) karşı korundu. `log_mutex` ve `log_cond` ise log kuyruğu yönetimi ve thread'i uyandırma/uyutma senkronizasyonu için kullanıldı.
- **low-level file access:** Sistem API'leri ile doğrudan offset tabanlı erişim gerçekleştirildi.
- **logging:** `fs.log` adlı dosyaya zaman damgalı (timestamp) asenkron bir kayıt sistemi yapıldı.
- **performance measurement:** Projenin log ve dosya erişim süreleri ölçülüp thread senkronizasyon performanslarına dikkat edildi. (Kısa performans değerlendirmesi: Loglar farklı bir thread ile yazıldığı için ana `fs_write` çağrıları I/O engeline (blocking) çok fazla takılmaz. Inode arama işlemleri bellek seviyesinde doğrudan ofsetle yapıldığından I/O gecikmeleri düşüktür.)

## Çalıştırma Adımları
```bash
make
./mini_fs format 1024 256
./mini_fs create test.txt
./mini_fs write test.txt "hello"
./mini_fs read test.txt
./mini_fs ls
./mini_fs statfs
```

## Testler
- **dosya oluşturma:** `create` komutu ile farklı isimlerde boş dosyaların oluşup listelendiği doğrulandı.
- **okuma/yazma:** `write` ve `read` komutlarıyla bir veya birden fazla blok kaplayan dosyaların tutarlı şekilde içeriği döndürdüğü teyit edildi.
- **silme:** `rm` ile silinen bir dosyanın inode tablosundan kaldırılıp bloklarının bitmap'te tekrar serbest bırakıldığı doğrulandı.
- **disk doluluk testi:** Disk kapasitesi küçük tutularak (örneğin block size 256, total 1024 gibi) çok sayıda dosya eklenip sistemin "Disk full" hatasını doğru şekilde döndürdüğü tespit edildi.
- **aynı isimli dosya testi:** Aynı dosyadan birden fazla create işlemi yapıldığında sistemin çökmeden "File already exists" hatası fırlattığı teyit edildi.
- **büyük veri testi:** Bir inode için 16 doğrudan pointer verildiği göz önüne alınarak, testlerin zorlaşmaması adına block size büyük tutulmamış (örn. 256 veya 512); 4096 byte büyüklüğünde metin parçalarının başarıyla ardışık direct bloklara yazılıp okunduğu kontrol edilmiştir.

## Karşılaşılan Problemler
- **offset hesaplama hataları:** Başlangıçta inode dizisinin diskteki başlangıç bloğu hesaplanırken offset uyuşmazlığı oldu. `pwrite` çağrılarında blok numarasının byte cinsinden offset'e (`block_num * block_size`) dönüştürülmesi ile bu düzeltildi.
- **bitmap senkronizasyonu:** Başta format atılırken superblock ve inode tablolarına denk gelen ilk bloklar bitmap üzerinde işaretlenmemişti. Sistem bu alanların üzerine veri yazmaya çalışıyordu. Sonrasında metadata blokları, disk init anında bitmap'te 1 (dolu) olarak ayarlandı.
- **inode ve veri bloğu tutarlılığı:** Yazma işlemi sırasında veri daha büyükse yeni veri blokları allocate edildi, silme anında ise bu blokların eksiksiz olarak bitmap'e free block şeklinde iletilmesi sağlandı.
- **log thread kapanışı:** Uygulama kapanırken logger thread'in beklemede (wait) kalması sebebiyle program askıda kalıyordu. `logger_cleanup` fonksiyonunda `stop_logger=true` yapılıp `pthread_cond_signal` kullanılarak thread'in güvenli şekilde uyanıp kapanması sağlandı.
