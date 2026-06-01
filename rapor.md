<div align="center">

# [ÜNİVERSİTE / KURUM ADI]
## [BÖLÜM ADI]

### [DERS KODU VE ADI - Örn: Sistem Programlama Proje Raporu]

<br><br>

# MINI DOSYA SİSTEMİ (MINI_FS) SİMÜLATÖRÜ
## DETAYLI PROJE RAPORU

<br><br>

**Hazırlayan:** [Adınız Soyadınız]  
**Öğrenci No:** [Öğrenci Numaranız]  
**Danışman/Öğretim Üyesi:** [Hocanın Adı]  
**Tarih:** [Tarih]

</div>

<div style="page-break-after: always;"></div>

## İÇİNDEKİLER
1. [Projenin Amacı ve Kapsamı](#1-projenin-amacı-ve-kapsamı)
2. [Mimari ve Sistem Tasarımı](#2-mimari-ve-sistem-tasarımı)
   - 2.1. Disk Yapısı
3. [Dosya Yapısı ve Kaynak Kod Modülleri](#3-dosya-yapısı-ve-kaynak-kod-modülleri)
4. [Kullanılan Sistem Programlama Kavramları](#4-kullanılan-sistem-programlama-kavramları)
   - 4.1. Çoklu İş Parçacığı (Multithreading)
   - 4.2. Senkronizasyon (Mutex ve Condition Variables)
   - 4.3. Düşük Seviye G/Ç (POSIX API)
5. [Desteklenen İşlemler (CLI)](#5-desteklenen-işlemler-cli)
6. [Performans Değerlendirmesi](#6-performans-değerlendirmesi)
7. [Testler ve Karşılaşılan Problemler](#7-testler-ve-karşılaşılan-problemler)
8. [Sonuç](#8-sonuç)

<div style="page-break-after: always;"></div>

## 1. Projenin Amacı ve Kapsamı
Bu proje, işletim sistemlerinin çekirdeğinde yer alan dosya yönetimi (File System) mantığını anlamak ve sistem programlama kavramlarını (dosya G/Ç, çoklu iş parçacığı, senkronizasyon vb.) pratikte uygulamak amacıyla geliştirilmiştir. Proje kapsamında gerçek bir hard disk yerine tek bir ikili (binary) dosya (`virtual_disk.bin`) kullanılarak çalışan basit, POSIX standartlarına uygun bir dosya sistemi simülatörü geliştirilmiştir. Geliştirilen sistem blok tahsisini, boş alan yönetimini ve inode tabanlı dosya izleme yöntemlerini eksiksiz bir biçimde simüle etmektedir.

## 2. Mimari ve Sistem Tasarımı
Sistem verilerini RAM yerine `virtual_disk.bin` dosyasına kalıcı olarak yazar. Dosya sisteminin yerleşimi (layout) mantıksal olarak 4 ana bölüme ayrılmıştır:

### 2.1. Disk Yapısı
- **Superblock (Süper Blok):** Dosya sisteminin kimliğidir. Diskin ilk bloğunda yer alır. Diskin toplam boyutunu, blok büyüklüğünü, magic numarasını (0x4D494E49), maksimum inode sayısını ve veri/bitmap bloklarının disk üzerinde hangi offset'lerden (başlangıç noktalarından) başladığını tutar.
- **Bitmap:** Veri bloklarının doluluk/boşluk durumunu bit (1 ve 0) seviyesinde takip eder. Diskteki parçalanmayı engellemek ve boş blokları hızlıca tahsis etmek için kullanılır.
- **Inode Tablosu:** Her dosyanın metadata'sını barındırır. Projede karmaşık ağaç (tree) dizin mimarisi yerine tek seviyeli (single-level) dizin mimarisi benimsenmiştir. Dosya adı, boyutu ve diskin hangi veri bloklarına yazıldığını gösteren *direct blocks* (doğrudan blok pointer'ları) Inode içerisinde tutulur.
- **Veri Blokları (Data Blocks):** Kullanıcıların dosyaya yazdıkları fiili verilerin (string, byte dizisi) diske kaydedildiği bloklardır.

### 2.2. Web Arayüzü (UI) Simülatörü
Proje mimarisine, dosya sistemi bloklarını ve çalışma mantığını görselleştiren, C kodlarından bağımsız web tabanlı bir simülatör (`ui/index.html`) dahil edilmiştir. Bu arayüz doğrudan C kodunun bellek, thread ve mutex yapısını etkilemeden eğitim ve görselleştirme amacı taşımaktadır.

## 3. Dosya Yapısı ve Kaynak Kod Modülleri
Proje, modülerliği ve kod okunabilirliğini sağlamak amacıyla farklı görevleri üstlenen C ve Header dosyalarına ayrılmıştır:

- **`include/common.h`:** Sistemin temel veri yapılarını (Superblock, Inode vb.) ve makroları (MAX_FILENAME_LEN, FS_MAGIC) barındırır. Tüm dosyaların ortak eriştiği başlık dosyasıdır.
- **`src/main.c`:** Kullanıcı arayüzünü (Command Line Interface - CLI) yönetir. Kullanıcıdan gelen `format`, `create`, `write`, `read` gibi argümanları parse ederek ilgili fonksiyonlara yönlendirir.
- **`src/fs.c` (Dosya Sistemi Çekirdeği):** Sistemin beynidir. Diski formatlama (`fs_format`), sistemi mount/unmount etme, dosya oluşturma, okuma, yazma ve silme işlemlerinin iş mantığı (business logic) burada yürütülür. Mutex kilitleri de çoğunlukla bu dosyada uygulanır.
- **`src/disk.c` & `include/disk.h`:** İşletim sistemiyle doğrudan donanım/disk seviyesinde konuşan kısımdır. `pread` ve `pwrite` çağrılarını sarmalayarak (wrap) belirli blok numaralarına veri yazıp okumayı sağlayan düşük seviyeli I/O işlemlerini yürütür.
- **`src/inode.c`:** Inode tablosunun yönetimini sağlar. İsme göre Inode arama (`inode_find_by_name`), yeni inode tahsis etme (`inode_allocate`) ve inode'ları serbest bırakma işlevlerini gerçekleştirir.
- **`src/bitmap.c`:** Bellek optimizasyonlu boş blok yönetimini üstlenir. İlgili bitleri 1 veya 0 yaparak diskin neresinin dolu, neresinin boş olduğunu hesaplar (`bitmap_allocate_block`, `bitmap_free_block`).
- **`src/logger.c`:** Asenkron loglama sistemini içerir. Arka planda çalışan bir `pthread` oluşturur, konsola yazılan işlem özetlerini `fs.log` dosyasına kaydeder.
- **`src/perf.c` & `include/perf.h`:** C çekirdeğinde çalışan sistem fonksiyonlarının çalışma sürelerini nanosaniye hassasiyetinde (`CLOCK_MONOTONIC`) ölçen ve raporlayan performans izleme modülüdür.
- **`ui/` (Web Simülatörü):** Projenin görselleştirilmesi için eklenen web tabanlı (HTML/JS/CSS) kullanıcı arayüzü dosyalarını barındırır.
- **`tests/`:** Sistemin test edilmesini otomatikleştiren bağımsız bash script'lerini (`test_suite.sh`, `test_stress.sh` vb.) barındırır.

## 4. Kullanılan Sistem Programlama Kavramları

### 4.1. Çoklu İş Parçacığı (Multithreading)
Dosya sistemi I/O (girdi/çıktı) işlemleri genellikle yavaştır. Her bir işlemde aynı zamanda log dosyasına veri yazmak ana akışı engelleyeceği (blocking) için, asenkron bir loglama mekanizması kurulmuştur. `pthread_create` ile sadece log kuyruğunu dinleyen ve diske (log dosyasına) asenkron olarak yazan bağımsız bir iş parçacığı oluşturulmuştur.

### 4.2. Senkronizasyon (Mutex ve Condition Variables)
Çoklu thread kullanımı sistemde yarış durumu (race condition) riskini doğurur.
- **`fs_mutex`:** Dosya yaratma, okuma ve yazma işlemlerinde tüm dosya sistemine bir kilit mekanizması koyarak eşzamanlılıktan kaynaklı veri bozulmalarını engeller.
- **`log_mutex` ve `log_cond`:** Logger thread'i boş yere CPU tüketmesin diye uyutulur (`pthread_cond_wait`). Ana thread kuyruğa yeni bir log mesajı attığında, koşul değişkeni sinyaliyle (`pthread_cond_signal`) uyanır, kuyruktaki mesajı yazar ve geri uyur.

### 4.3. Düşük Seviye G/Ç (POSIX API)
Projede standart `fopen/fread` yerine POSIX standartlarındaki alt seviye API'ler (`open`, `pread`, `pwrite`, `ftruncate`) kullanılmıştır. Bu sayede dosyanın başından sonuna kadar taramak yerine doğrudan hesaplanan offset'lere atlanarak rasgele erişim (random access) yapılmıştır.

## 5. Desteklenen İşlemler (CLI)
Dosya sistemi terminal üzerinden argümanlarla çalışır:
- **`./mini_fs format <boyut> <blok_boyutu>`:** Diski hedeflenen yapıya göre sıfırlar.
- **`./mini_fs create <dosya_adı>`:** Inode tahsis eder, boş dosya yaratır.
- **`./mini_fs write <dosya_adı> "<veri>"`:** Blok tahsisi yapar ve veriyi diske yazar.
- **`./mini_fs read <dosya_adı>`:** Dosyanın direct block'larındaki veriyi terminale basar.
- **`./mini_fs rm <dosya_adı>`:** Dosyayı silerek inode ve tahsis edilen blokları Bitmap üzerinde geri döndürür.
- **`./mini_fs ls`:** Dosyaları, Inode id'leri ve byte boyutlarıyla listeler.
- **`./mini_fs statfs`:** Sistemin kapasitesini (boş/dolu blok sayılarını) ve Superblock haritasını döker.

## 6. Performans Değerlendirmesi
Projenin performans ölçümü için `tests/performance_test.sh` betiği ve sistemin içerisine yerleştirilmiş `perf.c` modülü kullanılmaktadır. 
- **Nanosaniye Hassasiyetinde Ölçüm:** `CLOCK_MONOTONIC` saati kullanılarak dosya oluşturma, okuma, yazma ve silme gibi her bir dosya sistemi operasyonunun gecikme süresi `g_perf` yapısına kaydedilmekte ve terminalden (`./mini_fs perf`) raporlanabilmektedir.
- **I/O Gecikmesi ve Erişim Süresi:** Metadata'nın bellek seviyesinde modellenip ofsetlerle hızlıca disk dosyasına yansıtılması sayesinde `ls`, `read` gibi işlemler milisaniyeler içerisinde (0.001s altında) tepki vermektedir.
- **Thread Etkisi:** Asenkron Logger mimarisi sayesinde log I/O'su ana process'i bloke etmez. Büyük verilerin ardışık döngülerle yazılması durumunda dahi uygulamanın çalışma ("real" süresi) hızında gözle görülür bir I/O darboğazı yaşanmamaktadır.

## 7. Testler ve Karşılaşılan Problemler
Uygulama çeşitli zorluk testlerine (Stress Tests) tabi tutulmuştur.
- **Sınır Durum (Edge Cases) Testleri:** Aynı isimle dosya oluşturma, kapasiteyi aşma ("Disk full" tespiti) ve boş dosya okuma/silme durumları test edilip düzgün hata mesajları alındığı görülmüştür.
- **Karşılaşılan Problemler:**
  - *Offset Hesaplama Hatası:* Blok numaralarının doğrudan byte karşılıklarını bulmak zorluk yaratmıştır. Formülizasyon (`block_num * block_size`) ve `pread/pwrite` ofsetleri ile bu sorun çözülmüştür.
  - *Deadlock (Kilitlenme):* Programın sonunda log yazdırma thread'inin bitmeyi beklememesi (askıda kalması) sebebiyle terminal donması yaşanmıştır. Kapanış anında `stop_logger` bayrağı ayarlanıp bir uyandırma sinyali gönderilerek bu thread `pthread_join` fonksiyonu ile güvenli bir şekilde kapatılmıştır.

## 8. Sonuç
Mini_fs projesi; bir işletim sisteminin dosya yönetim katmanının altında yatan temel mantığı, offset hesaplamalarını, alan yönetimini ve multithreading ortamlarında veri bütünlüğünü koruyan senkronizasyon mekanizmalarını son derece modüler ve aslına sadık biçimde uygulamalı olarak sergilemiştir. Proje verilen tüm gereksinimleri başarıyla karşılamaktadır.
