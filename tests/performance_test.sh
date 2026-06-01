#!/bin/bash

# Bu script Mini_FS projesinin performans değerlendirmesini yapmak için hazırlanmıştır.
# I/O gecikmelerini ve komut çalışma sürelerini ölçer.

make clean > /dev/null
make > /dev/null

echo "=========================================="
echo "   MINI_FS PERFORMANS DEĞERLENDİRMESİ"
echo "=========================================="
echo ""

echo "1. Disk Formatlama Performansı (10MB disk, 512B block)"
time ./mini_fs format 10240000 512
echo ""

echo "2. Çoklu Dosya Oluşturma Performansı (100 dosya)"
time (
    for i in {1..100}; do
        ./mini_fs create file_$i.txt > /dev/null
    done
)
echo ""

echo "3. Büyük Veri Yazma Performansı (Art arda I/O çağrıları)"
LONG_TEXT="Bu veri blogu ardışık yazma ve asenkron logger performansını test etmek için bilerek uzun tutulmuştur. "
LONG_TEXT="${LONG_TEXT}${LONG_TEXT}${LONG_TEXT}${LONG_TEXT}"

time (
    for i in {1..20}; do
        ./mini_fs write file_1.txt "$LONG_TEXT" > /dev/null
    done
)
echo ""

echo "4. Dosya Okuma ve Arama Performansı"
time ./mini_fs read file_1.txt > /dev/null
echo ""

echo "=========================================="
echo "TEST TAMAMLANDI."
echo "Not: 'real' süresi kullanıcının beklediği gerçek süreyi gösterir."
echo "Asenkron logger sayesinde 'real' süresi oldukça düşük seviyelerdedir."
